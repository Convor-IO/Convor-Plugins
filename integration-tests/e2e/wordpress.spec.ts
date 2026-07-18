import {expect, test} from "@playwright/test";

/**
 * Real-browser E2E against a real WordPress install.
 *
 * Prerequisites (documented in integration-tests/fixtures/wordpress/README.md):
 *   - WordPress booted via docker compose (port 8080) with our plugin activated
 *     and convor_settings.org_slug = "acme", api_base = the widget dev server.
 *   - The Convor widget dev server running on http://localhost:5173
 *     (cd saas && pnpm --filter @convor/widget dev).
 *
 * What this proves (that the PHP shim test cannot):
 *   - The script tag actually loads in a real Chromium render.
 *   - `window.ConvorWidget` becomes defined (the loader executed).
 *   - The trigger-button iframe is injected into the page.
 *
 * What this does NOT prove:
 *   - The chat bubble opening / sending a message — that requires the full
 *     SaaS backend (server + DB + Centrifugo) which isn't running here.
 *     The iframe loads but its content depends on the backend responding
 *     to /api/widget/config and /api/auth/visitor-token.
 */

const WP_URL = process.env.WP_URL ?? "http://localhost:8080";
// The apiBase configured in WP's convor_settings option. The WP container
// reaches the host's widget dev server via host.docker.internal; the browser
// (running on the host) sees the same URL embedded in the page.
const WIDGET_API_BASE = process.env.WIDGET_API_BASE ?? "http://localhost:5173";
// The org slug configured in convor_settings.org_slug. Matches the seeded
// org in the SaaS test DB (apps/server/src/test-seed.ts → TEST_ORG_SLUG).
const ORG_SLUG = process.env.ORG_SLUG ?? "test-org";

test("real WordPress: widget <script> loads and the trigger button mounts", async ({
  page,
}) => {
  const scriptRequests: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("widget.js")) {
      scriptRequests.push(req.url());
    }
  });

  await page.goto(WP_URL);

  // 1. The canonical script tag is present in the rendered HTML.
  const scriptTag = page.locator(
    `script[src*="/widget.js"][data-key="${ORG_SLUG}"]`
  );
  await expect(scriptTag).toHaveCount(1);
  await expect(scriptTag).toHaveAttribute(
    "src",
    `${WIDGET_API_BASE}/widget.js`
  );

  // 2. The browser actually fetched /widget.js.
  await expect.poll(() => scriptRequests.length, {timeout: 10_000}).toBe(1);

  // 3. The loader executed: window.ConvorWidget is defined.
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const w = window as Window & {ConvorWidget?: unknown};
          return typeof w.ConvorWidget;
        }),
      {timeout: 10_000}
    )
    .toBe("object");

  // 4. The trigger button iframe is injected. The embed loader creates
  //    an <iframe> pointing at widget-iframe.html — that's the visible
  //    chat bubble housing. It mounts even without a backend (the iframe
  //    URL is constructed before any network call).
  const triggerFrame = page.frameLocator(`iframe[src*="widget-iframe.html"]`);
  // We don't assert on the iframe's content (depends on backend); just that
  // the frame exists, proving the loader ran to completion.
  await expect(triggerFrame.owner()).toBeVisible({timeout: 15_000});
});
