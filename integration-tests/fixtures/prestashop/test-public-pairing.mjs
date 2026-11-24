// Real public HTTPS BO, actual native MFA, and local SaaS callback redemption.
// The shell wrapper enables only the owned shop's temporary loopback overrides.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";

const shop = "https://ps-qa-1807.topsoft4u.com";
const api = "http://localhost:17243";
const dashboard = "http://localhost:17244";
const container = "convor-ps-qa-1807-prestashop-1";
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
assert.equal(
  execFileSync(
    "docker",
    [
      "exec",
      "-u",
      "www-data",
      container,
      "php",
      "-r",
      'require "/var/www/html/config/config.inc.php";Module::getInstanceByName("convor");echo Convor::endpoint("api")==="http://server:3000"&&Convor::endpoint("cdn")==="http://localhost:17243"&&Convor::endpoint("dashboard")==="http://localhost:17244"?"1":"0";',
    ],
    { encoding: "utf8" },
  ).trim(),
  "1",
);
const env = Object.fromEntries(
  readFileSync("dist/prestashop-public-qa/.env", "utf8")
    .trim()
    .split("\n")
    .map((line) => line.split("=", 2)),
);
const email = process.env.CONVOR_TEST_EMAIL;
const password = process.env.CONVOR_TEST_PASSWORD;
const org = process.env.CONVOR_ORG_ID;
const project = process.env.CONVOR_PROJECT_ID;
assert.match(email ?? "", /^prestashop-[a-f0-9]+@e2e\.test$/);
assert.ok(password && org && project);
assert.match(env.QA_GATEWAY_PASSWORD, /^[a-f0-9]{48}$/);
assert.match(env.QA_ADMIN_PASSWORD, /^[a-f0-9]{48}$/);

function totp(uri) {
  const secret = new URL(uri).searchParams.get("secret");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  assert.match(secret ?? "", /^[A-Z2-7]+=*$/i);
  let buffer = 0;
  let bits = 0;
  const key = [];
  for (const char of secret.toUpperCase().replace(/=+$/, "")) {
    buffer = (buffer << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      key.push((buffer >>> bits) & 255);
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const digest = createHmac("sha1", Buffer.from(key)).update(counter).digest();
  const offset = digest.at(-1) & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(
    6,
    "0",
  );
}

const browser = await chromium.launch({ headless: true });
try {
  const enrollment = await browser.newContext();
  const req = enrollment.request;
  const origin = { Origin: dashboard };
  assert.equal(
    (
      await req.post(api + "/api/auth/sign-in/email", {
        headers: origin,
        data: { email, password },
      })
    ).status(),
    200,
  );
  const enable = await req.post(api + "/api/auth/two-factor/enable", {
    headers: origin,
    data: { password },
  });
  assert.equal(enable.status(), 200);
  const uri = (await enable.json()).totpURI;
  assert.ok(uri, "Native MFA enrollment");
  assert.equal(
    (
      await req.post(api + "/api/auth/two-factor/verify-totp", {
        headers: origin,
        data: { code: totp(uri) },
      })
    ).status(),
    200,
  );
  await enrollment.close();

  const context = await browser.newContext({
    httpCredentials: {
      origin: shop,
      username: "reviewer",
      password: env.QA_GATEWAY_PASSWORD,
    },
    viewport: { width: 1440, height: 1050 },
    locale: "en-US",
  });
  const allowed = new Set([
    shop,
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
  let page = await context.newPage();
  // Retry only an idempotent initial GET on the host's observed transient
  // Chromium network-change error (other local Docker jobs change interfaces).
  // Never repeat a login, pairing POST or form submission.
  const openAdmin = () =>
    page.goto(shop + "/admin-dev/", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
  try {
    await openAdmin();
  } catch (error) {
    if (!String(error).includes("net::ERR_NETWORK_CHANGED")) throw error;
    console.log(
      "Retrying initial GET on a fresh tab after Chromium ERR_NETWORK_CHANGED",
    );
    await page.close();
    page = await context.newPage();
    await openAdmin();
  }
  await expect(page.locator("#email")).toBeVisible({ timeout: 30000 });
  await page.locator("#email").fill("prestashop-qa@example.test");
  await page.locator("#passwd").fill(env.QA_ADMIN_PASSWORD);
  await page.locator("#submit_login").click();
  await expect(page.locator("#email")).not.toBeVisible({ timeout: 60000 });
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
  await expect(configure).toBeVisible({ timeout: 30000 });
  await page.goto(
    new URL(await configure.getAttribute("href"), page.url()).href,
    { waitUntil: "domcontentloaded" },
  );
  const keyField = page.locator("#CONVOR_WIDGET_KEY");
  await expect(keyField).toHaveValue("");
  await page
    .locator('input[name="CONVOR_CONSENT_REQUIRED"][value="1"]')
    .check({ force: true });
  await page.locator("#configuration_form_submit_btn").click();
  await page
    .getByRole("button", { name: "Connect with Convor", exact: true })
    .click();
  const link = page.getByRole("link", { name: "Open Convor", exact: true });
  const url = new URL(await link.getAttribute("href"));
  assert.equal(url.origin, dashboard);
  assert.equal(new URL(url.searchParams.get("ps_callback")).origin, shop);
  const popupPromise = page.waitForEvent("popup");
  await link.click();
  const popup = await popupPromise;
  await popup.waitForLoadState("networkidle", { timeout: 60000 });
  await expect(popup.getByTestId("login-email")).toBeVisible({
    timeout: 60000,
  });
  await popup.getByTestId("login-email").fill(email);
  await popup.getByTestId("login-password").fill(password);
  await popup.getByTestId("login-submit").click();
  await expect(popup.getByTestId("mfa-code-input")).toBeVisible({
    timeout: 30000,
  });
  const scope = {
    ...origin,
    "X-Organization-Id": org,
    "X-Project-Id": project,
  };
  const denied = await popup.request.post(
    api + "/api/prestashop/pairing/start",
    {
      headers: scope,
      data: {
        siteUrl: url.searchParams.get("ps_site"),
        callback: url.searchParams.get("ps_callback"),
        state: url.searchParams.get("ps_state"),
        verifierHash: url.searchParams.get("ps_proof"),
      },
    },
  );
  assert.ok(
    [401, 403].includes(denied.status()),
    "Password-only pairing denied",
  );
  await popup.getByTestId("mfa-code-input").fill(totp(uri));
  await popup.getByTestId("mfa-verify-submit").click();
  // MFA sign-in uses the actual organization picker, including single-org
  // synthetic accounts. Select through the UI rather than bypassing it.
  const choice = popup.getByTestId("organization-choice-option-" + org);
  await expect(choice).toBeVisible({ timeout: 60000 });
  await popup.waitForLoadState("networkidle", { timeout: 60000 });
  await choice.click();
  await popup.waitForURL(
    (destination) =>
      destination.pathname === "/integrations/prestashop" &&
      destination.searchParams.get("projectId") === project,
    { timeout: 60000 },
  );
  const selected = new URL(popup.url());
  for (const [name, value] of url.searchParams)
    assert.ok(
      selected.searchParams.get(name) === value,
      "Pairing continuation preserved",
    );
  const key = popup.getByTestId("prestashop-widget-key");
  await expect(key).toBeVisible({ timeout: 60000 });
  const expected = await key.inputValue();
  assert.match(expected, /^convor_wpk_[a-f0-9]{64}$/);
  const detail = await popup.request.get(api + "/api/projects/" + project, {
    headers: scope,
  });
  assert.equal(detail.status(), 200);
  assert.ok(
    (await detail.json()).project.widgetPublicKey === expected,
    "Selected project key",
  );
  const callback = popup.waitForResponse(
    (response) => {
      const u = new URL(response.url());
      return (
        u.origin === shop &&
        u.searchParams.get("module") === "convor" &&
        u.searchParams.get("controller") === "pairing"
      );
    },
    { timeout: 30000 },
  );
  await popup.getByRole("button", { name: "Connect this website" }).click();
  const returned = await callback;
  assert.equal(returned.status(), 200);
  assert.match(returned.headers()["cache-control"] ?? "", /no-store/);
  await expect
    .poll(() => keyField.inputValue().then((value) => value === expected), {
      timeout: 30000,
    })
    .toBe(true);
  await popup.close();
  await expect(
    page.getByText("Last paired website:", { exact: false }),
  ).toBeVisible();
  console.log(
    "PASS public HTTPS BO + native MFA + actual public callback + local PHP redemption",
  );

  const domainsPath = "/api/projects/" + project + "/domains";
  const hostname = new URL(shop).hostname;
  const list = await context.request.get(api + domainsPath, { headers: scope });
  assert.equal(list.status(), 200);
  const payload = await list.json();
  const domains = Array.isArray(payload) ? payload : payload.domains;
  let domain = domains.find(
    (d) => d.hostname === hostname || d.value === hostname,
  );
  if (!domain) {
    const create = await context.request.post(api + domainsPath, {
      headers: scope,
      data: { value: hostname, isPrimary: true },
    });
    assert.ok(create.ok(), "Create local QA primary domain");
    const updated = await context.request.get(api + domainsPath, {
      headers: scope,
    });
    const data = await updated.json();
    domain = (Array.isArray(data) ? data : data.domains).find(
      (d) => d.hostname === hostname || d.value === hostname,
    );
  }
  assert.ok(domain?.id);
  const billing = { ...origin, "X-Organization-Id": org };
  const start = await context.request.post(
    api + "/api/billing/trial-site/verification/start",
    { headers: billing, data: {} },
  );
  assert.equal(start.status(), 200);
  const { challenge, widgetPublicKey } = await start.json();
  assert.ok(widgetPublicKey === expected);
  await page.locator("#CONVOR_VERIFICATION_CHALLENGE").fill(challenge);
  await page.locator("#configuration_form_submit_btn").click();
  const proof = await context.request.get(shop + "/");
  assert.equal(proof.status(), 200);
  assert.ok(
    (await proof.text()).includes(challenge),
    "Actual public HTML contains challenge",
  );
  const confirmation = await context.request.post(
    api + "/api/billing/trial-site/verification/confirm",
    { headers: billing, data: { challenge } },
  );
  assert.equal(confirmation.status(), 200);
  assert.equal((await confirmation.json()).state, "verified");

  // The public merchant is real HTTPS; the browser and chat backend are
  // local. Do not disable Chromium's local-network/mixed-content protections.
  // Keep the merchant's consent gate closed except for this synthetic visitor.
  let chatError;
  if (process.env.PRESTASHOP_PUBLIC_CHAT === "1") {
    const chatBrowser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled"],
    });
    try {
      const customer = await chatBrowser.newContext({
        userAgent:
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36",
        viewport: { width: 1440, height: 1050 },
      });
      // Chrome denies public-origin access to loopback by default. Simulate
      // the explicit browser permission for this owned QA hostname only,
      // never disable browser security or expose the local backend publicly.
      await customer.grantPermissions(["local-network-access"], {
        origin: shop,
      });
      await customer.route("**/*", (route) =>
        allowed.has(new URL(route.request().url()).origin)
          ? route.continue()
          : route.abort(),
      );
      await customer.addInitScript((origin) => {
        if (location.origin === origin) window.convorPrestaShopConsent = true;
      }, shop);
      const visitor = await customer.newPage();
      const events = [];
      visitor.on("requestfailed", (request) => {
        const u = new URL(request.url());
        if (
          u.origin === api ||
          (u.origin === shop && u.pathname.includes("/modules/convor/"))
        )
          events.push({
            origin: u.origin,
            path: u.pathname,
            error: request.failure()?.errorText,
          });
      });
      visitor.on("response", (response) => {
        const u = new URL(response.url());
        if (
          u.origin === api ||
          (u.origin === shop && u.pathname.includes("/modules/convor/"))
        )
          events.push({
            origin: u.origin,
            path: u.pathname,
            status: response.status(),
          });
      });
      await visitor.goto(shop, { waitUntil: "domcontentloaded" });
      const launcher = visitor.locator(".convor-trigger");
      try {
        await expect(launcher).toBeVisible({ timeout: 30000 });
      } catch (error) {
        const diagnostic = await visitor.evaluate(() => ({
          consent: window.convorPrestaShopConsent === true,
          marker: !!document.querySelector("script[data-convor-verification]"),
          deferredLoader: !!document.querySelector(
            "script[data-convor-prestashop-loader]",
          ),
          sdk: Boolean(window.Convor),
          iframe: Boolean(
            document.querySelector('iframe[src*="widget-iframe"]'),
          ),
        }));
        console.log(
          "Public/local browser diagnostic:",
          diagnostic,
          events.slice(-12),
        );
        throw new Error(
          "Public/local widget launcher did not load; see sanitized transport diagnostic",
          { cause: error.name },
        );
      }
      await expect
        .poll(
          () =>
            visitor.evaluate(() => window.Convor?.getState().ready ?? false),
          { timeout: 30000 },
        )
        .toBe(true);
      await launcher.click();
      const wrapper = visitor.locator(".convor-frame-wrapper.is-open");
      await expect(wrapper).toBeVisible();
      await wrapper.evaluate(async (element) => {
        await Promise.all(
          element
            .getAnimations()
            .map((animation) => animation.finished.catch(() => undefined)),
        );
      });
      const frame = visitor
        .frameLocator('iframe[src*="widget-iframe"]')
        .first();
      const startChat = frame.locator('[data-welcome-action="start"]');
      const input = frame.locator(
        '.convor-chat > .convor-input [data-testid="widget-input-field"]',
      );
      await expect(
        startChat.or(input).filter({ visible: true }).first(),
      ).toBeVisible({ timeout: 30000 });
      if (!(await input.isVisible()) && (await startChat.isVisible())) {
        try {
          await startChat.click({ timeout: 3000 });
        } catch (error) {
          if (!(await input.isVisible())) throw error;
        }
      }
      await expect(input).toBeVisible({ timeout: 30000 });
      const question = "Public HTTPS PrestaShop QA " + Date.now();
      const answer = "Local operator QA " + Date.now();
      const posted = visitor.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).origin === api &&
          /\/api\/conversations\/[^/]+\/messages$/.test(
            new URL(response.url()).pathname,
          ),
        { timeout: 30000 },
      );
      await input.fill(question);
      await frame
        .locator(".convor-chat > .convor-input .convor-input__send")
        .click();
      const message = await posted;
      assert.equal(message.status(), 201);
      const conversationId = new URL(message.url()).pathname.split("/")[3];
      const history = await context.request.get(
        api + "/api/conversations/" + conversationId + "/messages?limit=50",
        { headers: scope },
      );
      assert.equal(history.status(), 200);
      assert.ok(
        (await history.text()).includes(question),
        "Actual local operator history contains customer message",
      );
      const reply = await context.request.post(
        api + "/api/conversations/" + conversationId + "/messages",
        {
          headers: scope,
          data: { senderType: "operator", content: answer, type: "text" },
        },
      );
      assert.equal(reply.status(), 201);
      await expect(
        frame
          .locator(".convor-msg--operator .convor-msg__bubble")
          .filter({ hasText: answer }),
      ).toBeVisible({ timeout: 30000 });
      console.log(
        "PASS real two-way chat on public HTTPS storefront with local SaaS and realtime (explicit scoped browser local-network permission)",
      );
      await customer.close();
    } catch (error) {
      chatError = error;
    } finally {
      await chatBrowser.close();
    }
  }
  await keyField.fill("");
  await page.locator("#configuration_form_submit_btn").click();
  await expect(keyField).toHaveValue("");
  const unlinked = await context.request.get(shop + "/");
  const html = await unlinked.text();
  assert.ok(
    !html.includes(expected) && !html.includes(challenge),
    "Unlink removes public key and proof",
  );
  const removed = await context.request.delete(
    api + domainsPath + "/" + domain.id,
    { headers: scope },
  );
  assert.ok(removed.ok(), "Remove local synthetic domain");
  const status = await context.request.get(api + "/api/billing/trial-site", {
    headers: billing,
  });
  assert.equal(status.status(), 200);
  const verification = await status.json();
  assert.ok(
    !verification.configured || verification.verificationState !== "verified",
    "No active verified domain after removal",
  );
  console.log(
    "PASS verified public HTTPS site, real BO unlink removes marker, domain removal invalidates proof",
  );
  await context.close();
  if (chatError) throw chatError;
} finally {
  await browser.close();
}
