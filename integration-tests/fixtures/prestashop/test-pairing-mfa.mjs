// Real dashboard sign-in, native TOTP, organization selection and one-time
// pairing for a disposable account. The callback origin is synthetic and
// intercepted in Chromium; redemption is against the real local API.
// The actual PrestaShop callback is independently exercised by the ZIP matrix.
import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { chromium, expect } from "@playwright/test";

const api = "http://localhost:17243";
const dashboard = "http://localhost:17244";
assert.equal(process.env.CONVOR_API_URL, api);
assert.equal(process.env.CONVOR_DASHBOARD_URL, dashboard);
const email = process.env.CONVOR_TEST_EMAIL;
const password = process.env.CONVOR_TEST_PASSWORD;
const firstOrg = process.env.CONVOR_ORG_ID;
assert.match(email ?? "", /^prestashop-[a-f0-9]+@e2e\.test$/);
assert.ok(password && firstOrg);
const siteUrl = "https://ps-mfa-fixture.example.test/store/";
const callback =
  siteUrl + "index.php?fc=module&module=convor&controller=pairing";
const state = randomBytes(32).toString("hex");
const verifier = randomBytes(32).toString("hex");
const verifierHash = createHash("sha256").update(verifier).digest("hex");
const link = new URL("/integrations/prestashop", dashboard);
for (const [key, value] of Object.entries({
  ps_site: siteUrl,
  ps_callback: callback,
  ps_state: state,
  ps_proof: verifierHash,
}))
  link.searchParams.set(key, value);

function totp(uri) {
  const params = new URL(uri).searchParams;
  const secret = params.get("secret");
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
  const login = await req.post(api + "/api/auth/sign-in/email", {
    headers: origin,
    data: { email, password },
  });
  assert.equal(login.status(), 200);
  const second = await req.post(api + "/api/organizations", {
    headers: origin,
    data: {
      name: "PrestaShop MFA destination",
      slug: "ps-mfa-" + randomBytes(8).toString("hex"),
    },
  });
  assert.equal(second.status(), 201);
  const org = (await second.json()).id;
  assert.notEqual(org, firstOrg);
  const projects = await req.get(api + "/api/projects", {
    headers: { ...origin, "X-Organization-Id": org },
  });
  assert.equal(projects.status(), 200);
  const project = (await projects.json()).projects[0].id;
  const detail = await req.get(api + "/api/projects/" + project, {
    headers: { ...origin, "X-Organization-Id": org, "X-Project-Id": project },
  });
  assert.equal(detail.status(), 200);
  const expectedKey = (await detail.json()).project.widgetPublicKey;
  assert.match(expectedKey, /^convor_wpk_[a-f0-9]{64}$/);
  const enable = await req.post(api + "/api/auth/two-factor/enable", {
    headers: origin,
    data: { password },
  });
  assert.equal(enable.status(), 200);
  const uri = (await enable.json()).totpURI;
  assert.ok(uri, "Native MFA enrollment returned a TOTP URI");
  const activate = await req.post(api + "/api/auth/two-factor/verify-totp", {
    headers: origin,
    data: { code: totp(uri) },
  });
  assert.equal(activate.status(), 200);
  await enrollment.close();

  const context = await browser.newContext({ locale: "en-US" });
  let returned;
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin === new URL(siteUrl).origin &&
      route.request().isNavigationRequest()
    ) {
      returned = url;
      await route.fulfill({
        status: 200,
        contentType: "text/plain",
        body: "Synthetic merchant callback",
      });
    } else if (
      [api, dashboard, "http://localhost:17242"].includes(url.origin)
    ) {
      await route.continue();
    } else {
      await route.abort();
    }
  });
  const page = await context.newPage();
  await page.goto(link.href, { waitUntil: "load" });
  // Wait for the auth bundle to hydrate the SSR form before entering credentials.
  await page.waitForLoadState("networkidle", { timeout: 60000 });
  await expect(page.getByTestId("login-email")).toBeVisible({ timeout: 60000 });
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("mfa-code-input")).toBeVisible({
    timeout: 30000,
  });
  const scope = {
    ...origin,
    "X-Organization-Id": org,
    "X-Project-Id": project,
  };
  const denied = await page.request.post(
    api + "/api/prestashop/pairing/start",
    {
      headers: scope,
      data: { siteUrl, callback, state, verifierHash },
    },
  );
  assert.ok(
    [401, 403].includes(denied.status()),
    "Password alone cannot issue a pairing grant",
  );
  await page.getByTestId("mfa-code-input").fill(totp(uri));
  await page.getByTestId("mfa-verify-submit").click();
  const choice = page.getByTestId("organization-choice-option-" + org);
  await expect(choice).toBeVisible({ timeout: 60000 });
  // The chooser is SSR-rendered too. Wait for its client navigation handler.
  await page.waitForLoadState("networkidle", { timeout: 60000 });
  await choice.click();
  // The membership-validated /o/:id route sets the active organization
  // cookie, then redirects to the canonical integration URL.
  await page.waitForURL(
    (url) =>
      url.pathname === "/integrations/prestashop" &&
      url.searchParams.get("projectId") === project,
    { timeout: 60000 },
  );
  await expect(page.getByTestId("prestashop-widget-key")).toBeVisible({
    timeout: 60000,
  });
  const destination = new URL(page.url());
  assert.equal(destination.pathname, "/integrations/prestashop");
  assert.equal(destination.searchParams.get("projectId"), project);
  for (const [name, value] of link.searchParams) {
    assert.equal(
      destination.searchParams.get(name),
      value,
      "Preserved pairing continuation",
    );
  }
  assert.ok(
    (await page.getByTestId("prestashop-widget-key").inputValue()) ===
      expectedKey,
    "Correct project key after organization selection",
  );
  await page.getByRole("button", { name: "Connect this website" }).click();
  await expect.poll(() => Boolean(returned), { timeout: 30000 }).toBe(true);
  assert.equal(returned.searchParams.get("state"), state);
  assert.ok(!returned.searchParams.has("widgetKey"));
  const code = returned.searchParams.get("code");
  assert.match(code ?? "", /^[A-Za-z0-9_-]{32}$/);
  const redeem = () =>
    fetch(api + "/api/prestashop/pairing/redeem", {
      method: "POST",
      headers: {
        Origin: new URL(siteUrl).origin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code, state, verifier, callback }),
    });
  const grant = await redeem();
  assert.equal(grant.status, 200);
  assert.ok(
    (await grant.json()).widgetKey === expectedKey,
    "Grant belongs to selected tenant and project",
  );
  assert.equal((await redeem()).status, 400, "Grant is one-time");
  console.log(
    "PASS: native MFA login, password-only denial, two organizations/two projects, preserved pairing continuation, correct selected key, one-time redemption",
  );
} finally {
  await browser.close();
}
