import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  test,
} from "@playwright/test";

const shop = process.env.PRESTASHOP_URL ?? "http://localhost:18217";
const dashboard = process.env.CONVOR_DASHBOARD_URL ?? "http://localhost:17244";
const api = process.env.CONVOR_API_URL ?? "http://localhost:17243";
for (const url of [shop, dashboard, api]) {
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
    throw new Error("This suite is restricted to the isolated QA fixture");
}
async function isolate(context: BrowserContext) {
  const allowed = new Set([
    new URL(shop).origin,
    new URL(api).origin,
    new URL(dashboard).origin,
    "http://localhost:17242",
    "ws://localhost:17242",
  ]);
  await context.route("**/*", (route) =>
    allowed.has(new URL(route.request().url()).origin)
      ? route.continue()
      : route.abort(),
  );
}
// Local-only synthetic merchant acceptance. The real service intentionally
// denies automated visitors (HeadlessChrome / navigator.webdriver). Exercise
// the synthetic regular customer path in headless Chromium, restricted to
// the local fixture. The production server's bot protection is unchanged.
const customerUserAgent =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";
// Native PS debug mode renders its canonical redirect as an HTML diagnostic
// rather than automatically navigating. Follow only the actual same-origin
// checkout link, then keep the original real checkout assertions.
async function nativeCheckout(page: Page) {
  let response = await page.goto(
    new URL("/index.php?controller=order", shop).href,
    {
      waitUntil: "domcontentloaded",
    },
  );
  if (
    await page
      .getByText("[Debug] This page has moved", { exact: false })
      .isVisible()
  ) {
    const link = page.getByRole("link").first();
    const href = await link.getAttribute("href");
    if (!href) throw new Error("Native debug checkout redirect has no link");
    const target = new URL(href, shop);
    expect(target.origin).toBe(new URL(shop).origin);
    response = await page.goto(target.href, { waitUntil: "domcontentloaded" });
  }
  return response;
}
async function customerPage(
  browser: Browser,
  options: { deviceScaleFactor?: number } = {},
) {
  return browser.newPage({
    userAgent: customerUserAgent,
    viewport: { width: 1440, height: 1050 },
    ...options,
  });
}
test.use({
  headless: true,
  userAgent: customerUserAgent,
  launchOptions: { args: ["--disable-blink-features=AutomationControlled"] },
  viewport: { width: 1440, height: 1050 },
  deviceScaleFactor: 2,
});
test.beforeEach(async ({ context, page }) => {
  await isolate(context);
  page.setDefaultNavigationTimeout(60_000);
});

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing fixture variable ${name}`);
  return value;
}
const headers = () => ({
  Origin: dashboard,
  "X-Organization-Id": required("CONVOR_ORG_ID"),
  "X-Project-Id": required("CONVOR_PROJECT_ID"),
});
async function operator(page: Page) {
  const login = await page.request.post(`${api}/api/auth/sign-in/email`, {
    headers: { Origin: dashboard },
    data: {
      email: required("CONVOR_TEST_EMAIL"),
      password: required("CONVOR_TEST_PASSWORD"),
    },
  });
  expect(login.status()).toBe(200);
}
async function admin(page: Page) {
  await page.goto(`${shop}/admin-dev/`, { waitUntil: "domcontentloaded" });
  const email = page.locator("#email");
  if (await email.isVisible()) {
    await email.fill("prestashop-qa@example.test");
    await page
      .locator("#passwd")
      .fill(process.env.PRESTASHOP_ADMIN_PASSWORD ?? "PrestashopQa1807!");
    await page.locator("#submit_login").click();
    await expect(email).not.toBeVisible({ timeout: 60_000 });
  }
  const direct = page
    .locator('a[href*="/modules/manage"],a[href*="AdminModulesManage"]')
    .first();
  await expect(direct).toBeAttached({ timeout: 30_000 });
  const href = await direct.getAttribute("href");
  if (!href) throw new Error("Module Manager link missing");
  await page.goto(new URL(href, page.url()).href, {
    waitUntil: "domcontentloaded",
  });
}
async function configure(page: Page) {
  const configureLink = page.locator('a[href*="/action/configure/convor?"]');
  if (!(await configureLink.first().isVisible())) {
    await page.getByText("Upload a module", { exact: false }).first().click();
    await page
      .locator('input[type="file"]')
      .setInputFiles(
        resolve(
          process.env.PRESTASHOP_MARKETPLACE_PREFLIGHT === "1"
            ? "dist/prestashop-marketplace/package/convor.zip"
            : "dist/prestashop/convor.zip",
        ),
      );
    await expect(page.getByText(/module installed/i)).toBeVisible({
      timeout: 90_000,
    });
    const href = await page
      .getByRole("dialog")
      .locator('a[href*="/action/configure/convor?"]')
      .getAttribute("href");
    if (!href) throw new Error("Installed module configuration link missing");
    await page.goto(new URL(href, page.url()).href, {
      waitUntil: "domcontentloaded",
    });
  } else {
    const href = await configureLink.first().getAttribute("href");
    if (!href) throw new Error("Installed module configuration link missing");
    await page.goto(new URL(href, page.url()).href, {
      waitUntil: "domcontentloaded",
    });
  }
  await expect(page.locator("#CONVOR_WIDGET_KEY")).toBeVisible({
    timeout: 30_000,
  });
}
async function roundTrip(page: Page, browser: Browser, key: string) {
  const visitor = await customerPage(browser, { deviceScaleFactor: 2 });
  const errors: string[] = [];
  visitor.on("pageerror", (error) => errors.push(error.message));
  visitor.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("ERR_FAILED"))
      errors.push(message.text().slice(0, 250));
  });
  try {
    await isolate(visitor.context());
    await visitor.goto(shop, { waitUntil: "domcontentloaded" });
    await expect(
      visitor.locator('script[src*="/widget.js"][data-key]'),
    ).toHaveAttribute("data-key", key);
    const launcher = visitor.locator(".convor-trigger");
    await expect(launcher).toBeVisible({ timeout: 45_000 });
    await expect
      .poll(
        async () =>
          visitor.evaluate(async () => {
            const sdk = (
              window as unknown as {
                Convor?: { getState: () => { ready: boolean } };
              }
            ).Convor;
            return sdk?.getState().ready ?? false;
          }),
        {
          timeout: 30_000,
          message:
            "Real visitor API must become ready before opening the widget",
        },
      )
      .toBe(true);
    await launcher.click();
    const wrapper = visitor.locator(".convor-frame-wrapper.is-open");
    await expect(wrapper).toBeVisible();
    // The iframe itself translates/scales during the host's opening
    // transition. Playwright's in-frame element stability alone cannot
    // guarantee that the host-space click coordinates remain stable.
    await wrapper.evaluate(async (element) => {
      await Promise.all(
        element
          .getAnimations()
          .map((animation) => animation.finished.catch(() => undefined)),
      );
    });
    const frame = visitor.frameLocator('iframe[src*="widget-iframe"]').first();
    const start = frame.locator('[data-welcome-action="start"]');
    const composer = frame.locator(".convor-chat > .convor-input");
    const input = composer.locator('[data-testid="widget-input-field"]');
    await expect(start.or(input).filter({ visible: true }).first()).toBeVisible(
      { timeout: 30_000 },
    );
    if (!(await input.isVisible()) && (await start.isVisible())) {
      // Initialization can switch from welcome to chat while the button is
      // being clicked. Accept that transition only if the real composer opens.
      try {
        await start.click({ timeout: 3000 });
      } catch (error) {
        if (!(await input.isVisible())) throw error;
      }
    }
    await expect(input).toBeVisible({ timeout: 30_000 });
    const question = `PrestaShop QA ${Date.now()}`;
    const answer = `Convor operator ${Date.now()}`;
    const posted = visitor.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /\/api\/conversations\/[^/]+\/messages$/.test(
          new URL(response.url()).pathname,
        ),
      { timeout: 30_000 },
    );
    await input.fill(question);
    await expect(input).toHaveValue(question);
    const send = composer.locator(".convor-input__send");
    await expect(send).toBeEnabled();
    await send.evaluate((element) => {
      element.ownerDocument.addEventListener(
        "click",
        (event) => {
          const target = event.target instanceof Element ? event.target : null;
          element.ownerDocument.documentElement.dataset.lastQaClick =
            target?.closest("button")?.className ??
            target?.tagName ??
            "unknown";
        },
        { capture: true, once: true },
      );
    });
    await send.click();
    const response = await posted;
    if (response.status() !== 201) {
      const payload = await response.json().catch(() => ({}));
      console.error(
        "Message rejected:",
        response.status(),
        payload.error?.code ?? payload.error,
        payload.error?.message ?? payload.message,
      );
    }
    expect(response.status()).toBe(201);
    const id = new URL(response.url()).pathname.split("/")[3];
    const history = await page.request.get(
      `${api}/api/conversations/${id}/messages?limit=50`,
      { headers: headers() },
    );
    expect(history.status()).toBe(200);
    expect(await history.text()).toContain(question);
    const reply = await page.request.post(
      `${api}/api/conversations/${id}/messages`,
      {
        headers: headers(),
        data: { senderType: "operator", content: answer, type: "text" },
      },
    );
    expect(reply.status()).toBe(201);
    await expect(
      frame
        .locator(".convor-msg--operator .convor-msg__bubble")
        .filter({ hasText: answer }),
    ).toBeVisible({ timeout: 30_000 });
    await visitor.screenshot({ path: "dist/prestashop-storefront-chat.png" });
  } catch (error) {
    console.error(
      "Browser errors:",
      errors
        .map((error) => error.replace(/convor_wpk_[a-f0-9]+/g, "[widget-key]"))
        .slice(-12),
    );
    const widget = visitor
      .frames()
      .find((f) => new URL(f.url()).pathname.endsWith("widget-iframe.html"));
    if (widget && !visitor.isClosed()) {
      console.error(
        "Widget failure:",
        await widget
          .evaluate(() => ({
            inputLength: (
              document.querySelector(
                '.convor-chat > .convor-input [data-testid="widget-input-field"]',
              ) as HTMLTextAreaElement | null
            )?.value?.length,
            lastClick: document.documentElement.dataset.lastQaClick,
            messageCount: document.querySelectorAll("[data-message-id]").length,
            failedCount: document.querySelectorAll(".convor-msg--failed")
              .length,
            queuedCount: document.querySelectorAll(".convor-msg__queued")
              .length,
            status: document.querySelector(".convor-header__status")
              ?.textContent,
            banners: Array.from(
              document.querySelectorAll(".convor-banner"),
            ).map((e) => e.textContent),
            visibleChat: Boolean(
              document.querySelector(".convor-chat")?.getClientRects().length,
            ),
          }))
          .catch(() => ({ unavailable: true })),
      );
      await visitor
        .screenshot({ path: "dist/prestashop-chat-failure.png" })
        .catch(() => {});
    }
    throw error;
  } finally {
    await visitor.close();
  }
}

test("PrestaShop API pairing binds the original admin session and rejects replay", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await operator(page);
  await admin(page);
  await configure(page);
  const field = page.locator("#CONVOR_WIDGET_KEY");
  await field.fill("");
  await page.locator("#configuration_form_submit_btn").click();
  await expect(field).toHaveValue("");
  await page
    .getByRole("button", { name: "Connect with Convor", exact: true })
    .click();
  const link = await page
    .getByRole("link", { name: "Open Convor", exact: true })
    .getAttribute("href");
  if (!link) throw new Error("Pairing URL not returned");
  const query = new URL(link).searchParams;
  const authorization = await page.request.post(
    `${api}/api/prestashop/pairing/start`,
    {
      headers: headers(),
      data: {
        siteUrl: query.get("ps_site"),
        callback: query.get("ps_callback"),
        state: query.get("ps_state"),
        verifierHash: query.get("ps_proof"),
      },
    },
  );
  expect(authorization.status()).toBe(200);
  const destination = new URL((await authorization.json()).redirectUrl);
  expect(destination.origin).toBe(new URL(shop).origin);
  const code = destination.searchParams.get("code");
  const state = destination.searchParams.get("state");
  if (!code || !state) throw new Error("Pairing result missing code/state");

  // A second login, even as the same employee, does not have the original cookie-bound verifier.
  const independent = await customerPage(browser);
  try {
    await isolate(independent.context());
    await admin(independent);
    await configure(independent);
    const token = await independent
      .locator('input[name="token"]')
      .first()
      .inputValue();
    const response = await independent.request.post(independent.url(), {
      form: {
        token,
        submitConvorPairComplete: "1",
        CONVOR_PAIR_CODE: code,
        CONVOR_PAIR_STATE: state,
      },
    });
    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain(
      "The connection expired or the shop settings changed",
    );
    await independent.reload({ waitUntil: "domcontentloaded" });
    await expect(independent.locator("#CONVOR_WIDGET_KEY")).toHaveValue("");
  } finally {
    await independent.close();
  }

  // Use the real front controller, whose response contains no admin token or verifier.
  const callback = await page.context().newPage();
  try {
    const response = await callback.goto(destination.href, {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toContain("no-store");
    // BroadcastChannel automatically completes the original BO form; the copy code fallback
    // also remains available for separate origins/browsers.
    const saved = await page.request.get(
      `${api}/api/projects/${required("CONVOR_PROJECT_ID")}`,
      { headers: headers() },
    );
    expect(saved.status()).toBe(200);
    const project = (await saved.json()).project;
    const key = project.widgetPublicKey;
    expect(key).toMatch(/^convor_wpk_[a-f0-9]{64}$/);
    await expect(field).toHaveValue(key, { timeout: 30_000 });
    await expect(
      page.getByText("Last paired website:", { exact: false }),
    ).toContainText(project.name);
    const testLink = page.getByRole("link", {
      name: "Open storefront to test chat",
    });
    await expect(testLink).toBeVisible();
    expect(new URL((await testLink.getAttribute("href"))!).origin).toBe(
      new URL(shop).origin,
    );
    const token = await page
      .locator('input[name="token"]')
      .first()
      .inputValue();
    const replay = await page.request.post(page.url(), {
      form: {
        token,
        submitConvorPairComplete: "1",
        CONVOR_PAIR_CODE: code,
        CONVOR_PAIR_STATE: state,
      },
    });
    expect(replay.ok()).toBe(true);
    expect(await replay.text()).toContain(
      "The connection expired or the shop settings changed",
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(field).toHaveValue(key);
    await page.screenshot({
      path: "dist/prestashop-module-settings.png",
      mask: [field],
    });
    await roundTrip(page, browser, key);
  } finally {
    await callback.close();
  }
});

test("PrestaShop ZIP install, secure pairing and real two-way chat", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  await operator(page);
  await admin(page);
  await configure(page);
  await page.locator("#CONVOR_WIDGET_KEY").fill("");
  await page.locator("#configuration_form_submit_btn").click();
  await expect(page.locator("#CONVOR_WIDGET_KEY")).toHaveValue("");
  await page
    .getByRole("button", { name: "Connect with Convor", exact: true })
    .click();
  const link = page.getByRole("link", { name: "Open Convor", exact: true });
  await expect(link).toBeVisible();
  const popupPromise = page.waitForEvent("popup");
  await link.click();
  const popup = await popupPromise;
  await popup.waitForURL(/\/integrations\/prestashop\?/, {
    timeout: 60_000,
    waitUntil: "domcontentloaded",
  });
  const selected = new URL(popup.url());
  if (!selected.pathname.startsWith("/o/"))
    selected.pathname = `/o/${required("CONVOR_ORG_ID")}${selected.pathname}`;
  selected.searchParams.set("projectId", required("CONVOR_PROJECT_ID"));
  await popup.goto(selected.href);
  const key = popup.getByTestId("prestashop-widget-key");
  await expect(key).toBeVisible({ timeout: 60_000 });
  const expectedKey = await key.inputValue();
  expect(expectedKey).toMatch(/^convor_wpk_[a-f0-9]{64}$/);
  await popup.getByRole("button", { name: "Connect this website" }).click();
  await expect(page.locator("#CONVOR_WIDGET_KEY")).toHaveValue(expectedKey, {
    timeout: 30_000,
  });
  await popup.close();
  await page.screenshot({
    path: "dist/prestashop-module-settings.png",
    mask: [page.locator("#CONVOR_WIDGET_KEY")],
  });
  await roundTrip(page, browser, expectedKey);
});

test("PrestaShop manual key, disable, theme embed and restored configuration", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  await operator(page);
  await admin(page);
  await configure(page);
  const saved = await page.request.get(
    `${api}/api/projects/${required("CONVOR_PROJECT_ID")}`,
    { headers: headers() },
  );
  expect(saved.status()).toBe(200);
  const expectedKey = (await saved.json()).project.widgetPublicKey;
  expect(expectedKey).toMatch(/^convor_wpk_[a-f0-9]{64}$/);
  await page.locator("#CONVOR_WIDGET_KEY").fill(expectedKey);
  await page
    .locator('input[name="CONVOR_ENABLED"][value="1"]')
    .check({ force: true });
  await page.locator("#configuration_form_submit_btn").click();
  await expect(page.locator("#CONVOR_WIDGET_KEY")).toHaveValue(expectedKey);
  await page.screenshot({
    path: "dist/prestashop-module-settings.png",
    mask: [page.locator("#CONVOR_WIDGET_KEY")],
  });
  await roundTrip(page, browser, expectedKey);
  await page
    .locator('input[name="CONVOR_ENABLED"][value="0"]')
    .check({ force: true });
  await page.locator("#configuration_form_submit_btn").click();
  const storefront = await customerPage(browser);
  try {
    await isolate(storefront.context());
    await storefront.goto(shop, { waitUntil: "domcontentloaded" });
    await expect(
      storefront.locator(`script[data-key="${expectedKey}"]`),
    ).toHaveCount(0);
  } finally {
    await storefront.close();
  }
  // Manual embed in the actual installed theme, with the module disabled.
  // The hard-coded container is the disposable local fixture only.
  const fixtureByPort: Record<string, string> = {
    "18217": "convor-prestashop-1807",
    "18218": "convor-prestashop-1807-82",
    "18221": "convor-prestashop-1807-91",
    "18222": "convor-prestashop-1807-90",
  };
  const fixture = fixtureByPort[new URL(shop).port];
  if (!fixture) throw new Error("Unknown QA fixture");
  const container = `${fixture}-prestashop-1`;
  expect(
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
  ).toBe(fixture);
  const themeName = execFileSync(
    "docker",
    [
      "exec",
      "-u",
      "www-data",
      container,
      "php",
      "-r",
      'require "/var/www/html/config/config.inc.php"; echo Context::getContext()->shop->theme_name;',
    ],
    { encoding: "utf8" },
  ).trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(themeName))
    throw new Error("Unexpected fixture theme");
  const theme = `/var/www/html/themes/${themeName}/templates/_partials/head.tpl`;
  const original = execFileSync("docker", ["exec", container, "cat", theme]);
  const writeTheme = (content: Buffer) =>
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        container,
        "sh",
        "-c",
        `cat > ${theme} && rm -rf /var/www/html/var/cache/dev/smarty/compile/* /var/www/html/var/cache/prod/smarty/compile/*`,
      ],
      { input: content },
    );
  const hash = (content: Buffer) =>
    createHash("sha256").update(content).digest("hex");
  try {
    const snippet = `\n<script src="${api}/widget.js" data-key="${expectedKey}" async></script>\n`;
    writeTheme(Buffer.concat([original, Buffer.from(snippet)]));
    await roundTrip(page, browser, expectedKey);
  } finally {
    writeTheme(original);
    expect(
      hash(execFileSync("docker", ["exec", container, "cat", theme])),
    ).toBe(hash(original));
    await page
      .locator('input[name="CONVOR_ENABLED"][value="1"]')
      .check({ force: true });
    await page.locator("#configuration_form_submit_btn").click();
  }
});

test("PrestaShop verified customers, consent and shared-browser isolation", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  await operator(page);
  await admin(page);
  await configure(page);
  const project = await page.request.get(
    `${api}/api/projects/${required("CONVOR_PROJECT_ID")}`,
    { headers: headers() },
  );
  expect(project.ok()).toBe(true);
  const key = (await project.json()).project.widgetPublicKey;
  expect(key).toMatch(/^convor_wpk_[a-f0-9]{64}$/);
  const rotation = await page.request.post(
    `${api}/api/settings/visitor-identity/rotate`,
    { headers: headers() },
  );
  expect(rotation.ok()).toBe(true);
  const secret = (await rotation.json()).secret;
  expect(typeof secret).toBe("string");
  await page.locator("#CONVOR_WIDGET_KEY").fill(key);
  await page
    .locator('input[name="CONVOR_ENABLED"][value="1"]')
    .check({ force: true });
  await page
    .locator('input[name="CONVOR_IDENTITY_ENABLED"][value="1"]')
    .check({ force: true });
  await page
    .locator('input[name="CONVOR_CONSENT_REQUIRED"][value="1"]')
    .check({ force: true });
  await page.locator("#CONVOR_IDENTITY_SECRET").fill(secret);
  await page.locator("#configuration_form_submit_btn").click();
  await expect(page.locator("#CONVOR_IDENTITY_SECRET")).toHaveValue("");
  const sharedContext = await browser.newContext({
    userAgent: customerUserAgent,
    viewport: { width: 1440, height: 1050 },
  });
  const visitor = await sharedContext.newPage();
  let secondTab: Page | undefined;
  let privateTab: Page | undefined;
  try {
    await isolate(visitor.context());
    const consentRequests: string[] = [];
    visitor.on("request", (r) => {
      if (new URL(r.url()).origin === api)
        consentRequests.push(new URL(r.url()).pathname);
    });
    await visitor.goto(shop, { waitUntil: "domcontentloaded" });
    await expect(
      visitor.locator("script[data-convor-prestashop-loader]"),
    ).toHaveCount(0);
    expect(consentRequests).toEqual([]);
    // Exercise the CMP's persisted decision, including the reload on withdrawal.
    await visitor.evaluate(() =>
      localStorage.setItem("fixture-cmp-consent", "yes"),
    );
    await visitor.addInitScript(() => {
      Object.assign(window, {
        convorPrestaShopConsent:
          localStorage.getItem("fixture-cmp-consent") === "yes",
      });
    });
    await visitor.reload({ waitUntil: "domcontentloaded" });
    async function visitorId(target = visitor) {
      await expect
        .poll(
          async () =>
            target.evaluate(() => {
              const sdk = (
                window as unknown as {
                  Convor?: {
                    getState: () => { ready: boolean };
                    getVisitorId: () => string | null;
                  };
                }
              ).Convor;
              return sdk?.getState().ready ? sdk.getVisitorId() : null;
            }),
          { timeout: 30_000 },
        )
        .toMatch(/^[0-9a-f-]{36}$/i);
      return target.evaluate(() =>
        (
          window as unknown as { Convor: { getVisitorId: () => string } }
        ).Convor.getVisitorId(),
      );
    }
    async function identity(id: string) {
      const response = await page.request.get(`${api}/api/visitors/${id}`, {
        headers: headers(),
      });
      expect(response.status()).toBe(200);
      const data = await response.json();
      return data.identitySource ?? data.visitor?.identitySource;
    }
    const guest = await visitorId();
    expect(await identity(guest)).toBe("anonymous");
    async function signup(label: string) {
      await visitor.goto(`${shop}/registration`, {
        waitUntil: "domcontentloaded",
      });
      const form = visitor.locator("#customer-form");
      await form.locator('input[name="firstname"]').fill("Convor");
      await form.locator('input[name="lastname"]').fill(label);
      await form
        .locator('input[name="email"]')
        .fill(`ps-qa-${Date.now()}-${label.toLowerCase()}@example.test`);
      await form.locator('input[name="password"]').fill("Fixture1807!A");
      for (const field of ["customer_privacy", "psgdpr"])
        await form.locator(`input[name="${field}"]`).check({ force: true });
      await form.locator('button[type="submit"]').click();
      await expect(
        visitor.locator('a[href*="mylogout"],a.logout').first(),
      ).toBeAttached({ timeout: 30_000 });
      const id = await visitorId();
      await expect
        .poll(() => identity(id), { timeout: 20_000 })
        .toBe("verified");
      return id;
    }
    const a = await signup("Alpha");
    expect(a).not.toBe(guest);
    const contextUrl = new URL(
      "/index.php?fc=module&module=convor&controller=context",
      shop,
    ).href;
    const contextHeaders = {
      Origin: new URL(shop).origin,
      "X-Convor-Context": "1",
    };
    const aSession = await visitor.request.post(contextUrl, {
      headers: contextHeaders,
      data: { widgetKey: key, action: "session" },
    });
    expect(aSession.ok()).toBe(true);
    expect(aSession.headers()["cache-control"]).toContain("no-store");
    const aHandle = (await aSession.json()).sessionHandle;
    expect(typeof aHandle).toBe("string");
    expect((await visitor.content()).includes(secret)).toBe(false);

    // The second tab shares the merchant cookies, but not a separate browser
    // context. It must follow the current session on focus, never revive A.
    secondTab = await visitor.context().newPage();
    await secondTab.addInitScript(() => {
      Object.assign(window, {
        convorPrestaShopConsent:
          localStorage.getItem("fixture-cmp-consent") === "yes",
      });
    });
    await secondTab.goto(shop, { waitUntil: "domcontentloaded" });
    await secondTab.bringToFront();
    expect(await visitorId(secondTab)).toBe(a);
    privateTab = await customerPage(browser);
    await isolate(privateTab.context());
    await privateTab.addInitScript(() =>
      Object.assign(window, { convorPrestaShopConsent: true }),
    );
    await privateTab.goto(shop, { waitUntil: "domcontentloaded" });
    const separateGuest = await visitorId(privateTab);
    expect(separateGuest).not.toBe(a);
    expect(await identity(separateGuest)).toBe("anonymous");
    await privateTab.close();
    privateTab = undefined;
    await visitor.bringToFront();
    const signout = async () => {
      const link = visitor.locator('a[href*="mylogout"],a.logout').first();
      const href = await link.getAttribute("href");
      if (!href) throw new Error("Missing shop logout URL");
      await visitor.goto(new URL(href, visitor.url()).href, {
        waitUntil: "domcontentloaded",
      });
      const id = await visitorId();
      expect(await identity(id)).toBe("anonymous");
      return id;
    };
    const signedOut = await signout();
    expect(signedOut).not.toBe(a);
    expect(signedOut).not.toBe(guest);
    // The old server-issued handle must be revoked at the SaaS boundary,
    // not merely rejected by the local merchant context endpoint.
    const revoked = await visitor.request.post(
      `${api}/api/auth/visitor-token`,
      {
        headers: { Origin: new URL(shop).origin },
        data: { key, visitorHandle: aHandle },
      },
    );
    expect(revoked.status()).toBe(401);
    expect((await revoked.json()).error.code).toBe("VISITOR_HANDLE_REVOKED");
    await secondTab.bringToFront();
    // No navigation/reload from the test. The module itself must react to
    // current cookies (visibility/focus/broadcast/poll) on an existing page.
    await secondTab.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect
      .poll(
        () =>
          secondTab!.evaluate(() =>
            (
              window as unknown as {
                Convor?: { getVisitorId: () => string | null };
              }
            ).Convor?.getVisitorId(),
          ),
        { timeout: 30000 },
      )
      .toBe(signedOut);
    expect(await identity(await visitorId(secondTab))).toBe("anonymous");
    await visitor.bringToFront();
    const b = await signup("Beta");
    expect(b).not.toBe(a);
    expect(b).not.toBe(signedOut);
    await secondTab.bringToFront();
    await secondTab.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect
      .poll(
        () =>
          secondTab!.evaluate(() =>
            (
              window as unknown as {
                Convor?: { getVisitorId: () => string | null };
              }
            ).Convor?.getVisitorId(),
          ),
        { timeout: 30000 },
      )
      .toBe(b);
    expect(await identity(await visitorId(secondTab))).toBe("verified");
    await visitor.bringToFront();
    await secondTab.close();
    secondTab = undefined;
    const stale = await visitor.request.post(contextUrl, {
      headers: contextHeaders,
      data: {
        widgetKey: key,
        action: "context",
        sessionHandle: aHandle,
        visitorId: a,
      },
    });
    expect(stale.status()).toBe(409);
    expect(await stale.json()).toEqual({});
    const wrongOrigin = await visitor.request.post(contextUrl, {
      headers: { ...contextHeaders, Origin: "https://unrelated.example.test" },
      data: { widgetKey: key, action: "session" },
    });
    expect(wrongOrigin.status()).toBe(403);

    // Exercise the real merchant-side signing key rotation, not merely a
    // changed local setting. The old signature must fail at the SaaS boundary,
    // and saving the new key must revoke the old handle and restore identity.
    const beforeRotation = await visitor.request.post(contextUrl, {
      headers: contextHeaders,
      data: { widgetKey: key, action: "session" },
    });
    expect(beforeRotation.status()).toBe(200);
    const oldHandle = (await beforeRotation.json()).sessionHandle;
    const signedContext = await visitor.request.post(contextUrl, {
      headers: contextHeaders,
      data: {
        widgetKey: key,
        action: "context",
        sessionHandle: oldHandle,
        visitorId: b,
      },
    });
    expect(signedContext.status()).toBe(200);
    const signed = (await signedContext.json()).identity;
    expect(typeof signed?.userHash).toBe("string");
    const tokenResponse = await visitor.request.post(
      `${api}/api/auth/visitor-token`,
      {
        headers: { Origin: new URL(shop).origin },
        data: { key, visitorHandle: oldHandle },
      },
    );
    expect(tokenResponse.status()).toBe(200);
    const token = await tokenResponse.json();
    expect(token.visitorId).toBe(b);
    const replaySignature = () =>
      visitor.request.post(`${api}/api/visitors/identify`, {
        headers: {
          Origin: new URL(shop).origin,
          "X-API-Key": key,
          Authorization: `Bearer ${token.token}`,
        },
        data: {
          visitorId: b,
          traits: { id: signed.id },
          userHash: signed.userHash,
        },
      });
    expect((await replaySignature()).status()).toBe(200);
    const rotated = await page.request.post(
      `${api}/api/settings/visitor-identity/rotate`,
      { headers: headers() },
    );
    expect(rotated.status()).toBe(200);
    const nextSecret = (await rotated.json()).secret;
    expect(typeof nextSecret === "string" && nextSecret !== secret).toBe(true);
    expect((await replaySignature()).status()).toBe(401);
    const settings = await page.request.get(
      `${api}/api/settings/visitor-identity`,
      { headers: headers() },
    );
    expect(settings.status()).toBe(200);
    expect((await settings.text()).includes(nextSecret)).toBe(false);

    await page.locator("#CONVOR_IDENTITY_SECRET").fill(nextSecret);
    await page.locator("#configuration_form_submit_btn").click();
    await expect(page.locator("#CONVOR_IDENTITY_SECRET")).toHaveValue("");
    await visitor.reload({ waitUntil: "domcontentloaded" });
    const renewed = await visitorId();
    expect(renewed).not.toBe(b);
    expect(renewed).not.toBe(a);
    await expect
      .poll(() => identity(renewed), { timeout: 20_000 })
      .toBe("verified");
    expect(
      (
        await visitor.request.post(`${api}/api/auth/visitor-token`, {
          headers: { Origin: new URL(shop).origin },
          data: { key, visitorHandle: oldHandle },
        })
      ).status(),
    ).toBe(401);
    expect((await visitor.content()).includes(nextSecret)).toBe(false);

    const auditDb = "convor-feat-prestashop-finalization-1807-dev-postgres-1";
    expect(
      execFileSync(
        "docker",
        [
          "inspect",
          "-f",
          '{{ index .Config.Labels "com.docker.compose.project" }}',
          auditDb,
        ],
        { encoding: "utf8" },
      ).trim(),
    ).toBe("convor-feat-prestashop-finalization-1807-dev");
    const audit = execFileSync(
      "docker",
      [
        "exec",
        "-i",
        auditDb,
        "psql",
        "-U",
        "convor",
        "-d",
        "convor_dev",
        "-qAt",
        "-v",
        "ON_ERROR_STOP=1",
        "-v",
        `org=${required("CONVOR_ORG_ID")}`,
        "-v",
        `project=${required("CONVOR_PROJECT_ID")}`,
      ],
      {
        input:
          "SELECT count(*), count(*) FILTER (WHERE details::text LIKE '%convor_identity_%') FROM audit_logs WHERE org_id=:'org' AND project_id=:'project' AND action='settings.visitor_identity_secret_rotated';\n",
        encoding: "utf8",
      },
    )
      .trim()
      .split("|")
      .map(Number);
    expect(audit[0]).toBeGreaterThanOrEqual(2);
    expect(audit[1]).toBe(0);

    await signout();
    await Promise.all([
      visitor.waitForEvent("domcontentloaded"),
      visitor.evaluate(() => {
        localStorage.setItem("fixture-cmp-consent", "no");
        Object.assign(window, { convorPrestaShopConsent: false });
        document.dispatchEvent(new Event("convor:prestashop-consent"));
      }),
    ]);
    await expect(
      visitor.locator("script[data-convor-prestashop-loader]"),
    ).toHaveCount(0);
    await expect(visitor.locator('iframe[src*="widget-iframe"]')).toHaveCount(
      0,
    );
    consentRequests.length = 0;
    await visitor.reload({ waitUntil: "networkidle" });
    expect(consentRequests).toEqual([]);
    await expect(
      visitor.locator("script[data-convor-prestashop-loader]"),
    ).toHaveCount(0);
  } finally {
    await privateTab?.close();
    await sharedContext.close();
    await page
      .locator('input[name="CONVOR_IDENTITY_ENABLED"][value="0"]')
      .check({ force: true });
    await page
      .locator('input[name="CONVOR_CONSENT_REQUIRED"][value="0"]')
      .check({ force: true });
    await page.locator("#configuration_form_submit_btn").click();
    const removed = await page.request.delete(
      `${api}/api/settings/visitor-identity`,
      { headers: headers() },
    );
    expect(removed.status()).toBe(204);
  }
});

test("PrestaShop product variants and independent real cart context", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await operator(page);
  await admin(page);
  await configure(page);
  const project = await page.request.get(
    `${api}/api/projects/${required("CONVOR_PROJECT_ID")}`,
    { headers: headers() },
  );
  expect(project.ok()).toBe(true);
  const key = (await project.json()).project.widgetPublicKey;
  await page.locator("#CONVOR_WIDGET_KEY").fill(key);
  await page
    .locator('input[name="CONVOR_ENABLED"][value="1"]')
    .check({ force: true });
  await page
    .locator('input[name="CONVOR_COMMERCE_CONTEXT"][value="1"]')
    .check({ force: true });
  await page.locator("#configuration_form_submit_btn").click();
  const visitor = await customerPage(browser);
  const independent = await customerPage(browser);
  type Attributes = {
    productId: string | null;
    variationId: string | null;
    productName: string | null;
    productPrice: string | null;
    productCurrency: string | null;
    cartTotal: string | null;
    cartCurrency: string | null;
  };
  function observe(target: Page) {
    const responses: Attributes[] = [];
    target.on("response", async (response) => {
      const url = new URL(response.url());
      if (
        url.origin === new URL(shop).origin &&
        url.searchParams.get("controller") === "context" &&
        response.request().method() === "POST" &&
        response.ok()
      ) {
        try {
          const body = await response.json();
          if (body.attributes) responses.push(body.attributes);
        } catch {
          /* no false success on aborted response */
        }
      }
    });
    return responses;
  }
  try {
    await isolate(visitor.context());
    await isolate(independent.context());
    const updates = observe(visitor);
    const separate = observe(independent);
    await visitor.goto(shop, { waitUntil: "domcontentloaded" });
    const product = visitor
      .locator("article.product-miniature a[href],.product-miniature a[href]")
      .first();
    const href = await product.getAttribute("href");
    if (!href) throw new Error("No demo product");
    const productUrl = new URL(href, shop).href;
    await visitor.goto(productUrl, { waitUntil: "domcontentloaded" });
    await expect
      .poll(
        () => updates.find((x) => x.productId && x.variationId)?.variationId,
        { timeout: 30_000 },
      )
      .toMatch(/^\d+$/);
    const first = updates.find((x) => x.productId && x.variationId);
    expect(first?.productName).toBeTruthy();
    expect(Number(first?.productPrice)).toBeGreaterThan(0);
    expect(first?.productCurrency).toMatch(/^[A-Z]{3}$/);
    const variantSelect = visitor
      .locator('#add-to-cart-or-refresh select[name^="group["]')
      .first();
    await expect(variantSelect).toBeVisible();
    const choices = await variantSelect
      .locator("option")
      .evaluateAll((options) =>
        options.map((o) => (o as HTMLOptionElement).value),
      );
    const previous = await variantSelect.inputValue();
    const other = choices.find((value) => value !== previous);
    if (!other) throw new Error("Demo product needs a second variant");
    await variantSelect.selectOption(other);
    await expect
      .poll(
        () =>
          updates.some(
            (x) =>
              x.productId === first?.productId &&
              x.variationId !== null &&
              x.variationId !== first?.variationId,
          ),
        { timeout: 30_000 },
      )
      .toBe(true);
    await visitor.locator('[data-button-action="add-to-cart"]').first().click();
    await expect
      .poll(() => updates.some((x) => Number(x.cartTotal) > 0), {
        timeout: 30_000,
      })
      .toBe(true);
    await independent.goto(productUrl, { waitUntil: "domcontentloaded" });
    await expect
      .poll(() => separate.find((x) => x.productId !== null)?.productId, {
        timeout: 30_000,
      })
      .toBe(first?.productId);
    expect(
      Number(separate.find((x) => x.productId !== null)?.cartTotal ?? 0),
    ).toBe(0);
    const initialTotal = Number(
      updates.filter((x) => Number(x.cartTotal) > 0).at(-1)?.cartTotal,
    );
    await visitor.goto(new URL("/cart?action=show", shop).href, {
      waitUntil: "domcontentloaded",
    });
    const quantity = visitor.locator(".js-cart-line-product-quantity").first();
    await expect(quantity).toBeVisible();
    const nextQuantity = String(Number(await quantity.inputValue()) + 1);
    // Hummingbird requires its quantity control to commit the edit; Classic
    // uses Bootstrap TouchSpin. Use the actual increment control on both.
    await visitor
      .locator(".js-increment-button,.bootstrap-touchspin-up")
      .filter({ visible: true })
      .first()
      .click();
    await expect(quantity).toHaveValue(nextQuantity);
    await expect
      .poll(() => Number(updates.at(-1)?.cartTotal ?? 0), { timeout: 30000 })
      .toBeGreaterThan(initialTotal);
    await visitor
      .locator('[data-link-action="delete-from-cart"]')
      .first()
      .click();
    await expect(quantity).toHaveCount(0);
    await expect
      .poll(() => Number(updates.at(-1)?.cartTotal ?? 0), { timeout: 30000 })
      .toBe(0);
    expect(Number(separate.at(-1)?.cartTotal ?? 0)).toBe(0);
  } catch (error) {
    console.error(
      "Cart context failure before cleanup:",
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  } finally {
    await visitor.close();
    await independent.close();
    if (!page.isClosed()) {
      await page
        .locator('input[name="CONVOR_COMMERCE_CONTEXT"][value="0"]')
        .check({ force: true, timeout: 5000 });
      await page
        .locator("#configuration_form_submit_btn")
        .click({ timeout: 5000 });
    }
  }
});

test("PrestaShop native checkout debug baseline without Convor", async ({
  browser,
}) => {
  test.skip(
    process.env.PRESTASHOP_DEBUG_BASELINE !== "1",
    "Diagnostic baseline is explicitly opt-in",
  );
  test.setTimeout(120_000);
  // The native-only diagnostic does not need BO interaction. In debug mode,
  // Symfony's diagnostic toolbar can intercept clicks on radio controls.
  const container = "convor-prestashop-1807-90-prestashop-1";
  expect(new URL(shop).origin).toBe("http://localhost:18222");
  expect(
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
  ).toBe("convor-prestashop-1807-90");
  const php = (code: string) =>
    execFileSync(
      "docker",
      [
        "exec",
        "-u",
        "www-data",
        container,
        "php",
        "-r",
        'require "/var/www/html/config/config.inc.php";' + code,
      ],
      { encoding: "utf8" },
    ).trim();
  const originallyEnabled =
    php('echo Module::isEnabled("convor")?"1":"0";') === "1";
  const visitor = await customerPage(browser);
  if (originallyEnabled)
    php('if(!Module::getInstanceByName("convor")->disable())exit(1);');
  expect(php('echo Module::isEnabled("convor")?"1":"0";')).toBe("0");
  try {
    await isolate(visitor.context());
    await visitor.setViewportSize({ width: 390, height: 844 });
    await visitor.goto(shop, { waitUntil: "domcontentloaded" });
    await expect(
      visitor.locator('script[src*="/widget.js"][data-key]'),
    ).toHaveCount(0);
    const href = await visitor
      .locator("article.product-miniature a[href],.product-miniature a[href]")
      .first()
      .getAttribute("href");
    if (!href) throw new Error("No demo product");
    await visitor.goto(new URL(href, shop).href, {
      waitUntil: "domcontentloaded",
    });
    const added = visitor.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).origin === new URL(shop).origin &&
        response.request().postData()?.includes("add=1") === true,
      { timeout: 20000 },
    );
    await visitor.locator('[data-button-action="add-to-cart"]').first().click();
    const response = await added;
    expect(response.ok()).toBe(true);
    const result = await response.json();
    expect(result.hasError ?? false).toBe(false);
    expect(Number(result.cart?.products_count ?? 0)).toBeGreaterThan(0);
    const checkout = await nativeCheckout(visitor);
    const body = await visitor.evaluate(() => ({
      bodyId: document.body.id,
      formIds: Array.from(document.querySelectorAll("form[id]"), (el) => el.id),
      stepIds: Array.from(
        document.querySelectorAll('[id*="checkout"][id*="step"]'),
        (el) => el.id,
      ),
    }));
    console.log("Native checkout baseline:", {
      status: checkout?.status(),
      ...body,
    });
    // A visible checkout form inside a native HTTP 400 page is not a
    // successful checkout acceptance.
    expect(checkout?.status()).toBe(200);
    await expect(
      visitor.locator("#checkout-personal-information-step"),
    ).toBeVisible({ timeout: 20000 });
  } finally {
    await visitor.close();
    if (originallyEnabled)
      php('if(!Module::getInstanceByName("convor")->enable())exit(1);');
    expect(php('echo Module::isEnabled("convor")?"1":"0";')).toBe(
      originallyEnabled ? "1" : "0",
    );
  }
});

test("PrestaShop verification markup and mobile checkout survive blocked CDN", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  await operator(page);
  await admin(page);
  await configure(page);
  const project = await page.request.get(
    `${api}/api/projects/${required("CONVOR_PROJECT_ID")}`,
    { headers: headers() },
  );
  expect(project.ok()).toBe(true);
  const key = (await project.json()).project.widgetPublicKey;
  const proof = "qa-prestashop-verification-marker";
  const fields = [
    "ENABLED",
    "CONSENT_REQUIRED",
    "EXCLUDE_CHECKOUT",
    "COMMERCE_CONTEXT",
    "IDENTITY_ENABLED",
  ];
  const original = new Map<string, string>();
  for (const field of fields) {
    original.set(
      field,
      await page.locator(`input[name="CONVOR_${field}"]:checked`).inputValue(),
    );
  }
  const originalKey = await page.locator("#CONVOR_WIDGET_KEY").inputValue();
  const originalProof = await page
    .locator("#CONVOR_VERIFICATION_CHALLENGE")
    .inputValue();
  const visitor = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: customerUserAgent,
  });
  try {
    await page.locator("#CONVOR_WIDGET_KEY").fill(key);
    await page.locator("#CONVOR_VERIFICATION_CHALLENGE").fill(proof);
    for (const field of fields) {
      const value =
        field === "ENABLED" || field === "EXCLUDE_CHECKOUT" ? "1" : "0";
      await page
        .locator(`input[name="CONVOR_${field}"][value="${value}"]`)
        .check({ force: true });
    }
    await page.locator("#configuration_form_submit_btn").click();
    await expect(page.locator("#CONVOR_VERIFICATION_CHALLENGE")).toHaveValue(
      proof,
    );
    await isolate(visitor.context());
    const attempts: string[] = [];
    await visitor.route(`${api}/**`, async (route) => {
      attempts.push(new URL(route.request().url()).pathname);
      await route.abort("failed");
    });
    const home = await visitor.goto(shop, { waitUntil: "load" });
    expect(home?.status()).toBe(200);
    const loader = visitor.locator('script[src*="/widget.js"][data-key]');
    await expect(loader).toHaveCount(1);
    await expect(loader).toHaveAttribute("data-key", key);
    await expect(loader).toHaveAttribute("data-convor-verification", proof);
    expect(attempts).toContain("/widget.js");
    await expect(visitor.locator(".convor-trigger")).toHaveCount(0);
    const product = visitor
      .locator("article.product-miniature a[href],.product-miniature a[href]")
      .first();
    const href = await product.getAttribute("href");
    if (!href) throw new Error("No demo product");
    await visitor.goto(new URL(href, shop).href, {
      waitUntil: "domcontentloaded",
    });
    const added = visitor.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).origin === new URL(shop).origin &&
        response.request().postData()?.includes("add=1") === true,
      { timeout: 20_000 },
    );
    await visitor.locator('[data-button-action="add-to-cart"]').first().click();
    const addResponse = await added;
    expect(addResponse.ok()).toBe(true);
    const addBody = await addResponse.text();
    // Debug-mode PHP notices can turn a 200 cart response into invalid JSON.
    // Report the response shape, never customer fields or session credentials.
    let addResult: { hasError?: boolean; errors?: unknown[] };
    try {
      addResult = JSON.parse(addBody);
    } catch {
      throw new Error(
        `Cart endpoint returned non-JSON: PHP diagnostic=${/Deprecated|Warning|Notice|Fatal error/i.test(addBody)}, module-origin=${addBody.toLowerCase().includes("modules/convor/")}, profiler=${/sf-toolbar|Symfony Profiler/i.test(addBody)}`,
      );
    }
    expect(addResult.hasError ?? false).toBe(false);
    expect(addResult.errors ?? []).toHaveLength(0);
    const checkout = await nativeCheckout(visitor);
    const checkoutStep = visitor.locator("#checkout-personal-information-step");
    if (checkout?.status() !== 200 || !(await checkoutStep.isVisible())) {
      const html = await visitor.content();
      // Capture safe routing and diagnostic flags, not cookies or personal data.
      console.error("Checkout diagnostic:", {
        status: checkout?.status(),
        controller: new URL(visitor.url()).searchParams.get("controller"),
        cartProducts: (addResult as { cart?: { products_count?: number } }).cart
          ?.products_count,
        phpDiagnostic: /Deprecated|Warning|Notice|Fatal error/i.test(html),
        moduleOrigin: html.toLowerCase().includes("modules/convor/"),
        symfonyException: /Symfony Exception|Exception Stack Trace/i.test(html),
        emptyCart:
          /Your cart is empty|There are no more items in your cart/i.test(html),
      });
    }
    expect(checkout?.status()).toBe(200);
    await expect(checkoutStep).toBeVisible({ timeout: 20_000 });
    await expect(visitor.locator("script[data-key]")).toHaveCount(0);
    await expect(visitor.locator(".convor-trigger")).toHaveCount(0);
  } finally {
    await visitor.close();
    await page.locator("#CONVOR_WIDGET_KEY").fill(originalKey);
    await page.locator("#CONVOR_VERIFICATION_CHALLENGE").fill(originalProof);
    for (const [field, value] of original) {
      await page
        .locator(`input[name="CONVOR_${field}"][value="${value}"]`)
        .check({ force: true });
    }
    await page.locator("#configuration_form_submit_btn").click();
  }
});
