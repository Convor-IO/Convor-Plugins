// Real, pinned MIT CookieConsent v3 in the owned Classic store; no vendor account.
// The actual theme serves unmodified CMP assets and the integration adapter.
// No production credentials, external scripts, or other store are touched.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";

const project = "convor-prestashop-1807-82";
const container = project + "-prestashop-1";
const shop = "http://localhost:18218";
const api = "http://localhost:17243";
const dashboard = "http://localhost:17244";
const theme = "/var/www/html/themes/classic";
const head = theme + "/templates/_partials/head.tpl";
const assets = theme + "/assets/convor-qa-cookieconsent";
const archive = "dist/cmp-qa/vanilla-cookieconsent-3.3.0.tgz";
const expected =
  "KkFJL9W9MAOC7ipSmk1CqTY1PHBViDU81jRBRWGw1Zhx5Y3nyAQ2COYwMpEG2z2SM75HNUIOwM7NnkSJe775Tw==";
assert.equal(process.env.CONVOR_API_URL, api);
assert.equal(process.env.CONVOR_DASHBOARD_URL, dashboard);
assert.equal(
  createHash("sha512").update(readFileSync(archive)).digest("base64"),
  expected,
);
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
  project,
);

const docker = (...args) =>
  execFileSync("docker", ["exec", "-u", "www-data", container, ...args]);
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
function write(path, content) {
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "-u",
      "www-data",
      container,
      "sh",
      "-c",
      'cat > "$1"',
      "sh",
      path,
    ],
    { input: content },
  );
}
const cache = () => {
  php("Tools::clearSmartyCache();");
  docker(
    "php",
    "/var/www/html/bin/console",
    "--env=prod",
    "cache:clear",
    "--no-interaction",
  );
};
const original = docker("cat", head);
const settings = php(
  '$m=Module::getInstanceByName("convor");if(Context::getContext()->shop->theme_name!=="classic")exit(1);echo json_encode($m->settings(),JSON_THROW_ON_ERROR);',
);
const save = (value) =>
  php(
    '$m=Module::getInstanceByName("convor");if(!$m->saveSettings(json_decode(getenv("QA_SETTINGS"),true,512,JSON_THROW_ON_ERROR)))exit(1);',
    { QA_SETTINGS: value },
  );
const snapshot = JSON.parse(settings);
assert.match(snapshot.widget_key, /^convor_wpk_[a-f0-9]{64}$/);
const browser = await chromium.launch({
  headless: true,
  args: ["--disable-blink-features=AutomationControlled"],
});
let created = false;
try {
  docker("mkdir", assets);
  created = true;
  for (const name of ["cookieconsent.umd.js", "cookieconsent.css"]) {
    write(
      assets + "/" + name,
      execFileSync("tar", ["-xOzf", archive, "package/dist/" + name]),
    );
  }
  write(
    assets + "/adapter.js",
    `
const syncConvor = () => {
  window.convorPrestaShopConsent = CookieConsent.acceptedCategory("support");
  document.dispatchEvent(new Event("convor:prestashop-consent"));
};
CookieConsent.run({
  mode: "opt-in",
  categories: { necessary: { enabled: true, readOnly: true }, support: {} },
  onConsent: syncConvor,
  onChange: syncConvor,
  language: { default: "en", translations: { en: {
    consentModal: { title: "Privacy preferences", description: "Choose optional support chat.", acceptAllBtn: "Accept all", acceptNecessaryBtn: "Reject optional", showPreferencesBtn: "Preferences" },
    preferencesModal: { title: "Privacy preferences", acceptAllBtn: "Accept all", acceptNecessaryBtn: "Reject optional", savePreferencesBtn: "Save preferences", closeIconLabel: "Close", sections: [{title:"Required",linkedCategory:"necessary"},{title:"Support chat",linkedCategory:"support"}] }
  } } }
});
`,
  );
  const uri = "/themes/classic/assets/convor-qa-cookieconsent";
  const extra = "{block name='hook_extra'}{/block}";
  const originalText = original.toString("utf8");
  assert.ok(originalText.includes(extra), "Expected Classic hook_extra block");
  write(
    head,
    originalText.replace(
      extra,
      `{block name='hook_extra'}\n<link rel="stylesheet" href="${uri}/cookieconsent.css">\n<script defer src="${uri}/cookieconsent.umd.js"></script>\n<script defer src="${uri}/adapter.js"></script>\n{/block}`,
    ),
  );
  save(
    JSON.stringify({
      ...snapshot,
      enabled: true,
      commerce_context: true,
      consent_required: true,
      identity_enabled: false,
    }),
  );
  cache();
  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 1050 },
  });
  const requests = [];
  const isConvor = (url) =>
    url.origin === api ||
    url.port === "17242" ||
    (url.origin === shop &&
      url.searchParams.get("module") === "convor" &&
      url.searchParams.get("controller") === "context");
  page.on("request", (req) => {
    const u = new URL(req.url());
    if (isConvor(u)) requests.push(u.pathname);
  });
  const allowed = new Set([
    shop,
    api,
    "http://localhost:17242",
    "ws://localhost:17242",
  ]);
  await page
    .context()
    .route("**/*", (route) =>
      allowed.has(new URL(route.request().url()).origin)
        ? route.continue()
        : route.abort(),
    );
  const ready = () =>
    expect
      .poll(
        () => page.evaluate(() => window.Convor?.getState().ready ?? false),
        { timeout: 30000 },
      )
      .toBe(true);
  const modal = page.locator(".cm");
  const reject = () =>
    modal.getByRole("button", { name: "Reject optional", exact: true });
  const cmpErrors = [];
  page.on("pageerror", (err) => cmpErrors.push(err.message));
  await page.goto(shop, { waitUntil: "domcontentloaded" });
  await expect(
    page.locator('script[src$="/convor-qa-cookieconsent/adapter.js"]'),
  ).toHaveCount(1);
  await expect
    .poll(() => page.evaluate(() => typeof window.CookieConsent?.run), {
      timeout: 10000,
    })
    .toBe("function");
  assert.equal(cmpErrors.length, 0, cmpErrors.join("; "));
  await expect(reject()).toBeVisible({ timeout: 30000 });
  assert.equal(requests.length, 0, "No pre-consent widget or context traffic");
  await reject().click();
  await expect(reject()).not.toBeVisible();
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(
    requests.length,
    0,
    "Persisted rejection must block every Convor request",
  );
  await expect(page.locator(".convor-trigger")).toHaveCount(0);
  await page.evaluate(() => CookieConsent.showPreferences());
  const preferences = page.locator(".pm");
  await expect(
    preferences.getByRole("button", { name: "Accept all", exact: true }),
  ).toBeVisible();
  await preferences
    .getByRole("button", { name: "Accept all", exact: true })
    .click();
  await ready();
  await expect(page.locator(".convor-trigger")).toBeVisible();
  assert.ok(requests.length > 0, "Actual acceptance starts the widget");
  const acceptedCount = requests.length;
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready();
  assert.ok(
    requests.length > acceptedCount,
    "Persisted acceptance works on reload",
  );
  await page.evaluate(() => CookieConsent.showPreferences());
  await expect(
    preferences.getByRole("button", { name: "Reject optional", exact: true }),
  ).toBeVisible();
  const reloaded = page.waitForEvent("domcontentloaded");
  await preferences
    .getByRole("button", { name: "Reject optional", exact: true })
    .click();
  await reloaded;
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".convor-trigger")).toHaveCount(0);
  const after = requests.length;
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(".convor-trigger")).toHaveCount(0);
  assert.equal(
    requests.length,
    after,
    "Withdrawal persists; no subsequent Convor requests",
  );
  assert.equal(
    await page.evaluate(() => CookieConsent.acceptedCategory("support")),
    false,
  );
  console.log(
    "PASS: real CookieConsent 3.3.0 UI, initial denial, persistent rejection, consent, reload, withdrawal and no subsequent Convor requests",
  );
} finally {
  await browser.close();
  try {
    if (created) {
      write(head, original);
      docker("rm", "-rf", assets);
    }
  } finally {
    save(settings);
    cache();
  }
  assert.equal(
    createHash("sha256").update(docker("cat", head)).digest("hex"),
    createHash("sha256").update(original).digest("hex"),
  );
  console.log("PASS: original theme and settings restored");
}
