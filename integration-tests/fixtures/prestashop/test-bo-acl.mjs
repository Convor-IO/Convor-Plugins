import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
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
const suffix = randomBytes(8).toString("hex");
const email = `convor-acl-${suffix}@example.test`;
const password = `Qa1!${randomBytes(24).toString("base64url")}`;
const php = (action, vars = {}) =>
  JSON.parse(
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "-u",
        "www-data",
        "-e",
        `CONVOR_QA_ACL_ACTION=${action}`,
        "-e",
        `CONVOR_QA_ACL_SUFFIX=${suffix}`,
        ...Object.entries(vars).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
        container,
        "php",
      ],
      {
        input: readFileSync(new URL("./acl-fixture.php", import.meta.url)),
        encoding: "utf8",
      },
    ),
  );
const browser = await chromium.launch({ headless: true });
async function login(email, password) {
  const page = await browser.newPage();
  await page
    .context()
    .route("**/*", (route) =>
      new URL(route.request().url()).origin === shop
        ? route.continue()
        : route.abort(),
    );
  await page.goto(shop + "/admin-dev/", { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(email);
  await page.locator("#passwd").fill(password);
  await page.locator("#submit_login").click();
  await expect(page.locator("#email")).not.toBeVisible({ timeout: 30000 });
  const manager = page.locator('a[href*="/modules/manage"]').first();
  try {
    await manager.waitFor({ state: "attached", timeout: 15000 });
  } catch (error) {
    console.error("BO login diagnostic", {
      pathname: new URL(page.url()).pathname,
      controller: new URL(page.url()).searchParams.get("controller"),
      title: await page.title(),
      headings: (
        await page.locator("h1,h2,.alert-danger").allTextContents()
      ).slice(0, 5),
    });
    throw error;
  }
  return page;
}
let fixture;
try {
  const admin = await login(
    "prestashop-qa@example.test",
    process.env.PRESTASHOP_ADMIN_PASSWORD ?? "PrestashopQa1807!",
  );
  const manager = admin.locator('a[href*="/modules/manage"]').first();
  await manager.waitFor({ state: "attached" });
  await admin.goto(
    new URL(await manager.getAttribute("href"), admin.url()).href,
    { waitUntil: "domcontentloaded" },
  );
  const config = admin.locator('a[href*="/action/configure/convor?"]').first();
  await config.waitFor();
  const target = new URL(await config.getAttribute("href"), admin.url());
  await admin.goto(target.href, { waitUntil: "domcontentloaded" });
  const key = admin.locator("#CONVOR_WIDGET_KEY");
  await expect(key).toBeVisible();
  const saved = await key.inputValue();
  assert.match(saved, /^convor_wpk_[a-f0-9]{64}$/);
  const digest = php("state").digest;
  fixture = php("create", { CONVOR_QA_ACL_PASSWORD: password });
  const restricted = await login(email, password);
  // Use the restricted user's own Symfony token, not an invalid token
  // from the administrator session. The authorization check must deny it.
  const ownLink = restricted.locator('a[href*="/modules/manage"]').first();
  await ownLink.waitFor({ state: "attached" });
  const ownUrl = new URL(await ownLink.getAttribute("href"), restricted.url());
  const token = ownUrl.searchParams.get("_token");
  assert.ok(token);
  target.searchParams.set("_token", token);
  const result = await restricted.goto(target.href, {
    waitUntil: "domcontentloaded",
  });
  assert.ok(result);
  await expect(restricted.locator("#CONVOR_WIDGET_KEY")).toHaveCount(0);
  assert.ok(
    !(await restricted.content()).includes(saved),
    "Restricted employee cannot read key",
  );
  for (const form of [
    {
      submitConvorSettings: "1",
      CONVOR_WIDGET_KEY: "convor_wpk_" + "b".repeat(64),
      CONVOR_ENABLED: "1",
    },
    { submitConvorPairStart: "1" },
    {
      submitConvorPairComplete: "1",
      CONVOR_PAIR_STATE: "a".repeat(64),
      CONVOR_PAIR_CODE: "b".repeat(32),
    },
  ]) {
    const post = await restricted.request.post(target.href, {
      form: { ...form, token },
      maxRedirects: 0,
    });
    const html = await post.text();
    assert.ok(
      !html.includes(saved),
      "No credential leakage through forbidden POST",
    );
    assert.ok(!html.includes('name="CONVOR_WIDGET_KEY"'));
    assert.equal(
      php("state").digest,
      digest,
      "Unauthorized POST must not change persisted module settings",
    );
  }
  console.log(
    "PASS: real read-only employee with module view but no configure rights cannot open settings, pair or change configuration",
  );
} finally {
  await browser.close();
  if (fixture)
    assert.deepEqual(
      php("remove", {
        CONVOR_QA_ACL_PROFILE: fixture.profile,
        CONVOR_QA_ACL_EMPLOYEE: fixture.employee,
      }),
      { removed: true },
    );
}
