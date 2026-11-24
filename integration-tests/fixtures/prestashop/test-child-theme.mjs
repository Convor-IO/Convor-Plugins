// Real child-theme acceptance on the owned PS8.2.9 compatibility shop.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chromium, expect } from "@playwright/test";

const container = "convor-prestashop-1807-82-prestashop-1";
const shop = "http://localhost:18218";
const api = "http://localhost:17243";
const dashboard = "http://localhost:17244";
const child = "convor_qa_child";
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
    { input: "<?php\n" + code, encoding: "utf8" },
  ).trim();
}
function consoleCommand(...args) {
  execFileSync(
    "docker",
    [
      "exec",
      "-u",
      "www-data",
      container,
      "php",
      "/var/www/html/bin/console",
      "--env=prod",
      ...args,
      "--no-interaction",
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
}
const root = "/var/www/html/themes";
const parent = root + "/classic/templates/_partials/head.tpl";
const original = execFileSync("docker", ["exec", container, "cat", parent]);
const originalHash = createHash("sha256").update(original).digest("hex");
const snapshot = JSON.parse(
  php(`require "/var/www/html/config/config.inc.php";
$m=Module::getInstanceByName("convor");
$s=$m->settings();
if(Context::getContext()->shop->theme_name!=="classic" || !Convor::validKey($s["widget_key"]) || !empty($s["identity_enabled"]) || !empty($s["consent_required"]))throw new RuntimeException("Fixture not in ordinary anonymous state");
echo json_encode(["settings"=>$s,"cache"=>Configuration::get("PS_SMARTY_CACHE"),"css"=>Configuration::get("PS_CSS_THEME_CACHE"),"js"=>Configuration::get("PS_JS_THEME_CACHE")]);`),
);
const key = snapshot.settings.widget_key;
const allowed = new Set([
  shop,
  api,
  dashboard,
  "http://localhost:17242",
  "ws://localhost:17242",
]);
const browser = await chromium.launch({
  headless: true,
  args: ["--disable-blink-features=AutomationControlled"],
});
async function newPage() {
  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36",
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
let childCreated = false,
  moduleRemoved = false;
try {
  php(`$path="/var/www/html/themes/convor_qa_child";
if(file_exists($path))throw new RuntimeException("Existing child fixture");
mkdir($path."/config",0775,true);mkdir($path."/templates/_partials",0775,true);
$yaml=file_get_contents("/var/www/html/themes/classic/config/theme.yml");
$yaml=preg_replace('/^name: classic$/m',"name: convor_qa_child\\nparent: classic",$yaml,1);
$yaml=preg_replace('/^display_name: Classic$/m',"display_name: Convor QA Child",$yaml,1);
$yaml=preg_replace('/^assets:$/m',"assets:\\n  use_parent_assets: true",$yaml,1);
file_put_contents($path."/config/theme.yml",$yaml);
copy("/var/www/html/themes/classic/preview.png",$path."/preview.png");
copy("/var/www/html/themes/classic/templates/_partials/head.tpl",$path."/templates/_partials/head.tpl");`);
  childCreated = true;
  consoleCommand("prestashop:theme:enable", child);
  assert.equal(
    php(
      'require "/var/www/html/config/config.inc.php";echo Context::getContext()->shop->theme_name;',
    ),
    child,
  );
  php(
    'require "/var/www/html/config/config.inc.php"; Configuration::updateValue("PS_SMARTY_CACHE",1);Configuration::updateValue("PS_CSS_THEME_CACHE",1);Configuration::updateValue("PS_JS_THEME_CACHE",1);',
  );
  consoleCommand("cache:clear");
  const page = await newPage();
  try {
    await page.goto(shop, { waitUntil: "domcontentloaded" });
    await expect(
      page.locator('script[src*="/widget.js"][data-key]'),
    ).toHaveCount(1);
    await expect
      .poll(
        () => page.evaluate(() => window.Convor?.getState().ready ?? false),
        { timeout: 30000 },
      )
      .toBe(true);
    await expect(page.locator(".convor-trigger")).toHaveCount(1);
    console.log("PASS child theme with installed module, Smarty and CCC");
    // Same-key duplicate is safe at the widget boundary, even though merchants
    // should remove duplicate installations as documented.
    php(
      `$path="/var/www/html/themes/convor_qa_child/templates/_partials/head.tpl";
file_put_contents($path,'\\n<script src="http://localhost:17243/widget.js" data-key="'.getenv("QA_PUBLIC_WIDGET_KEY").'" async></script>\\n',FILE_APPEND);`,
      { QA_PUBLIC_WIDGET_KEY: key },
    );
    consoleCommand("cache:clear");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.locator('script[src*="/widget.js"][data-key]'),
    ).toHaveCount(2);
    await expect
      .poll(
        () => page.evaluate(() => window.Convor?.getState().ready ?? false),
        { timeout: 30000 },
      )
      .toBe(true);
    await expect(page.locator(".convor-trigger")).toHaveCount(1);
    console.log(
      "PASS duplicate same-key module plus manual snippet has one launcher",
    );
    // The manual installation must not depend on the module at all.
    consoleCommand("prestashop:module", "uninstall", "convor");
    moduleRemoved = true;
    consoleCommand("cache:clear");
    await page.reload({ waitUntil: "domcontentloaded" });
    const tag = page.locator('script[src*="/widget.js"][data-key]');
    await expect(tag).toHaveCount(1);
    await expect(tag).toHaveAttribute("data-key", key);
    await expect
      .poll(
        () => page.evaluate(() => window.Convor?.getState().ready ?? false),
        { timeout: 30000 },
      )
      .toBe(true);
    await page.locator(".convor-trigger").click();
    const frame = page.frameLocator('iframe[src*="widget-iframe"]').first();
    const composer = frame.locator(
      '.convor-chat > .convor-input [data-testid="widget-input-field"]',
    );
    const start = frame.locator('[data-welcome-action="start"]');
    await expect(
      start.or(composer).filter({ visible: true }).first(),
    ).toBeVisible();
    if (!(await composer.isVisible()) && (await start.isVisible())) {
      try {
        await start.click({ timeout: 3000 });
      } catch (error) {
        if (!(await composer.isVisible())) throw error;
      }
    }
    await expect(composer).toBeVisible();
    const message = "Child theme QA " + randomBytes(6).toString("hex");
    const response = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        /\/api\/conversations\/[^/]+\/messages$/.test(
          new URL(r.url()).pathname,
        ),
    );
    await composer.fill(message);
    await frame
      .locator(".convor-chat > .convor-input .convor-input__send")
      .click();
    const sent = await response;
    assert.equal(sent.status(), 201);
    const id = new URL(sent.url()).pathname.split("/")[3];
    const operator = await newPage();
    const login = await operator.request.post(api + "/api/auth/sign-in/email", {
      headers: { Origin: dashboard },
      data: {
        email: required("CONVOR_TEST_EMAIL"),
        password: required("CONVOR_TEST_PASSWORD"),
      },
    });
    assert.equal(login.status(), 200);
    const headers = {
      Origin: dashboard,
      "X-Organization-Id": required("CONVOR_ORG_ID"),
      "X-Project-Id": required("CONVOR_PROJECT_ID"),
    };
    const history = await operator.request.get(
      api + "/api/conversations/" + id + "/messages?limit=50",
      { headers },
    );
    assert.equal(history.status(), 200);
    assert.ok((await history.text()).includes(message));
    const answer = "Child theme verified";
    const reply = await operator.request.post(
      api + "/api/conversations/" + id + "/messages",
      {
        headers,
        data: { senderType: "operator", content: answer, type: "text" },
      },
    );
    assert.equal(reply.status(), 201);
    await expect(
      frame
        .locator(".convor-msg--operator .convor-msg__bubble")
        .filter({ hasText: answer }),
    ).toBeVisible({ timeout: 30000 });
    await operator.close();
    console.log(
      "PASS real two-way chat through actual child theme with Convor module uninstalled",
    );
  } finally {
    await page.close();
  }
} finally {
  await browser.close();
  if (childCreated) {
    consoleCommand("prestashop:theme:enable", "classic");
    execFileSync("docker", [
      "exec",
      "-u",
      "www-data",
      container,
      "rm",
      "-rf",
      root + "/" + child,
      "/var/www/html/config/themes/" + child,
    ]);
  }
  if (moduleRemoved) consoleCommand("prestashop:module", "install", "convor");
  php(
    `require "/var/www/html/config/config.inc.php";require_once "/var/www/html/modules/convor/convor.php";
$data=json_decode(base64_decode(getenv("QA_SETTINGS")),true,512,JSON_THROW_ON_ERROR);
$m=Module::getInstanceByName("convor");if(!$m->saveSettings($data["settings"]))throw new RuntimeException("Settings restoration failed");
Configuration::updateValue("PS_SMARTY_CACHE",$data["cache"]);
Configuration::updateValue("PS_CSS_THEME_CACHE",$data["css"]);
Configuration::updateValue("PS_JS_THEME_CACHE",$data["js"]);`,
    { QA_SETTINGS: Buffer.from(JSON.stringify(snapshot)).toString("base64") },
  );
  consoleCommand("cache:clear");
  assert.equal(
    createHash("sha256")
      .update(execFileSync("docker", ["exec", container, "cat", parent]))
      .digest("hex"),
    originalHash,
  );
  console.log(
    "PASS original Classic theme unchanged, module and fixture settings restored",
  );
}
