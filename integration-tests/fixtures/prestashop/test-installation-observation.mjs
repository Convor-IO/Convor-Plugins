// Local SaaS acceptance for the shared WP/PS installation diagnostic.
// A bootstrap signal is not proof of domain ownership or delivery.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { chromium, expect } from "@playwright/test";

const api = "http://localhost:17243";
const dashboard = "http://localhost:17244";
assert.equal(process.env.CONVOR_API_URL, api);
assert.equal(process.env.CONVOR_DASHBOARD_URL, dashboard);
const required = (name) => {
  assert.ok(process.env[name], "Missing " + name);
  return process.env[name];
};
async function request(path, method = "GET", body, headers = {}) {
  return fetch(api + path, {
    method,
    redirect: "manual",
    headers: {
      Origin: dashboard,
      "Content-Type": "application/json",
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const login = await request("/api/auth/sign-in/email", "POST", {
  email: required("CONVOR_TEST_EMAIL"),
  password: required("CONVOR_TEST_PASSWORD"),
});
assert.equal(login.status, 200);
const cookie = login.headers
  .getSetCookie()
  .map((v) => v.split(";")[0])
  .join("; ");
const created = await request(
  "/api/organizations",
  "POST",
  {
    name: "PrestaShop installation diagnostic QA",
    slug: "ps-observation-" + randomBytes(8).toString("hex"),
  },
  { cookie },
);
assert.equal(created.status, 201);
const org = (await created.json()).id;
const list = await request("/api/projects", "GET", undefined, {
  cookie,
  "X-Organization-Id": org,
});
assert.equal(list.status, 200);
const project = (await list.json()).projects[0].id;
const scope = { cookie, "X-Organization-Id": org, "X-Project-Id": project };
const detail = await request(
  "/api/projects/" + project,
  "GET",
  undefined,
  scope,
);
assert.equal(detail.status, 200);
const key = (await detail.json()).project.widgetPublicKey;
assert.match(key, /^convor_wpk_[a-f0-9]{64}$/);
async function status(provider = "prestashop") {
  const response = await request(
    "/api/" + provider + "/installation/status",
    "GET",
    undefined,
    scope,
  );
  assert.equal(response.status, 200, provider + " diagnostic");
  assert.equal(response.headers.get("cache-control"), "no-store");
  return response.json();
}
assert.equal((await status()).status, "domain_required");
const domain = await request(
  "/api/projects/" + project + "/domains",
  "POST",
  { value: "shop-fixture.example.test", isPrimary: true },
  scope,
);
assert.ok(domain.ok, "configure primary domain on disposable website");
assert.equal((await status()).status, "not_observed");
assert.equal((await status("wordpress")).status, "not_observed");
async function bootstrap(origin) {
  const response = await request(
    "/api/auth/visitor-token",
    "POST",
    { key },
    {
      Origin: dashboard,
      "X-Convor-Parent-Origin": origin,
    },
  );
  assert.equal(response.status, 200, "actual visitor bootstrap");
}
await bootstrap("https://unrelated.example.test");
assert.equal((await status()).status, "not_observed");
await bootstrap("https://shop-fixture.example.test");
let observed;
for (let attempt = 0; attempt < 20; attempt++) {
  observed = await status();
  if (observed.status === "observed") break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
assert.equal(observed.status, "observed");
assert.equal(observed.hostname, "shop-fixture.example.test");
assert.ok(Number.isFinite(Date.parse(observed.observedAt)));
assert.deepEqual(await status("wordpress"), observed);
const anonymous = await request("/api/prestashop/installation/status");
assert.ok([401, 403].includes(anonymous.status), "no anonymous status");
const wrong = await request(
  "/api/prestashop/installation/status",
  "GET",
  undefined,
  {
    ...scope,
    "X-Organization-Id": required("CONVOR_ORG_ID"),
  },
);
assert.ok(
  [400, 403, 404].includes(wrong.status),
  "cross-tenant status rejected",
);
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
  });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return [
      api,
      dashboard,
      "http://localhost:17242",
      "ws://localhost:17242",
    ].includes(url.origin)
      ? route.continue()
      : route.abort();
  });
  const auth = await context.request.post(api + "/api/auth/sign-in/email", {
    headers: { Origin: dashboard },
    data: {
      email: required("CONVOR_TEST_EMAIL"),
      password: required("CONVOR_TEST_PASSWORD"),
    },
  });
  assert.equal(auth.status(), 200);
  const page = await context.newPage();
  for (const provider of ["prestashop", "wordpress"]) {
    await page.goto(
      dashboard +
        "/o/" +
        org +
        "/integrations/" +
        provider +
        "?projectId=" +
        project,
      { waitUntil: "domcontentloaded" },
    );
    const panel = page.getByTestId(provider + "-installation-status");
    await expect(panel).toBeVisible({ timeout: 60000 });
    await expect(panel.getByRole("status")).toContainText(
      "shop-fixture.example.test",
    );
    await expect(panel.getByRole("status")).toContainText(
      /Test a conversation|Wyślij wiadomość testową/,
    );
    await panel
      .getByRole("button", { name: /Refresh status|Odśwież stan/ })
      .click();
    await expect(panel.getByRole("status")).toContainText(
      "shop-fixture.example.test",
    );
  }
} finally {
  await browser.close();
}
console.log(
  "PASS: actual shared installation API/Redis and WP/PS dashboard diagnostic, missing domain, absent signal, wrong origin, observed, cross-tenant and anonymous denial",
);
