import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";

const container = "convor-prestashop-1807-82-prestashop-1";
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
const first = "http://localhost:18218";
const second = "http://127.0.0.1:18218";
const api = "http://localhost:17243";
const dashboard = "http://localhost:17244";
const allowed = new Set([
  first,
  second,
  api,
  dashboard,
  "http://localhost:17242",
  "ws://localhost:17242",
]);
for (const [name, value] of [
  ["CONVOR_API_URL", api],
  ["CONVOR_DASHBOARD_URL", dashboard],
])
  assert.equal(process.env[name], value);
function required(name) {
  const value = process.env[name];
  if (!value) throw new Error("Missing " + name);
  return value;
}
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
        "CONVOR_QA_MULTISHOP_ACTION=" + action,
        ...Object.entries(vars).flatMap(([k, v]) => ["-e", k + "=" + v]),
        container,
        "php",
      ],
      {
        input: readFileSync(
          new URL("./multistore-fixture.php", import.meta.url),
        ),
        encoding: "utf8",
      },
    ),
  );
const browser = await chromium.launch({
  headless: true,
  args: ["--disable-blink-features=AutomationControlled"],
});
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";
async function newPage() {
  const page = await browser.newPage({
    userAgent: UA,
    viewport: { width: 1440, height: 1050 },
  });
  await page
    .context()
    .route("**/*", (route) =>
      allowed.has(new URL(route.request().url()).origin)
        ? route.continue()
        : route.abort(),
    );
  return page;
}
const scope = (org, project) => ({
  Origin: dashboard,
  "X-Organization-Id": org,
  ...(project ? { "X-Project-Id": project } : {}),
});
let fixture;
try {
  const bo = await newPage();
  const login = await bo.request.post(api + "/api/auth/sign-in/email", {
    headers: { Origin: dashboard },
    data: {
      email: required("CONVOR_TEST_EMAIL"),
      password: required("CONVOR_TEST_PASSWORD"),
    },
  });
  assert.equal(login.status(), 200);
  const a = {
    org: required("CONVOR_ORG_ID"),
    project: required("CONVOR_PROJECT_ID"),
  };
  const projectA = await bo.request.get(api + "/api/projects/" + a.project, {
    headers: scope(a.org, a.project),
  });
  assert.equal(projectA.status(), 200);
  a.key = (await projectA.json()).project.widgetPublicKey;
  const org = await bo.request.post(api + "/api/organizations", {
    headers: { Origin: dashboard },
    data: {
      name: "PrestaShop multistore QA B",
      slug: "ps-multistore-" + randomBytes(5).toString("hex"),
    },
  });
  assert.equal(org.status(), 201);
  const b = { org: (await org.json()).id };
  const projects = await bo.request.get(api + "/api/projects", {
    headers: scope(b.org),
  });
  assert.equal(projects.status(), 200);
  const p = (await projects.json()).projects[0];
  b.project = p.id;
  const projectB = await bo.request.get(api + "/api/projects/" + b.project, {
    headers: scope(b.org, b.project),
  });
  assert.equal(projectB.status(), 200);
  b.key = (await projectB.json()).project.widgetPublicKey;
  assert.match(a.key, /^convor_wpk_[a-f0-9]{64}$/);
  assert.match(b.key, /^convor_wpk_[a-f0-9]{64}$/);
  assert.notEqual(a.key, b.key);

  fixture = php("create");
  assert.ok(fixture.shopId > 1);
  await bo.goto(first + "/admin-dev/", { waitUntil: "domcontentloaded" });
  await bo.locator("#email").fill("prestashop-qa@example.test");
  await bo
    .locator("#passwd")
    .fill(process.env.PRESTASHOP_ADMIN_PASSWORD ?? "PrestashopQa1807!");
  await bo.locator("#submit_login").click();
  const manager = bo
    .locator('a[href*="/modules/manage"],a[href*="AdminModulesManage"]')
    .first();
  await manager.waitFor({ state: "attached" });
  await bo.goto(new URL(await manager.getAttribute("href"), bo.url()).href, {
    waitUntil: "domcontentloaded",
  });
  const config = bo.locator('a[href*="/action/configure/convor?"]').first();
  await config.waitFor();
  await bo.goto(new URL(await config.getAttribute("href"), bo.url()).href, {
    waitUntil: "domcontentloaded",
  });
  const switchShop = async (value) => {
    const url = new URL(bo.url());
    url.searchParams.set("setShopContext", value);
    await bo.goto(url.href, { waitUntil: "domcontentloaded" });
  };
  const field = bo.locator("#CONVOR_WIDGET_KEY");
  await switchShop("s-1");
  await expect(field).toHaveValue(a.key);
  await switchShop("s-" + fixture.shopId);
  await expect(field).toHaveValue("");
  await field.fill(b.key);
  await bo
    .locator('input[name="CONVOR_ENABLED"][value="1"]')
    .check({ force: true });
  await bo.locator("#configuration_form_submit_btn").click();
  await expect(field).toHaveValue(b.key);
  await switchShop("g-1");
  await expect(
    bo.getByText(
      "Select one shop and sign in with permission to configure this module.",
    ),
  ).toBeVisible();
  await expect(field).toHaveCount(0);
  await switchShop("a");
  await expect(field).toHaveCount(0);
  await switchShop("s-1");
  await expect(field).toHaveValue(a.key);
  await switchShop("s-" + fixture.shopId);
  await expect(field).toHaveValue(b.key);

  async function talk(site, target) {
    const page = await newPage();
    try {
      await page.goto(site + "/", { waitUntil: "domcontentloaded" });
      const script = page.locator('script[src*="/widget.js"][data-key]');
      await expect(script).toHaveCount(1);
      await expect(script).toHaveAttribute("data-key", target.key);
      await expect
        .poll(
          () => page.evaluate(() => window.Convor?.getState().ready ?? false),
          { timeout: 30000 },
        )
        .toBe(true);
      await page.locator(".convor-trigger").click();
      const frame = page.frameLocator('iframe[src*="widget-iframe"]').first();
      const input = frame.locator(
        '.convor-chat > .convor-input [data-testid="widget-input-field"]',
      );
      const start = frame.locator('[data-welcome-action="start"]');
      await expect(
        start.or(input).filter({ visible: true }).first(),
      ).toBeVisible();
      if (!(await input.isVisible()) && (await start.isVisible())) {
        try {
          await start.click({ timeout: 3000 });
        } catch (error) {
          if (!(await input.isVisible())) throw error;
        }
      }
      await expect(input).toBeVisible();
      const question = "Multistore QA " + randomBytes(6).toString("hex");
      const answer = "Operator QA " + randomBytes(6).toString("hex");
      const posted = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          /\/api\/conversations\/[^/]+\/messages$/.test(
            new URL(response.url()).pathname,
          ),
      );
      await input.fill(question);
      await expect(input).toHaveValue(question);
      await frame
        .locator(".convor-chat > .convor-input .convor-input__send")
        .click();
      const response = await posted;
      assert.equal(response.status(), 201);
      const id = new URL(response.url()).pathname.split("/")[3];
      const history = await bo.request.get(
        api + "/api/conversations/" + id + "/messages?limit=50",
        { headers: scope(target.org, target.project) },
      );
      assert.equal(history.status(), 200);
      assert.ok((await history.text()).includes(question));
      const reply = await bo.request.post(
        api + "/api/conversations/" + id + "/messages",
        {
          headers: scope(target.org, target.project),
          data: { senderType: "operator", content: answer, type: "text" },
        },
      );
      assert.equal(reply.status(), 201);
      await expect(
        frame
          .locator(".convor-msg--operator .convor-msg__bubble")
          .filter({ hasText: answer }),
      ).toBeVisible({ timeout: 30000 });
      return id;
    } finally {
      await page.close();
    }
  }
  const idA = await talk(first, a);
  const idB = await talk(second, b);
  assert.notEqual(idA, idB);
  for (const [id, target] of [
    [idA, b],
    [idB, a],
  ]) {
    const response = await bo.request.get(
      api + "/api/conversations/" + id + "/messages?limit=50",
      { headers: scope(target.org, target.project) },
    );
    assert.ok(
      [403, 404].includes(response.status()),
      "Cross-organization history must be denied",
    );
  }
  await switchShop("s-1");
  console.log(
    "PASS: two real storefront domains, two distinct SaaS organizations/projects and conversations; BO context isolation, group/all blocked, cross-org messages denied",
  );
} finally {
  await browser.close();
  if (fixture) {
    assert.deepEqual(
      php("remove", {
        CONVOR_QA_MULTISHOP_ID: fixture.shopId,
        CONVOR_QA_MULTISHOP_OLD: fixture.oldMulti,
      }),
      { removed: true },
    );
    console.log("PASS: temporary shop and scoped configuration removed");
  }
}
