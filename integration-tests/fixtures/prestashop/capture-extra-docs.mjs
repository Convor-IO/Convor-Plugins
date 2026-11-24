// Real screenshots from the owned disposable store, not a mock UI.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const shop = "http://localhost:18217";
const container = "convor-prestashop-1807-prestashop-1";
assert.equal(
  execFileSync(
    "docker",
    [
      "inspect",
      "-f",
      '{{ index .Config.Labels "com.docker.compose.project" }}',
      container,
    ],
    { encoding: "utf8" },
  ).trim(),
  "convor-prestashop-1807",
);
const language = (locale) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-u",
      "www-data",
      container,
      "php",
      "-r",
      `require "/var/www/html/config/config.inc.php"; $e=new Employee(1); $old=(new Language((int)$e->id_lang))->iso_code; $e->id_lang=(int)Language::getIdByIso("${locale}"); if(!$e->id_lang||!$e->update()) exit(1); echo $old;`,
    ],
    { encoding: "utf8" },
  ).trim();
const original = language("en");
const browser = await chromium.launch({ headless: true });
try {
  for (const locale of ["en", "pl"]) {
    language(locale);
    const folder = resolve("dist/docs-screenshots", locale);
    await mkdir(folder, { recursive: true });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1160 },
      deviceScaleFactor: 2,
      locale: locale === "pl" ? "pl-PL" : "en-US",
    });
    await page
      .context()
      .route("**/*", (r) =>
        new URL(r.request().url()).origin === shop ? r.continue() : r.abort(),
      );
    await page.goto(shop + "/admin-dev/", { waitUntil: "domcontentloaded" });
    await page.locator("#email").fill("prestashop-qa@example.test");
    await page
      .locator("#passwd")
      .fill(process.env.PRESTASHOP_ADMIN_PASSWORD ?? "PrestashopQa1807!");
    await page.locator("#submit_login").click();
    const manager = page.locator('a[href*="/modules/manage"]').first();
    await manager.waitFor({ state: "attached" });
    await page.goto(
      new URL(await manager.getAttribute("href"), page.url()).href,
      { waitUntil: "domcontentloaded" },
    );
    expect(await page.locator("html").getAttribute("lang")).toMatch(
      new RegExp("^" + locale),
    );
    const upload = page
      .locator(
        '[data-target="#module-modal-import"],[data-bs-target="#module-modal-import"],#page-header-desc-configuration-add-module',
      )
      .filter({ visible: true })
      .first();
    if (await upload.count()) await upload.click();
    else
      await page
        .getByText(
          locale === "pl"
            ? /Załaduj moduł|Prześlij moduł|Wgraj moduł/i
            : /Upload a module/i,
          { exact: false },
        )
        .filter({ visible: true })
        .first()
        .click();
    const modal = page
      .locator(".modal.show,.modal.in")
      .filter({ has: page.locator('input[type="file"]') })
      .first();
    await expect(modal).toBeVisible();
    await modal.screenshot({
      path: join(folder, `${locale}-prestashop-upload.png`),
      animations: "disabled",
    });
    const performance = page
      .locator(
        'a[href*="/configure/advanced/performance"],a[href*="controller=AdminPerformance"]',
      )
      .first();
    await performance.waitFor({ state: "attached" });
    await page.goto(
      new URL(await performance.getAttribute("href"), page.url()).href,
      { waitUntil: "domcontentloaded" },
    );
    const clear = page
      .getByRole("link", {
        name: locale === "pl" ? /Wyczyść pamięć podręczną/i : /Clear cache/i,
      })
      .or(
        page.getByRole("button", {
          name: locale === "pl" ? /Wyczyść pamięć podręczną/i : /Clear cache/i,
        }),
      )
      .first();
    await expect(clear).toBeVisible();
    await page.screenshot({
      path: join(folder, `${locale}-prestashop-cache.png`),
      animations: "disabled",
    });
    await page.close();

    const store = await browser.newPage({
      viewport: { width: 1440, height: 1050 },
      deviceScaleFactor: 2,
      locale: locale === "pl" ? "pl-PL" : "en-US",
    });
    await store
      .context()
      .route("**/*", (r) =>
        new URL(r.request().url()).origin === shop ? r.continue() : r.abort(),
      );
    try {
      await store.goto(shop + "/" + locale + "/", {
        waitUntil: "domcontentloaded",
      });
      expect(await store.locator("html").getAttribute("lang")).toMatch(
        new RegExp("^" + locale),
      );
      const product = store
        .locator("article.product-miniature a[href],.product-miniature a[href]")
        .first();
      const href = await product.getAttribute("href");
      assert.ok(href);
      await store.goto(new URL(href, shop).href, {
        waitUntil: "domcontentloaded",
      });
      const added = store.waitForResponse(
        (r) =>
          r.request().method() === "POST" &&
          new URL(r.url()).origin === shop &&
          r.request().postData()?.includes("add=1") === true,
      );
      await store.locator('[data-button-action="add-to-cart"]').first().click();
      expect((await added).ok()).toBe(true);
      const cartLink = store
        .locator(
          '#blockcart-wrapper a[href],.blockcart a[href],a[href*="action=show"]',
        )
        .first();
      const cartUrl = await cartLink.getAttribute("href");
      assert.ok(cartUrl);
      await store.goto(new URL(cartUrl, shop).href, {
        waitUntil: "domcontentloaded",
      });
      const checkout = store
        .locator(".js-cart-detailed-actions a.btn-primary")
        .first();
      const checkoutUrl = await checkout.getAttribute("href");
      assert.ok(checkoutUrl);
      await store.goto(new URL(checkoutUrl, shop).href, {
        waitUntil: "domcontentloaded",
      });
      await expect(
        store.locator("#checkout-personal-information-step"),
      ).toBeVisible();
      expect(await store.locator("html").getAttribute("lang")).toMatch(
        new RegExp("^" + locale),
      );
      await store.screenshot({
        path: join(folder, `${locale}-prestashop-checkout.png`),
        animations: "disabled",
      });
    } finally {
      await store.close();
    }
    console.log("Captured actual extra merchant guide screenshots", locale);
  }
} finally {
  await browser.close();
  if (["en", "pl"].includes(original)) language(original);
}
