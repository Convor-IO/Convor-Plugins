import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";

const base = new URL(process.env.CONVOR_GUIDE_URL ?? "http://localhost:18219");
if (!["localhost", "127.0.0.1"].includes(base.hostname))
  throw new Error("Local QA only");
const expectedZip = createHash("sha256")
  .update(readFileSync("dist/prestashop/convor.zip"))
  .digest("hex");
const browser = await chromium.launch({ headless: true });
try {
  for (const locale of ["en", "pl"]) {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({
        viewport: { width, height: 950 },
        locale: locale === "pl" ? "pl-PL" : "en-US",
      });
      try {
        await page
          .context()
          .route("**/*", (route) =>
            new URL(route.request().url()).origin === base.origin
              ? route.continue()
              : route.abort(),
          );
        const response = await page.goto(
          new URL(`/${locale}/docs/integrations/prestashop-integration`, base)
            .href,
          { waitUntil: "domcontentloaded" },
        );
        expect(response?.status()).toBe(200);
        const article = page.locator("article#nd-page");
        await expect(article.locator("h1")).toBeVisible();
        const download = article
          .locator('a[href="/downloads/prestashop/convor.zip"]')
          .first();
        await expect(download).toBeVisible();
        const zip = await page.request.get(
          new URL("/downloads/prestashop/convor.zip", base).href,
        );
        expect(zip.status()).toBe(200);
        assert.equal(
          createHash("sha256")
            .update(await zip.body())
            .digest("hex"),
          expectedZip,
        );
        const figures = article.locator("figure.cv-doc-screenshot");
        await expect(figures).toHaveCount(8);
        for (const figure of await figures.all()) {
          const button = figure.locator('button[aria-haspopup="dialog"]');
          const img = button.locator("img");
          await img.scrollIntoViewIfNeeded();
          await img.evaluate((el) => el.decode());
          expect((await img.getAttribute("alt"))?.length ?? 0).toBeGreaterThan(
            20,
          );
          await button.focus();
          await expect(button).toBeFocused();
          await button.press("Enter");
          const dialog = figure.locator("dialog");
          await expect(dialog).toBeVisible();
          await expect(dialog.locator("img")).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(dialog).not.toBeVisible();
          await expect(button).toBeFocused();
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 2,
          ),
        ).toBe(true);
        console.log(
          `PASS ${locale} ${width}px: HTTP 200, exact ZIP, eight images, Enter/Escape and focus restoration, no horizontal page overflow`,
        );
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
}
