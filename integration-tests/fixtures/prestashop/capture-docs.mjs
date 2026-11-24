import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
const shop = required("PRESTASHOP_URL");
const api = required("CONVOR_API_URL");
const dashboard = required("CONVOR_DASHBOARD_URL");
const origins = new Set(
  [shop, api, dashboard].map((url) => new URL(url).origin),
);
for (const url of origins) {
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
    throw new Error("Local fixture only");
}
const locale = process.env.DOCS_LOCALE === "pl" ? "pl" : "en";
const folder = resolve(required("CONVOR_DOCS_SCREENSHOTS"), locale);
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--disable-blink-features=AutomationControlled"],
});
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";
origins.add("http://localhost:17242");
origins.add("ws://localhost:17242");
async function capture() {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1160 },
    deviceScaleFactor: 2,
    locale: locale === "pl" ? "pl-PL" : "en-US",
  });
  await page
    .context()
    .route("**/*", (route) =>
      origins.has(new URL(route.request().url()).origin)
        ? route.continue()
        : route.abort(),
    );
  await page
    .context()
    .addCookies([
      { name: "convor_dashboard_lang", value: locale, url: dashboard },
    ]);
  const login = await page.request.post(`${api}/api/auth/sign-in/email`, {
    headers: { Origin: dashboard },
    data: {
      email: required("CONVOR_TEST_EMAIL"),
      password: required("CONVOR_TEST_PASSWORD"),
    },
  });
  if (!login.ok()) throw new Error("Convor fixture login failed");
  await page.goto(`${shop}/admin-dev/`, { waitUntil: "domcontentloaded" });
  const email = page.locator("#email");
  if (await email.isVisible()) {
    await email.fill("prestashop-qa@example.test");
    await page
      .locator("#passwd")
      .fill(process.env.PRESTASHOP_ADMIN_PASSWORD ?? "PrestashopQa1807!");
    await page.locator("#submit_login").click();
  }
  const manager = page
    .locator('a[href*="/modules/manage"],a[href*="AdminModulesManage"]')
    .first();
  await manager.waitFor({ state: "attached" });
  await page.goto(
    new URL(await manager.getAttribute("href"), page.url()).href,
    { waitUntil: "domcontentloaded" },
  );
  await page.locator('a[href*="/action/configure/convor?"]').first().waitFor();
  await page.screenshot({
    path: join(folder, `${locale}-prestashop-module-manager.png`),
    animations: "disabled",
  });
  const configure = page
    .locator('a[href*="/action/configure/convor?"]')
    .first();
  await configure.waitFor();
  await page.goto(
    new URL(await configure.getAttribute("href"), page.url()).href,
    { waitUntil: "domcontentloaded" },
  );
  const key = page.locator("#CONVOR_WIDGET_KEY");
  await key.waitFor();
  const language = await page.locator("html").getAttribute("lang");
  if (!language?.startsWith(locale))
    throw new Error(`Unexpected PrestaShop locale ${language}`);
  const labels = await page.locator("#configuration_form").innerText();
  if (locale === "pl" && !labels.includes("Publiczny klucz widżetu"))
    throw new Error("Polish module translation was not rendered");
  if (locale === "en" && !labels.includes("Public widget key"))
    throw new Error("English module translation was not rendered");
  if (process.env.DOCS_CAPTURE_SETTINGS_ONLY === "1") {
    const content = await page.locator("body").innerText();
    if (
      !content.includes("TopSoft4U") ||
      /PrestaShop QA|Gość V-|Guest V-|Lorem ipsum/i.test(content)
    )
      throw new Error(
        "Publication settings must contain the real branded synthetic website and no technical labels",
      );
  }
  // The actual configuration panel and page chrome, with key and secret masked.
  await page.screenshot({
    path: join(folder, `${locale}-prestashop-settings.png`),
    mask: [
      key,
      page.locator("#CONVOR_IDENTITY_SECRET"),
      page.locator("#CONVOR_VERIFICATION_CHALLENGE"),
    ],
    maskColor: "#dbe4ef",
    animations: "disabled",
  });
  if (process.env.DOCS_CAPTURE_SETTINGS_ONLY === "1") {
    console.log(`Captured real ${locale} PrestaShop manager and settings`);
    return;
  }
  await page.goto(
    `${dashboard}/o/${required("CONVOR_ORG_ID")}/integrations/prestashop?projectId=${required("CONVOR_PROJECT_ID")}`,
    { waitUntil: "domcontentloaded", timeout: 120000 },
  );
  const card = page.getByTestId("prestashop-installation-card");
  const publicKey = page.getByTestId("prestashop-widget-key");
  await publicKey.waitFor({ timeout: 60000 });
  if ((await page.locator("html").getAttribute("lang")) !== locale)
    throw new Error("Unexpected dashboard locale");
  await card.screenshot({
    path: join(folder, `${locale}-prestashop-installation.png`),
    mask: [publicKey, card.locator("pre")],
    maskColor: "#dbe4ef",
    animations: "disabled",
  });
  await page.screenshot({
    path: join(folder, `${locale}-prestashop-dashboard.png`),
    mask: [publicKey, card.locator("pre")],
    maskColor: "#dbe4ef",
    animations: "disabled",
  });

  const visitor = await browser.newPage({
    userAgent: UA,
    viewport: { width: 1440, height: 1050 },
    deviceScaleFactor: 2,
    locale: locale === "pl" ? "pl-PL" : "en-US",
  });
  await visitor
    .context()
    .route("**/*", (route) =>
      origins.has(new URL(route.request().url()).origin)
        ? route.continue()
        : route.abort(),
    );
  await visitor.goto(new URL(`/${locale}/`, shop).href, {
    waitUntil: "domcontentloaded",
  });
  expect(await visitor.locator("html").getAttribute("lang")).toMatch(
    new RegExp(`^${locale}`),
  );
  await expect
    .poll(
      () => visitor.evaluate(() => window.Convor?.getState().ready ?? false),
      { timeout: 30000 },
    )
    .toBe(true);
  await visitor.locator(".convor-trigger").click();
  const frame = visitor.frameLocator('iframe[src*="widget-iframe"]').first();
  const input = frame.locator(
    '.convor-chat > .convor-input [data-testid="widget-input-field"]',
  );
  const start = frame.locator('[data-welcome-action="start"]');
  await expect(start.or(input).filter({ visible: true }).first()).toBeVisible();
  if (!(await input.isVisible()) && (await start.isVisible())) {
    try {
      await start.click({ timeout: 3000 });
    } catch (error) {
      if (!(await input.isVisible())) throw error;
    }
  }
  await expect(input).toBeVisible();
  const question =
    locale === "pl"
      ? "Dzień dobry! Czy pomożecie mi dobrać rozmiar koszulki?"
      : "Hello! Could you help me choose a T-shirt size?";
  const answer =
    locale === "pl"
      ? "Dzień dobry! Jasne, chętnie pomożemy dobrać rozmiar."
      : "Hello! Of course, we can help you choose a size.";
  const posted = visitor.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/api\/conversations\/[^/]+\/messages$/.test(
        new URL(response.url()).pathname,
      ),
  );
  await input.fill(question);
  await frame
    .locator(".convor-chat > .convor-input .convor-input__send")
    .click();
  const response = await posted;
  expect(response.status()).toBe(201);
  const id = new URL(response.url()).pathname.split("/")[3];
  const scope = {
    Origin: dashboard,
    "X-Organization-Id": required("CONVOR_ORG_ID"),
    "X-Project-Id": required("CONVOR_PROJECT_ID"),
  };
  const reply = await page.request.post(
    `${api}/api/conversations/${id}/messages`,
    {
      headers: scope,
      data: { senderType: "operator", content: answer, type: "text" },
    },
  );
  expect(reply.status()).toBe(201);
  await expect(
    frame
      .locator(".convor-msg--operator .convor-msg__bubble")
      .filter({ hasText: answer }),
  ).toBeVisible({ timeout: 30000 });
  await visitor.screenshot({
    path: join(folder, `${locale}-prestashop-chat.png`),
    animations: "disabled",
  });
  await visitor.setViewportSize({ width: 440, height: 880 });
  await expect(input).toBeVisible();
  await visitor.screenshot({
    path: join(folder, `${locale}-prestashop-mobile.png`),
    animations: "disabled",
  });
  await page.goto(
    `${dashboard}/o/${required("CONVOR_ORG_ID")}/conversations/${id}?projectId=${required("CONVOR_PROJECT_ID")}`,
    { waitUntil: "domcontentloaded" },
  );
  await expect(page.getByText(question, { exact: true }).last()).toBeVisible({
    timeout: 60000,
  });
  await expect(page.getByText(answer, { exact: true }).last()).toBeVisible({
    timeout: 30000,
  });
  await page.screenshot({
    path: join(folder, `${locale}-prestashop-inbox.png`),
    animations: "disabled",
  });
  console.log(
    `Captured real ${locale} PrestaShop manager, settings, installation, conversation, mobile and inbox`,
  );
}

try {
  await capture();
} finally {
  await browser.close();
}
