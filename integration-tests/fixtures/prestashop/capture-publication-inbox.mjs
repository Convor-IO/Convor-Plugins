// Real inbox screenshot from the shared publication roster, not retouched UI.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const api = "http://localhost:17243",
  dashboard = "http://localhost:17244";
const server = "convor-feat-prestashop-finalization-1807-dev-server-1";
assert.equal(process.env.CONVOR_API_URL, api);
assert.equal(process.env.CONVOR_DASHBOARD_URL, dashboard);
assert.equal(
  execFileSync(
    "docker",
    [
      "inspect",
      "-f",
      '{{ index .Config.Labels "com.docker.compose.project" }}',
      server,
    ],
    { encoding: "utf8" },
  ).trim(),
  "convor-feat-prestashop-finalization-1807-dev",
);
const org = process.env.CONVOR_ORG_ID,
  project = process.env.CONVOR_PROJECT_ID;
assert.match(org ?? "", /^[a-f0-9-]{36}$/);
assert.match(project ?? "", /^[a-f0-9-]{36}$/);
const { marketingPeople } = await import(
  new URL(
    "../../../../../../saas/.worktrees/feat-prestashop-finalization-1807/tests/fixtures/marketing-people/index.mjs",
    import.meta.url,
  )
);
const names = marketingPeople.map((p) => p.name);
const out = resolve(
  process.env.CONVOR_DOCS_SCREENSHOTS ?? "dist/prestashop-publication-inbox",
);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const locale of ["en", "pl"]) {
    execFileSync(
      "docker",
      [
        "exec",
        "-w",
        "/app/apps/server",
        server,
        "/app/scripts/compose-pnpm.sh",
        "exec",
        "tsx",
        "/app/tests/fixtures/marketing-people/apply.ts",
        org,
        locale,
        project,
      ],
      { stdio: "inherit" },
    );
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1160 },
      deviceScaleFactor: 2,
      locale: locale === "pl" ? "pl-PL" : "en-US",
      colorScheme: "light",
    });
    try {
      const allowed = new Set([
        api,
        dashboard,
        "http://localhost:17242",
        "ws://localhost:17242",
      ]);
      await context.route("**/*", (route) =>
        allowed.has(new URL(route.request().url()).origin)
          ? route.continue()
          : route.abort(),
      );
      await context.addCookies([
        { name: "convor_dashboard_lang", value: locale, url: dashboard },
      ]);
      const login = await context.request.post(
        api + "/api/auth/sign-in/email",
        {
          headers: { Origin: dashboard },
          data: {
            email: process.env.CONVOR_TEST_EMAIL,
            password: process.env.CONVOR_TEST_PASSWORD,
          },
        },
      );
      assert.equal(login.status(), 200);
      const page = await context.newPage();
      await page.goto(
        dashboard + "/o/" + org + "/conversations?projectId=" + project,
        { waitUntil: "domcontentloaded", timeout: 120000 },
      );
      const question =
        locale === "pl"
          ? "Dzień dobry! Jak dobrać rozmiar tej koszulki?"
          : "Hello! How do I choose the right size for this T-shirt?";
      const answer =
        locale === "pl"
          ? "Dzień dobry! Podaj proszę obwód klatki piersiowej, a pomogę Ci dobrać rozmiar."
          : "Hello! Let me know your chest measurement and I'll help you choose a size.";
      const row = page
        .getByTestId("conversation-list-scroll")
        .getByText(answer, { exact: false })
        .first();
      await expect(row).toBeVisible({ timeout: 120000 });
      await row.click();
      await expect(
        page.getByText(question, { exact: true }).last(),
      ).toBeVisible({ timeout: 60000 });
      await expect(page.getByText(answer, { exact: true }).last()).toBeVisible({
        timeout: 30000,
      });
      const workspace = page.getByTestId("conv-layout");
      await expect(workspace).toBeVisible();
      await expect(workspace).not.toContainText(
        /(?:Gość|Guest)\s+V-|PrestaShop QA|Lorem ipsum|Convor operator \d+/i,
      );
      const displayed = await workspace.innerText();
      assert.ok(
        names.filter((name) => displayed.includes(name)).length >= 3,
        "Multiple full publication names visible",
      );
      const avatars = workspace.locator('img[src*="publication-people"]');
      try {
        await expect
          .poll(() => avatars.count(), { timeout: 15000 })
          .toBeGreaterThanOrEqual(3);
      } catch (error) {
        console.log(
          "Avatar render diagnostic:",
          await workspace
            .locator("[data-avatar-kind], img")
            .evaluateAll((elements) =>
              elements.slice(0, 30).map((element) => ({
                tag: element.tagName,
                kind: element.getAttribute("data-avatar-kind"),
                src: element.getAttribute("src")?.split("?")[0],
                loaded:
                  element instanceof HTMLImageElement
                    ? element.naturalWidth
                    : null,
              })),
            ),
        );
        throw error;
      }
      await expect
        .poll(
          () =>
            avatars.evaluateAll((images) =>
              images.every((img) => img.complete && img.naturalWidth > 0),
            ),
          { timeout: 30000 },
        )
        .toBe(true);
      // Collapse the real device panel; the synthetic network address is not publication content.
      const device = page.getByRole("button", {
        name: locale === "pl" ? "Urządzenie" : "Device",
        exact: true,
      });
      await device.click();
      await expect(workspace).not.toContainText(
        /(?:IP Address|Adres IP):\s*\d+\.\d+\.\d+\.\d+/i,
      );
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: resolve(out, locale + "-prestashop-inbox.png"),
        animations: "disabled",
      });
      console.log(
        "PASS actual publication inbox:",
        locale,
        "loaded portraits:",
        await avatars.count(),
      );
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
