// Actual storefront and SaaS; reproduce GTM's public Convor.init call
// for another synthetic website while a real shop context response is pending.
// This is not a live Google account or an external GTM container.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chromium, expect } from "@playwright/test";

const shop = "http://localhost:18218";
const api = "http://localhost:17243";
const dashboard = "http://localhost:17244";
const container = "convor-prestashop-1807-82-prestashop-1";
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
  "convor-prestashop-1807-82",
);
function required(name) {
  const value = process.env[name];
  if (!value) throw Error("Missing " + name);
  return value;
}
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
const original = php(
  '$m=Module::getInstanceByName("convor");echo json_encode($m->settings(),JSON_THROW_ON_ERROR);',
);
const setSettings = (settings) =>
  php(
    '$m=Module::getInstanceByName("convor");if(!$m->saveSettings(json_decode(getenv("QA_SETTINGS"),true,512,JSON_THROW_ON_ERROR)))exit(1);',
    { QA_SETTINGS: JSON.stringify(settings) },
  );
const allowed = new Set([
  shop,
  api,
  "http://localhost:17242",
  "ws://localhost:17242",
]);
const browser = await chromium.launch({
  headless: true,
  args: ["--disable-blink-features=AutomationControlled"],
});
let unblock;
try {
  const operator = await browser.newPage();
  const login = await operator.request.post(api + "/api/auth/sign-in/email", {
    headers: { Origin: dashboard },
    data: {
      email: required("CONVOR_TEST_EMAIL"),
      password: required("CONVOR_TEST_PASSWORD"),
    },
  });
  assert.equal(login.status(), 200);
  const scope = (org, project) => ({
    Origin: dashboard,
    "X-Organization-Id": org,
    ...(project ? { "X-Project-Id": project } : {}),
  });
  const a = {
    org: required("CONVOR_ORG_ID"),
    project: required("CONVOR_PROJECT_ID"),
  };
  const org = await operator.request.post(api + "/api/organizations", {
    headers: { Origin: dashboard },
    data: {
      name: "Synthetic GTM conflict QA",
      slug: `ps-gtm-${randomBytes(5).toString("hex")}`,
    },
  });
  assert.equal(org.status(), 201);
  const b = { org: (await org.json()).id };
  const projects = await operator.request.get(api + "/api/projects", {
    headers: scope(b.org),
  });
  assert.equal(projects.status(), 200);
  b.project = (await projects.json()).projects[0].id;
  for (const site of [a, b]) {
    const response = await operator.request.get(
      `${api}/api/projects/${site.project}`,
      { headers: scope(site.org, site.project) },
    );
    assert.equal(response.status(), 200);
    site.key = (await response.json()).project.widgetPublicKey;
    assert.match(site.key, /^convor_wpk_[a-f0-9]{64}$/);
  }
  assert.notEqual(a.key, b.key);
  setSettings({
    ...JSON.parse(original),
    enabled: true,
    widget_key: a.key,
    commerce_context: true,
    identity_enabled: false,
    consent_required: false,
  });
  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36",
  });
  const profiles = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (
      url.origin === api &&
      url.pathname === "/api/visitors/profile" &&
      req.method() === "POST"
    ) {
      try {
        profiles.push(req.postDataJSON());
      } catch {}
    }
  });
  let hold = false,
    held = false;
  let release;
  const pending = new Promise((resolve) => {
    unblock = resolve;
  });
  const finished = new Promise((resolve) => {
    release = resolve;
  });
  await page.context().route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!allowed.has(url.origin)) {
      await route.abort();
      return;
    }
    if (
      hold &&
      !held &&
      url.origin === shop &&
      url.searchParams.get("controller") === "context"
    ) {
      held = true;
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      assert.ok(Number((await response.json()).attributes.cartTotal) > 0);
      await pending;
      await route.fulfill({ response });
      release();
      return;
    }
    await route.continue();
  });
  async function visitor(key) {
    await expect
      .poll(
        () =>
          page.evaluate(
            (expected) =>
              window.Convor?.matchesPrimaryInstallation?.(expected) &&
              window.Convor?.getState().ready
                ? window.Convor.getVisitorId()
                : null,
            key,
          ),
        { timeout: 30000 },
      )
      .toMatch(/^[0-9a-f-]{36}$/i);
    return page.evaluate(() => window.Convor.getVisitorId());
  }
  await page.goto(shop, { waitUntil: "domcontentloaded" });
  const href = await page
    .locator("article.product-miniature a[href],.product-miniature a[href]")
    .first()
    .getAttribute("href");
  assert.ok(href);
  await page.goto(new URL(href, shop).href, { waitUntil: "domcontentloaded" });
  const idA = await visitor(a.key);
  const added = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      new URL(r.url()).origin === shop &&
      r.request().postData()?.includes("add=1"),
  );
  await page.locator('[data-button-action="add-to-cart"]').first().click();
  assert.ok((await added).ok());
  await expect
    .poll(
      () =>
        profiles.some(
          (p) => p.visitorId === idA && Number(p.attributes?.cartTotal) > 0,
        ),
      { timeout: 30000 },
    )
    .toBe(true);
  hold = true;
  await page.evaluate(() => window.prestashop.emit("updatedCart", {}));
  await expect.poll(() => held).toBe(true);
  // This is the same singleton init API that the actual GTM template calls.
  await page.evaluate(
    async ({ key, api }) => {
      await window.Convor.init({
        key,
        apiBase: api,
        widgetUrl: api + "/widget-iframe.html",
      });
    },
    { key: b.key, api },
  );
  const idB = await visitor(b.key);
  assert.notEqual(idA, idB);
  unblock();
  await finished;
  await page.evaluate(() => window.prestashop.emit("updatedCart", {}));
  // The bridge's cart debounce is 200 ms; allow iframe API delivery too.
  await page.waitForTimeout(1500);
  assert.ok(
    !profiles.some(
      (p) => p.visitorId === idB && Number(p.attributes?.cartTotal) > 0,
    ),
    "Another website received the actual merchant cart total",
  );
  assert.ok(
    await page.evaluate(
      (expected) =>
        window.Convor.matchesPrimaryInstallation(expected) &&
        window.Convor.getState().ready,
      b.key,
    ),
    "The other widget must remain alive",
  );
  console.log(
    "PASS: real PrestaShop cart context stayed with website A; GTM-style reinit to B did not receive the late or subsequent cart update",
  );
} finally {
  unblock?.();
  await browser.close();
  setSettings(JSON.parse(original));
}
