// Public marketing screenshots from the actual installed module and local SaaS.
// Uses a disposable, branded sample website and a real two-way conversation.
// No customer records, remote services, generated UI or screenshot compositing.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const shop = "http://localhost:18217";
const api = "http://localhost:17243";
const dashboard = "http://localhost:17244";
const container = "convor-prestashop-1807-prestashop-1";
assert.equal(process.env.PRESTASHOP_URL, shop);
assert.equal(process.env.CONVOR_API_URL, api);
assert.equal(process.env.CONVOR_DASHBOARD_URL, dashboard);
assert.match(
  process.env.CONVOR_TEST_EMAIL ?? "",
  /^prestashop-[a-f0-9]+@e2e\.test$/,
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
  "convor-prestashop-1807",
);
function php(code, extra = {}) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "-u",
      "www-data",
      ...Object.entries(extra).flatMap(([key, value]) => [
        "-e",
        key + "=" + value,
      ]),
      container,
      "php",
    ],
    {
      input:
        '<?php\nrequire "/var/www/html/config/config.inc.php";\n$m=Module::getInstanceByName("convor");\nif (_PS_VERSION_!=="9.2.1" || !$m || !defined("CONVOR_PRESTASHOP_LOCAL_QA") || CONVOR_PRESTASHOP_LOCAL_QA!==true || Convor::endpoint("cdn")!=="http://localhost:17243") exit(1);\n' +
        code,
      encoding: "utf8",
    },
  ).trim();
}
const original = php("echo json_encode($m->settings(), JSON_THROW_ON_ERROR);");
const setSettings = (settings) =>
  php(
    'if (!$m->saveSettings(json_decode(getenv("CAPTURE_SETTINGS"),true,512,JSON_THROW_ON_ERROR)))exit(1);Tools::clearSmartyCache();',
    { CAPTURE_SETTINGS: JSON.stringify(settings) },
  );
const { marketingPeople } = await import(
  new URL(
    "../../../../../../saas/.worktrees/feat-prestashop-finalization-1807/tests/fixtures/marketing-people/index.mjs",
    import.meta.url,
  )
);
const roster = marketingPeople.map((person) => person.name);
const server = "convor-feat-prestashop-finalization-1807-dev-server-1";
assert.equal(
  execFileSync(
    "docker",
    [
      "inspect",
      "-f",
      '{{ index .Config.Labels "com.docker.compose.project" }}',
      server,
    ],
    { encoding: "utf8" },
  ).trim(),
  "convor-feat-prestashop-finalization-1807-dev",
);
const folder = resolve(
  process.env.CONVOR_LANDING_SCREENSHOTS ?? "dist/prestashop-landing",
);
mkdirSync(folder, { recursive: true });
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
try {
  const operator = await browser.newContext();
  const req = operator.request;
  const scope = {
    Origin: dashboard,
    "X-Organization-Id": process.env.CONVOR_ORG_ID,
    "X-Project-Id": process.env.CONVOR_PROJECT_ID,
  };
  const login = await req.post(api + "/api/auth/sign-in/email", {
    headers: { Origin: dashboard },
    data: {
      email: process.env.CONVOR_TEST_EMAIL,
      password: process.env.CONVOR_TEST_PASSWORD,
    },
  });
  assert.equal(login.status(), 200);
  // Reuse a populated, explicitly owned publication tenant. Persist the
  // canonical operator identity BEFORE writing new conversation messages.
  execFileSync(
    "docker",
    [
      "exec",
      "-w",
      "/app/apps/server",
      server,
      "/app/scripts/compose-pnpm.sh",
      "exec",
      "tsx",
      "/app/tests/fixtures/marketing-people/apply.ts",
      process.env.CONVOR_ORG_ID,
      "pl",
      process.env.CONVOR_PROJECT_ID,
    ],
    { stdio: "inherit" },
  );
  const profile = await req.get(api + "/api/users/me", {
    headers: {
      Origin: dashboard,
      "X-Organization-Id": process.env.CONVOR_ORG_ID,
    },
  });
  assert.equal(profile.status(), 200);
  const { id: userId, name } = await profile.json();
  assert.ok(
    roster.includes(name),
    "Operator must come from the shared publication roster",
  );
  const presence = await req.patch(api + "/api/presence/status", {
    headers: {
      Origin: dashboard,
      "X-Organization-Id": process.env.CONVOR_ORG_ID,
    },
    data: { userId, status: "online" },
  });
  assert.equal(presence.status(), 200);
  const siteRoute = api + "/api/projects/" + process.env.CONVOR_PROJECT_ID;
  const renamed = await req.patch(siteRoute, {
    headers: scope,
    data: { name: "TopSoft4U", timezone: "Europe/Warsaw" },
  });
  if (!renamed.ok()) {
    const failure = await renamed.json().catch(() => ({}));
    throw new Error(
      "Rename site HTTP " +
        renamed.status() +
        " " +
        (failure.error?.code ?? failure.code ?? "unknown"),
    );
  }
  const site = (await renamed.json()).project;
  assert.equal(site.name, "TopSoft4U");
  const key = site.widgetPublicKey;
  assert.match(key, /^convor_wpk_[a-f0-9]{64}$/);
  setSettings({
    ...JSON.parse(original),
    enabled: true,
    widget_key: key,
    website_name: "TopSoft4U",
    verification_challenge: "",
    identity_enabled: false,
    identity_secret: "",
    consent_required: false,
    commerce_context: true,
    exclude_checkout: true,
  });

  if (process.env.CAPTURE_PUBLICATION_SETTINGS === "1") {
    const language = (locale) =>
      php(
        ' $e=new Employee(1); $old=(new Language((int)$e->id_lang))->iso_code; $e->id_lang=(int)Language::getIdByIso(getenv("CAPTURE_LOCALE")); if(!$e->id_lang||!$e->update())exit(1); echo $old;',
        { CAPTURE_LOCALE: locale },
      );
    const initialLanguage = language("en");
    try {
      for (const locale of ["en", "pl"]) {
        language(locale);
        execFileSync(
          "node",
          ["integration-tests/fixtures/prestashop/capture-docs.mjs"],
          {
            env: {
              ...process.env,
              DOCS_LOCALE: locale,
              DOCS_CAPTURE_SETTINGS_ONLY: "1",
              CONVOR_DOCS_SCREENSHOTS: folder,
            },
            stdio: "inherit",
          },
        );
      }
    } finally {
      language(initialLanguage);
    }
  }
  for (const locale of process.env.CAPTURE_PUBLICATION_SETTINGS_ONLY === "1"
    ? []
    : ["en", "pl"]) {
    for (const theme of ["light", "dark"]) {
      const updated = await req.patch(api + "/api/settings", {
        headers: scope,
        data: { widget: { theme } },
      });
      assert.equal(updated.status(), 200, "Set actual widget appearance");
      const visitor = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 2,
        colorScheme: theme,
        locale: locale === "pl" ? "pl-PL" : "en-US",
        userAgent:
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36",
      });
      try {
        await visitor.route("**/*", (r) =>
          allowed.has(new URL(r.request().url()).origin)
            ? r.continue()
            : r.abort(),
        );
        const page = await visitor.newPage();
        const diagnostics = [];
        page.on("requestfailed", (request) => {
          const url = new URL(request.url());
          if (url.origin === api)
            diagnostics.push({
              path: url.pathname,
              error: request.failure()?.errorText,
            });
        });
        page.on("response", (response) => {
          const url = new URL(response.url());
          if (url.origin === api)
            diagnostics.push({ path: url.pathname, status: response.status() });
        });
        await page.goto(shop + "/" + locale + "/", {
          waitUntil: "domcontentloaded",
        });
        const product = page
          .locator(
            'article.product-miniature a[href*="hummingbird-printed-t-shirt"]',
          )
          .first();
        const productHref = await product.getAttribute("href");
        assert.ok(productHref);
        await page.goto(new URL(productHref, page.url()).href, {
          waitUntil: "domcontentloaded",
        });
        await expect(page.locator("h1")).toContainText(/Hummingbird/i);
        assert.ok(
          (await page.locator("html").getAttribute("lang")).startsWith(locale),
        );
        try {
          await expect
            .poll(
              () =>
                page.evaluate(() => window.Convor?.getState().ready ?? false),
              { timeout: 30000 },
            )
            .toBe(true);
        } catch (error) {
          console.log(
            "Local widget initialization diagnostic",
            await page.evaluate(() => ({
              script: !!document.querySelector('script[src*="widget.js"]'),
              marker: !!document.querySelector(
                "script[data-convor-verification]",
              ),
              sdk: !!window.Convor,
              launcher: !!document.querySelector(".convor-trigger"),
            })),
            diagnostics.slice(-15),
          );
          throw error;
        }
        await page.locator(".convor-trigger").click();
        const wrapper = page.locator(".convor-frame-wrapper.is-open");
        await expect(wrapper).toBeVisible();
        await wrapper.evaluate(async (el) => {
          await Promise.all(
            el
              .getAnimations()
              .map((animation) => animation.finished.catch(() => {})),
          );
        });
        const frame = page.frameLocator('iframe[src*="widget-iframe"]').first();
        const start = frame.locator('[data-welcome-action="start"]');
        const input = frame.locator(
          '.convor-chat > .convor-input [data-testid="widget-input-field"]',
        );
        await expect(
          start.or(input).filter({ visible: true }).first(),
        ).toBeVisible({ timeout: 30000 });
        if (!(await input.isVisible()) && (await start.isVisible())) {
          try {
            await start.click({ timeout: 3000 });
          } catch (error) {
            if (!(await input.isVisible())) throw error;
          }
        }
        await expect(input).toBeVisible({ timeout: 30000 });
        const question =
          locale === "pl"
            ? "Dzień dobry! Jak dobrać rozmiar tej koszulki?"
            : "Hello! How do I choose the right size for this T-shirt?";
        const answer =
          locale === "pl"
            ? "Dzień dobry! Podaj proszę obwód klatki piersiowej, a pomogę Ci dobrać rozmiar."
            : "Hello! Let me know your chest measurement and I'll help you choose a size.";
        const posted = page.waitForResponse(
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
        const id = new URL(message.url()).pathname.split("/")[3];
        const history = await req.get(
          api + "/api/conversations/" + id + "/messages?limit=50",
          { headers: scope },
        );
        assert.equal(history.status(), 200);
        assert.ok((await history.text()).includes(question));
        const reply = await req.post(
          api + "/api/conversations/" + id + "/messages",
          {
            headers: scope,
            data: { senderType: "operator", content: answer, type: "text" },
          },
        );
        assert.equal(reply.status(), 201);
        const responseBubble = frame
          .locator(".convor-msg--operator .convor-msg__bubble")
          .filter({ hasText: answer });
        await expect(responseBubble).toBeVisible({ timeout: 30000 });
        const operatorPortrait = frame
          .locator('.convor-msg--operator img[src*="publication-people"]')
          .first();
        await expect(operatorPortrait).toBeVisible({ timeout: 30000 });
        await expect
          .poll(
            () =>
              operatorPortrait.evaluate(
                (img) => img.complete && img.naturalWidth > 0,
              ),
            { timeout: 30000 },
          )
          .toBe(true);
        const chat = frame.locator(".convor-chat");
        await expect(chat).toContainText("TopSoft4U");
        await expect(chat).not.toContainText(
          /PrestaShop QA|example\.test|Lorem ipsum/i,
        );
        await page.evaluate(() => document.fonts.ready);
        await frame.locator("body").evaluate(() => document.fonts.ready);
        // Real capture of the product view. Do not crop inside the chat or its shadow.
        await page.screenshot({
          path: resolve(folder, locale + "-chat-" + theme + ".png"),
          animations: "disabled",
        });
        console.log(
          "PASS actual PrestaShop product chat and reply:",
          locale,
          theme,
        );
      } finally {
        await visitor.close();
      }
    }
  }
  await operator.close();
} finally {
  await browser.close();
  setSettings(JSON.parse(original));
  assert.equal(
    php("echo json_encode($m->settings(),JSON_THROW_ON_ERROR);"),
    original,
    "Restore original shop settings",
  );
  console.log("PASS restored original local shop settings");
}
