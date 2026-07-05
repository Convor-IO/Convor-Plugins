import {expect, test} from "@playwright/test";

/**
 * Full chat-flow E2E: open the bubble → type a message → send → confirm it
 * round-trips through the SaaS backend and renders in the widget.
 *
 * Prerequisites (documented in integration-tests/README.md):
 *   - SaaS test infra up: docker compose -f saas/docker/docker-compose.test.yml up -d
 *     (postgres-test :10010, redis-test :10011, centrifugo-test :10012)
 *   - SaaS server running on :3000 against the test DB
 *     (cd saas/apps/server && node --env-file=.env --import tsx/esm src/index.ts)
 *   - Widget built: cd saas/apps/widget && pnpm build
 *   - Widget proxy on :5173: node plugins/integration-tests/fixtures/widget-proxy.js
 *     (serves widget dist + proxies /api + /connection to :3000)
 *   - WordPress on :8080 with the Convor plugin activated, slug=test-org,
 *     api_base=http://localhost:5173, AND the mu-plugin override that sets
 *     widgetUrl=http://localhost:5173/widget-iframe.html.
 *
 * What this proves end-to-end:
 *   1. The widget mounts + the launcher is visible.
 *   2. Clicking the launcher opens the chat panel.
 *   3. Typing + sending a message POSTs to /api/conversations and creates
 *      a real conversation row in the SaaS DB.
 *   4. The visitor's own message echoes back via the realtime channel and
 *      renders in the message list.
 *
 * The most ambitious of the integration tests — exercises the full path:
 * WP plugin → widget loader → iframe → proxy → SaaS server → Postgres +
 * Centrifugo → back to the iframe via WS.
 */

const WP_URL = process.env.WP_URL ?? "http://localhost:8080";

test("full chat flow: visitor sends a message and sees it echoed", async ({
  page,
}) => {
  await page.goto(WP_URL, {waitUntil: "networkidle"});

  // 1. The launcher trigger is visible in the parent page.
  await expect(page.locator(".convor-trigger")).toBeVisible({timeout: 15_000});

  // 2. Open the chat panel.
  await page.locator(".convor-trigger").click();

  // 3. The widget iframe is now showing the chat UI. Switch into it.
  const widget = page.frameLocator('iframe[src*="widget-iframe.html"]');
  // The welcome screen shows a "Write a message to start…" textarea that
  // doubles as the conversation starter. Target it by placeholder.
  const input = widget.getByPlaceholder("Write a message to start…");
  const sendBtn = widget.locator(".convor-input__send").first();

  // Wait for the input to mount (the widget connects to Centrifugo first).
  await expect(input).toBeVisible({timeout: 20_000});

  // 4. Type a unique message so we can grep for it on the way back.
  const messageText = `E2E probe ${Date.now()}`;
  await input.fill(messageText);
  await sendBtn.click();

  // 5. The message round-trips: POST /api/conversations → server stores it →
  //    Centrifugo broadcasts it back → widget renders it in the message list.
  //    Assert our text appears in the rendered message bubbles within 15s
  //    (covers the full network + WS subscription path).
  await expect(
    widget.locator(".convor-msg__bubble", {hasText: messageText})
  ).toBeVisible({timeout: 15_000});
});
