// Actual public TLS storefront, protected BO and local SaaS verification.
// Only #1807 synthetic data and the pinned local Docker fixture are used.
// Do not enable production chat with this local tenant's key.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const shop = "https://ps-qa-1807.topsoft4u.com";
const api = "http://localhost:17243";
const dashboard = "http://localhost:17244";
const container = "convor-ps-qa-1807-prestashop-1";
const archive = resolve("dist/prestashop/convor.zip");
assert.equal(process.env.CONVOR_API_URL, api);
assert.equal(process.env.CONVOR_DASHBOARD_URL, dashboard);
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
  "convor-ps-qa-1807",
);
const sha = createHash("sha256").update(readFileSync(archive)).digest("hex");
assert.equal(
  readFileSync(archive + ".sha256", "utf8").trim(),
  sha + "  convor.zip",
);
const env = Object.fromEntries(
  readFileSync("dist/prestashop-public-qa/.env", "utf8")
    .trim()
    .split("\n")
    .map((line) => line.split("=", 2)),
);
assert.match(env.QA_GATEWAY_PASSWORD, /^[a-f0-9]{48}$/);
assert.match(env.QA_ADMIN_PASSWORD, /^[a-f0-9]{48}$/);

for (const [path, status] of [
  ["/", 200],
  ["/admin-dev/", 401],
  ["/api/", 404],
  ["/install/", 404],
  ["/.env", 404],
  ["/config/settings.inc.php", 404],
]) {
  const response = await fetch(shop + path, { redirect: "manual" });
  assert.equal(response.status, status, path);
  if (path === "/") {
    assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  }
}
const request = async (path, method = "GET", body, headers = {}) =>
  fetch(api + path, {
    method,
    redirect: "manual",
    headers: {
      Origin: dashboard,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
const login = await request("/api/auth/sign-in/email", "POST", {
  email: process.env.CONVOR_TEST_EMAIL,
  password: process.env.CONVOR_TEST_PASSWORD,
});
assert.equal(login.status, 200, "local synthetic sign-in");
const cookie = login.headers
  .getSetCookie()
  .map((v) => v.split(";")[0])
  .join("; ");
const scope = {
  cookie,
  "X-Organization-Id": process.env.CONVOR_ORG_ID,
  "X-Project-Id": process.env.CONVOR_PROJECT_ID,
};
const domainsPath =
  "/api/projects/" + process.env.CONVOR_PROJECT_ID + "/domains";
const hostname = new URL(shop).hostname;
const existing = await request(domainsPath, "GET", undefined, scope);
assert.ok(existing.ok);
const existingData = await existing.json();
const existingDomains = Array.isArray(existingData)
  ? existingData
  : existingData.domains;
if (
  !existingDomains.some(
    (item) => item.hostname === hostname || item.value === hostname,
  )
) {
  const domain = await request(
    domainsPath,
    "POST",
    { value: hostname, isPrimary: true },
    scope,
  );
  assert.ok(
    domain.ok,
    "configure public QA domain on local synthetic website, HTTP " +
      domain.status,
  );
}
const billingScope = { cookie, "X-Organization-Id": process.env.CONVOR_ORG_ID };
const startPath = "/api/billing/trial-site/verification/start";
const confirmPath = "/api/billing/trial-site/verification/confirm";
const start = await request(startPath, "POST", {}, billingScope);
if (!start.ok) {
  const error = await start.json().catch(() => ({}));
  throw new Error(
    "Verification start HTTP " +
      start.status +
      " code " +
      (error.code ?? error.error?.code ?? "unknown"),
  );
}
const { challenge, widgetPublicKey, verification } = await start.json();
assert.equal(verification.state, "pending");
assert.match(challenge, /^[A-Za-z0-9_-]{32,128}$/);
assert.match(widgetPublicKey, /^convor_wpk_[a-f0-9]{64}$/);
// Proof must not verify before it exists on the actual public shop.
const absent = await request(confirmPath, "POST", { challenge }, billingScope);
assert.equal(absent.status, 422, "missing public proof must fail");

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    httpCredentials: {
      origin: shop,
      username: "reviewer",
      password: env.QA_GATEWAY_PASSWORD,
    },
    viewport: { width: 1440, height: 1050 },
  });
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === shop
      ? route.continue()
      : route.abort(),
  );
  const page = await context.newPage();
  await page.goto(shop + "/admin-dev/", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  const email = page.locator("#email");
  await expect(email).toBeVisible({ timeout: 30000 });
  await email.fill("prestashop-qa@example.test");
  await page.locator("#passwd").fill(env.QA_ADMIN_PASSWORD);
  await page.locator("#submit_login").click();
  await expect(email).not.toBeVisible({ timeout: 60000 });
  const manage = page
    .locator('a[href*="/modules/manage"],a[href*="AdminModulesManage"]')
    .first();
  await expect(manage).toBeAttached({ timeout: 30000 });
  const href = await manage.getAttribute("href");
  assert.ok(href);
  await page.goto(new URL(href, page.url()).href, {
    waitUntil: "domcontentloaded",
  });
  const configure = page
    .locator('a[href*="/action/configure/convor?"]')
    .first();
  if (!(await configure.isVisible())) {
    await page.getByText("Upload a module", { exact: false }).first().click();
    await page.locator('input[type="file"]').setInputFiles(archive);
    await expect(page.getByText(/module installed/i)).toBeVisible({
      timeout: 90000,
    });
    const installed = await page
      .getByRole("dialog")
      .locator('a[href*="/action/configure/convor?"]')
      .getAttribute("href");
    assert.ok(installed);
    await page.goto(new URL(installed, page.url()).href, {
      waitUntil: "domcontentloaded",
    });
  } else {
    const installed = await configure.getAttribute("href");
    assert.ok(installed);
    await page.goto(new URL(installed, page.url()).href, {
      waitUntil: "domcontentloaded",
    });
  }
  await expect(page.locator("#CONVOR_WIDGET_KEY")).toBeVisible({
    timeout: 30000,
  });
  await page.locator("#CONVOR_WIDGET_KEY").fill(widgetPublicKey);
  await page.locator("#CONVOR_VERIFICATION_CHALLENGE").fill(challenge);
  // The exact production archive retains canonical CDN endpoints. Keep the
  // consent gate closed so this local tenant never sends requests there.
  await page
    .locator('input[name="CONVOR_CONSENT_REQUIRED"][value="1"]')
    .check({ force: true });
  await page
    .locator('input[name="CONVOR_ENABLED"][value="1"]')
    .check({ force: true });
  await page.locator("#configuration_form_submit_btn").click();
  const home = await page.goto(shop, { waitUntil: "domcontentloaded" });
  assert.equal(home.status(), 200);
  const marker = page.locator("script[data-convor-verification]");
  await expect(marker).toHaveCount(1);
  await expect(marker).toHaveAttribute("data-convor-verification", challenge);
  await expect(marker).toHaveAttribute("data-key", widgetPublicKey);
  await expect(marker).toHaveAttribute("data-convor-consent", "1");
  await expect(page.locator(".convor-trigger")).toHaveCount(0);
  const confirmed = await request(
    confirmPath,
    "POST",
    { challenge },
    billingScope,
  );
  assert.equal(confirmed.status, 200, "real DNS-pinned HTTPS proof");
  assert.equal((await confirmed.json()).state, "verified");
  const status = await request(
    "/api/billing/trial-site",
    "GET",
    undefined,
    billingScope,
  );
  assert.equal(status.status, 200);
  assert.equal((await status.json()).verificationState, "verified");
  console.log(
    "PASS actual public HTTPS BO installation, consent-gated marker and real local SaaS remote domain verification",
  );
  const list = await request(domainsPath, "GET", undefined, scope);
  assert.ok(list.ok);
  const data = await list.json();
  const records = Array.isArray(data) ? data : data.domains;
  const current = records.find(
    (item) => item.hostname === hostname || item.value === hostname,
  );
  assert.ok(current?.id, "public QA domain record");
  const remove = await request(
    domainsPath + "/" + current.id,
    "DELETE",
    undefined,
    scope,
  );
  assert.ok(remove.ok, "remove public QA domain");
  const after = await request(
    "/api/billing/trial-site",
    "GET",
    undefined,
    billingScope,
  );
  assert.equal(after.status, 200);
  const result = await after.json();
  assert.ok(
    !result.configured || result.verificationState !== "verified",
    "no active proof after domain removal",
  );
  console.log(
    "PASS removing primary domain invalidates active local trial proof",
  );
  await page.goto(shop + "/admin-dev/", { waitUntil: "domcontentloaded" });
  await context.close();
} finally {
  await browser.close();
  // Clear synthetic proof and key, including after assertion failures.
  execFileSync(
    "docker",
    [
      "exec",
      "-u",
      "www-data",
      container,
      "php",
      "-r",
      'require "/var/www/html/config/config.inc.php";if(Module::isInstalled("convor")){$m=Module::getInstanceByName("convor");if(!$m->saveSettings(Convor::defaults()))exit(1);Tools::clearSmartyCache();}',
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
}
