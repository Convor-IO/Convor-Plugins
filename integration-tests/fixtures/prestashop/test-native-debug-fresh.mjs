// A clean upstream PS9.0.3 store, with no Convor module ever installed.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chromium, expect } from "@playwright/test";

const shop = "http://localhost:18225";
const container = "convor-ps-debug-1807-prestashop-1";
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
  "convor-ps-debug-1807",
);
const baseline = execFileSync(
  "docker",
  [
    "exec",
    "-u",
    "www-data",
    container,
    "php",
    "-r",
    'require "/var/www/html/config/config.inc.php"; if(Module::isInstalled("convor")||is_dir(_PS_MODULE_DIR_."convor"))exit(1);echo _PS_VERSION_;',
  ],
  { encoding: "utf8" },
).trim();
assert.equal(baseline, "9.0.3");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  await page
    .context()
    .route("**/*", (route) =>
      new URL(route.request().url()).origin === shop
        ? route.continue()
        : route.abort(),
    );
  await page.goto(shop, { waitUntil: "domcontentloaded" });
  const href = await page
    .locator("article.product-miniature a[href],.product-miniature a[href]")
    .first()
    .getAttribute("href");
  assert.ok(href);
  await page.goto(new URL(href, shop).href, { waitUntil: "domcontentloaded" });
  const added = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      new URL(r.url()).origin === shop &&
      r.request().postData()?.includes("add=1"),
    { timeout: 20000 },
  );
  await page.locator('[data-button-action="add-to-cart"]').first().click();
  const response = await added;
  assert.ok(response.ok());
  let result;
  const body = await response.text();
  try {
    result = JSON.parse(body);
  } catch {
    throw Error(
      "Native cart non-JSON: PHP diagnostic=" +
        /Deprecated|Warning|Notice|Fatal error/i.test(body),
    );
  }
  assert.equal(result.hasError ?? false, false);
  assert.ok(Number(result.cart?.products_count ?? 0) > 0);
  let checkout = await page.goto(shop + "/index.php?controller=order", {
    waitUntil: "domcontentloaded",
  });
  // PS debug mode emits a native diagnostic page for canonical redirects
  // instead of a 3xx. Follow only the actual same-origin canonical link.
  if (
    await page
      .getByText("[Debug] This page has moved", { exact: false })
      .isVisible()
  ) {
    const href = await page
      .getByRole("link", { name: /\/order$/ })
      .getAttribute("href");
    assert.ok(href);
    const canonical = new URL(href, shop);
    assert.equal(canonical.origin, shop);
    checkout = await page.goto(canonical.href, {
      waitUntil: "domcontentloaded",
    });
  }
  const html = await checkout.text();
  if (checkout.status() !== 200) {
    console.log("Native checkout non-200:", checkout.status(), {
      phpDiagnostic: /Deprecated|Warning|Notice|Fatal error/i.test(html),
      symfonyException: /Symfony Exception|Exception Stack Trace/i.test(html),
      checkoutForm: await page
        .locator("#checkout-personal-information-step")
        .isVisible(),
    });
  }
  assert.equal(checkout.status(), 200);
  console.log(
    "Native checkout:",
    JSON.stringify({
      bytes: Buffer.byteLength(html),
      bodyId: await page.evaluate(() => document.body.id),
      phpDiagnostics: /Deprecated|Warning|Notice|Fatal error/i.test(html),
    }),
  );
  await expect(page.locator("#checkout-personal-information-step")).toBeVisible(
    { timeout: 20000 },
  );
  console.log("PASS fresh native PS9.0.3 cart and checkout");
} finally {
  await browser.close();
}
