// Synthetic checkout using the local offline check-payment method. Never
// target a merchant shop, submit card details or contact a payment gateway.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chromium, expect } from "@playwright/test";

const shop = "http://localhost:18218";
const api = "http://localhost:17243";
const container = "convor-prestashop-1807-82-prestashop-1";
assert.equal(process.env.CONVOR_API_URL, api);
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
  "convor-prestashop-1807-82",
);
function php(code, env = {}) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "-u",
      "www-data",
      ...Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
      container,
      "php",
    ],
    {
      input: '<?php\nrequire "/var/www/html/config/config.inc.php";\n' + code,
      encoding: "utf8",
    },
  ).trim();
}
const snapshot = JSON.parse(
  php(`
$m=Module::getInstanceByName("convor"); $s=$m->settings();
if(!Convor::validKey($s["widget_key"])||$s["identity_enabled"]||!Module::isEnabled("ps_checkpayment"))throw new RuntimeException("Expected anonymous disposable fixture with offline check payment");
echo json_encode(["enabled"=>$s["enabled"],"commerce_context"=>$s["commerce_context"],"consent_required"=>$s["consent_required"],"exclude_checkout"=>$s["exclude_checkout"]]);`),
);
function settings(values) {
  php(
    `$m=Module::getInstanceByName("convor");$s=$m->settings();
foreach(json_decode(getenv("QA_FLAGS"),true,512,JSON_THROW_ON_ERROR) as $k=>$v) $s[$k]=$v;
if(!$m->saveSettings($s))throw new RuntimeException("Unable to save QA settings");`,
    { QA_FLAGS: JSON.stringify(values) },
  );
}
const browser = await chromium.launch({
  headless: true,
  args: ["--disable-blink-features=AutomationControlled"],
});
const origins = new Set([
  shop,
  api,
  "http://localhost:17242",
  "ws://localhost:17242",
]);
const page = await browser.newPage({
  userAgent:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36",
  viewport: { width: 1440, height: 1050 },
});
await page
  .context()
  .route("**/*", (route) =>
    origins.has(new URL(route.request().url()).origin)
      ? route.continue()
      : route.abort(),
  );
const responses = [];
page.on("response", async (r) => {
  const url = new URL(r.url());
  if (
    url.origin === shop &&
    url.searchParams.get("controller") === "context" &&
    r.ok()
  ) {
    try {
      const result = await r.json();
      if (result.attributes) responses.push(result.attributes);
    } catch {}
  }
});
const latest = () => responses.at(-1);
let addedOfflineCountry = false;
try {
  // The demo delivers to France but its offline check-payment module is
  // configured for GB only. Add just the missing synthetic fixture association.
  addedOfflineCountry =
    php(`$m=Module::getInstanceByName("ps_checkpayment");
$c=(int)Country::getByIso("FR");if(!$c||Context::getContext()->shop->id!==1)throw new RuntimeException("Unexpected fixture");
$where="id_module=".(int)$m->id." AND id_shop=1 AND id_country=".$c;
if(Db::getInstance()->getValue("SELECT COUNT(*) FROM ". _DB_PREFIX_ ."module_country WHERE ".$where)){echo "existing";}else{
if(!Db::getInstance()->insert("module_country",["id_module"=>(int)$m->id,"id_shop"=>1,"id_country"=>$c]))throw new RuntimeException("Unable to configure fixture offline payment");echo "added";}`) ===
    "added";
  settings({
    enabled: true,
    commerce_context: true,
    consent_required: false,
    exclude_checkout: true,
  });
  await page.goto(shop, { waitUntil: "domcontentloaded" });
  const product = page
    .locator("article.product-miniature a[href],.product-miniature a[href]")
    .first();
  const href = await product.getAttribute("href");
  assert.ok(href);
  await page.goto(new URL(href, shop).href, { waitUntil: "domcontentloaded" });
  await expect
    .poll(() => latest()?.productCurrency, { timeout: 30000 })
    .toBe("EUR");
  const euro = Number(latest().productPrice);
  assert.ok(euro > 0);
  const usd = page
    .locator(".currency-selector a")
    .filter({ hasText: "USD" })
    .first();
  const currencyUrl = await usd.getAttribute("href");
  assert.ok(currencyUrl);
  await page.goto(new URL(currencyUrl, page.url()).href, {
    waitUntil: "domcontentloaded",
  });
  await expect
    .poll(() => latest()?.productCurrency, { timeout: 30000 })
    .toBe("USD");
  assert.ok(Number(latest().productPrice) > 0);
  assert.notEqual(Number(latest().productPrice), euro);
  const added = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      new URL(r.url()).origin === shop &&
      r.request().postData()?.includes("add=1"),
  );
  await page.locator('[data-button-action="add-to-cart"]').first().click();
  assert.ok((await added).ok());
  await expect
    .poll(() => latest()?.cartCurrency, { timeout: 30000 })
    .toBe("USD");
  await expect
    .poll(() => Number(latest()?.cartTotal ?? 0), { timeout: 30000 })
    .toBeGreaterThan(0);
  console.log(
    "PASS actual currency change EUR→USD reflected in product and cart context",
  );
  // The demo offline payment module may accept EUR only. Switch back
  // through the actual storefront currency selector before checking out.
  await page.goto(new URL(href, shop).href, { waitUntil: "domcontentloaded" });
  const eurLink = await page
    .locator(".currency-selector a")
    .filter({ hasText: "EUR" })
    .first()
    .getAttribute("href");
  assert.ok(eurLink);
  await page.goto(new URL(eurLink, page.url()).href, {
    waitUntil: "domcontentloaded",
  });
  await expect
    .poll(() => latest()?.cartCurrency, { timeout: 30000 })
    .toBe("EUR");
  await page.goto(shop + "/index.php?controller=order", {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.locator("#checkout-personal-information-step"),
  ).toBeVisible();
  await expect(page.locator("script[data-key]")).toHaveCount(0);
  const customer = page.locator("#checkout-guest-form #customer-form");
  await customer.locator('input[name="firstname"]').fill("Convor");
  await customer.locator('input[name="lastname"]').fill("Synthetic QA");
  await customer
    .locator('input[name="email"]')
    .fill("checkout-" + randomBytes(6).toString("hex") + "@example.test");
  for (const name of ["customer_privacy", "psgdpr"]) {
    const input = customer.locator('input[name="' + name + '"]');
    if (await input.count()) await input.check({ force: true });
  }
  await customer.locator('button[type="submit"]').click();
  const address = page.locator("#delivery-address");
  await expect(address.locator('input[name="address1"]')).toBeVisible({
    timeout: 20000,
  });
  const country = address.locator('select[name="id_country"]');
  const france = await country
    .locator("option")
    .filter({ hasText: /^France$/ })
    .first()
    .getAttribute("value");
  assert.ok(france);
  await country.selectOption(france);
  await address
    .locator('input[name="address1"]')
    .fill("10 Test Fixture Street");
  await address.locator('input[name="postcode"]').fill("75001");
  await address.locator('input[name="city"]').fill("Paris");
  const phone = address.locator('input[name="phone"]');
  if (await phone.isVisible()) await phone.fill("0000000000");
  await page
    .locator('button[name="confirm-addresses"],button[name="confirm-address"]')
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.locator("#checkout-delivery-step")).toHaveClass(
    /-current/,
    { timeout: 20000 },
  );
  await page.locator('button[name="confirmDeliveryOption"]').click();
  const check = page.locator('input[data-module-name="ps_checkpayment"]');
  await expect(check).toBeVisible({ timeout: 20000 });
  await check.check();
  const terms = page.locator('#conditions-to-approve input[type="checkbox"]');
  for (const term of await terms.all()) await term.check({ force: true });
  await expect(page.locator("script[data-key]")).toHaveCount(0);
  await page.locator("#payment-confirmation button[type=submit]").click();
  await expect
    .poll(
      () =>
        new URL(page.url()).searchParams.get("controller") ===
          "order-confirmation" ||
        new URL(page.url()).pathname.includes("order-confirmation"),
      { timeout: 30000 },
    )
    .toBe(true);
  await expect(page.locator("#content-hook_order_confirmation")).toBeVisible();
  await expect(
    page.locator(
      "script[data-key],script[data-convor-prestashop-loader],.convor-trigger",
    ),
  ).toHaveCount(0);
  console.log(
    "PASS real synthetic offline order confirmation with widget exclusion; no external payment",
  );
} finally {
  await browser.close();
  settings(snapshot);
  if (addedOfflineCountry)
    php(`$m=Module::getInstanceByName("ps_checkpayment");$c=(int)Country::getByIso("FR");
if(!Db::getInstance()->delete("module_country","id_module=".(int)$m->id." AND id_shop=1 AND id_country=".$c))throw new RuntimeException("Unable to restore offline fixture payment restrictions");`);
}
