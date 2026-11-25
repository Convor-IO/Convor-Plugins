import { execFileSync } from "node:child_process";
import {
  type Browser,
  devices,
  expect,
  type Page,
  test,
} from "@playwright/test";

/**
 * Runs against the actual WordPress ZIP installation, Convor API, dashboard,
 * database and real-time server. No mocked network responses.
 */
const wp = process.env.WP_URL ?? "http://127.0.0.1:18206";
const dashboard = process.env.CONVOR_DASHBOARD_URL ?? "http://localhost:17204";
const api = process.env.CONVOR_API_URL ?? "http://localhost:17203";

function required(name: string) {
  const value = process.env[name];
  if (!value)
    throw new Error(`Set ${name} for the isolated WordPress E2E fixture`);
  return value;
}

async function wordpressAdmin(page: Page) {
  await page.goto(`${wp}/wp-login.php`);
  await page.locator("#user_login").fill(required("WP_ADMIN_USER"));
  await page.locator("#user_pass").fill(required("WP_ADMIN_PASSWORD"));
  await page.locator("#wp-submit").click();
  await page.goto(`${wp}/wp-admin/options-general.php?page=convor`);
  await expect(page.locator("#convor_widget_key")).toBeVisible();
}

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

test("WordPress connects through the dashboard and exchanges real chat messages", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  // Start with a WordPress-only session. Exercise the actual login redirect,
  // not a pre-authenticated request or a manually constructed organization URL.
  await wordpressAdmin(page);
  const initialSettings = wpEval(
    'echo json_encode(get_option("convor_settings", array()));',
  );
  let complete = false;
  try {
    const publicKey = page.locator("#convor_widget_key");
    await publicKey.fill("");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(publicKey).toHaveValue("");
    await page.getByRole("link", { name: "Connect with Convor" }).click();
    await expect(page).toHaveURL(/\/login\?/, { timeout: 60_000 });
    // The login form renders before React hydration. Its submit button is
    // deliberately disabled until hydration completes; typing earlier can
    // lose the controlled input values during hydration.
    await expect(page.getByTestId("login-submit")).toBeEnabled({
      timeout: 90_000,
    });
    await page.getByTestId("login-email").fill(required("CONVOR_TEST_EMAIL"));
    await page
      .getByTestId("login-password")
      .fill(required("CONVOR_TEST_PASSWORD"));
    await page.getByTestId("login-submit").click();
    await page.waitForURL(
      (url) =>
        url.pathname === "/select-organization" ||
        url.pathname.endsWith("/integrations/wordpress"),
      { timeout: 90_000 },
    );
    // Provisioning can leave the test operator in more than one organization.
    // Select the fixture tenant through the actual organization chooser.
    if (new URL(page.url()).pathname === "/select-organization") {
      await page
        .getByTestId(`organization-choice-option-${required("CONVOR_ORG_ID")}`)
        .click();
    }
    await expect(page).toHaveURL(/\/integrations\/wordpress\?/, {
      timeout: 90_000,
    });
    const key = page.getByTestId("wordpress-widget-key");
    await expect(key).toBeVisible({ timeout: 60_000 });
    const expectedKey = await key.inputValue();
    expect(expectedKey).toMatch(/^convor_wpk_[a-f0-9]{64}$/);
    await page.getByRole("button", { name: "Connect this website" }).click();
    await expect(page).toHaveURL(/convor_pairing=success/, { timeout: 30_000 });
    await expect(publicKey).toHaveValue(expectedKey);

    await roundTrip(page, browser, expectedKey);
    complete = true;
  } finally {
    if (!complete)
      wpEval(
        'update_option("convor_settings", json_decode(getenv("CONVOR_QA_THEME_KEY"), true));',
        initialSettings,
      );
  }
});

test("Real WordPress pairing callback is bound to its administrator session and cannot be replayed", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  await operator(page);
  await wordpressAdmin(page);
  const keyField = page.locator("#convor_widget_key");
  const save = page.getByRole("button", { name: "Save settings" });
  const headers = {
    Origin: dashboard,
    "X-Organization-Id": required("CONVOR_ORG_ID"),
    "X-Project-Id": required("CONVOR_PROJECT_ID"),
  };
  const project = await page.request.get(
    `${api}/api/projects/${required("CONVOR_PROJECT_ID")}`,
    { headers },
  );
  expect(project.ok()).toBe(true);
  const expectedKey = (await project.json()).project.widgetPublicKey;
  expect(expectedKey).toMatch(/^convor_wpk_[a-f0-9]{64}$/);

  await keyField.fill("");
  await save.click();
  await expect(keyField).toHaveValue("");
  try {
    // Use the actual WordPress redirect and Convor API, without requiring
    // the dashboard dev server to compile during the compatibility matrix.
    const startLink = await page
      .getByRole("link", { name: "Connect with Convor" })
      .getAttribute("href");
    if (!startLink) throw new Error("WordPress pairing link missing");
    const start = await page.request.get(new URL(startLink, wp).href, {
      maxRedirects: 0,
    });
    expect(start.status()).toBe(302);
    const destination = new URL(start.headers().location);
    expect(destination.origin).toBe(new URL(dashboard).origin);
    const params = destination.searchParams;
    const authorization = await page.request.post(
      `${api}/api/wordpress/pairing/start`,
      {
        headers,
        data: {
          siteUrl: params.get("wp_site"),
          callback: params.get("wp_callback"),
          state: params.get("wp_state"),
          verifierHash: params.get("wp_proof"),
        },
      },
    );
    expect(authorization.ok()).toBe(true);
    const callback = new URL((await authorization.json()).redirectUrl);
    expect(callback.origin).toBe(new URL(wp).origin);

    // The same administrator logged in independently is not the initiating
    // session and must not consume its one-time grant.
    const other = await browser.newPage();
    try {
      await wordpressAdmin(other);
      await other.goto(callback.href);
      await expect(other).toHaveURL(/convor_pairing=failed/);
      await expect(other.locator("#convor_widget_key")).toHaveValue("");
    } finally {
      await other.close();
    }

    await page.goto(callback.href);
    await expect(page).toHaveURL(/convor_pairing=success/);
    await expect(keyField).toHaveValue(expectedKey);
    await page.goto(callback.href);
    await expect(page).toHaveURL(/convor_pairing=failed/);
    await expect(keyField).toHaveValue(expectedKey);
    // The separate manual and dashboard journeys cover message delivery.
    // Keep this security test focused on actual callback/session behavior.
    const visitor = await browser.newPage({ ...devices["Desktop Chrome"] });
    try {
      await visitor.goto(wp);
      await expect(
        visitor.locator('script[src*="/widget.js"][data-key]'),
      ).toHaveAttribute("data-key", expectedKey);
    } finally {
      await visitor.close();
    }
  } finally {
    await page.goto(`${wp}/wp-admin/options-general.php?page=convor`);
    await keyField.fill(expectedKey);
    await page.getByLabel("Enable Convor on public pages").check();
    await page.getByLabel("Wait for consent before loading Convor").uncheck();
    await save.click();
  }
});

test("Installation status observes the actual widget on the current primary domain", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  await operator(page);
  const projectId = required("CONVOR_PROJECT_ID");
  const headers = {
    Origin: dashboard,
    "X-Organization-Id": required("CONVOR_ORG_ID"),
    "X-Project-Id": projectId,
  };
  const status = async () => {
    const response = await page.request.get(
      `${api}/api/wordpress/installation/status`,
      { headers },
    );
    expect(response.status()).toBe(200);
    return response.json();
  };
  const project = await page.request.get(`${api}/api/projects/${projectId}`, {
    headers,
  });
  expect(project.ok()).toBe(true);
  const detail = await project.json();
  const key = detail.project.widgetPublicKey;
  expect(key).toMatch(/^convor_wpk_[a-f0-9]{64}$/);
  // This scenario owns only the freshly provisioned fixture's domain.
  expect(detail.domains).toHaveLength(0);
  expect(await status()).toMatchObject({ status: "domain_required" });
  const domain = await page.request.post(
    `${api}/api/projects/${projectId}/domains`,
    {
      headers,
      data: { value: new URL(wp).hostname, isPrimary: true },
    },
  );
  expect(domain.status()).toBe(201);
  const domainId = (await domain.json()).domain.id;
  try {
    const allowlist = await page.request.patch(
      `${api}/api/projects/${projectId}`,
      {
        headers,
        data: { domainPolicy: "allowlist" },
      },
    );
    expect(allowlist.ok()).toBe(true);
    const wrongSite = "https://not-allowed.example.test";
    const denied = await page.request.post(
      `${api}/api/wordpress/pairing/start`,
      {
        headers,
        data: {
          siteUrl: wrongSite,
          callback: `${wrongSite}/wp-admin/admin-post.php?action=convor_pair_complete`,
          state: "a".repeat(64),
          verifierHash: "b".repeat(64),
        },
      },
    );
    expect(denied.status()).toBe(403);
    expect(await status()).toMatchObject({ status: "not_observed" });
    await wordpressAdmin(page);
    await page.locator("#convor_widget_key").fill(key);
    await page.getByLabel("Enable Convor on public pages").check();
    await page.getByLabel("Wait for consent before loading Convor").uncheck();
    await page.getByRole("button", { name: "Save settings" }).click();
    const visitor = await browser.newPage({ ...devices["Desktop Chrome"] });
    try {
      await visitor.goto(wp);
      await expect(visitor.locator(".convor-trigger")).toBeVisible({
        timeout: 30_000,
      });
      await expect.poll(status, { timeout: 30_000 }).toMatchObject({
        status: "observed",
        hostname: new URL(wp).hostname,
        observedAt: expect.any(String),
      });
    } finally {
      await visitor.close();
    }
  } finally {
    const restored = await page.request.patch(
      `${api}/api/projects/${projectId}`,
      {
        headers,
        data: { domainPolicy: detail.project.domainPolicy },
      },
    );
    expect(restored.ok()).toBe(true);
    const removed = await page.request.delete(
      `${api}/api/projects/${projectId}/domains/${domainId}`,
      { headers },
    );
    expect(removed.ok()).toBe(true);
  }
  expect(await status()).toMatchObject({ status: "domain_required" });
});

test("Manual widget key, disabling and missing consent API work in real WordPress", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await operator(page);
  // Read the exact selected-site key using the authenticated API. This
  // keeps this test independent of the separate dashboard pairing journey.
  const project = await page.request.get(
    `${api}/api/projects/${required("CONVOR_PROJECT_ID")}`,
    {
      headers: {
        Origin: dashboard,
        "X-Organization-Id": required("CONVOR_ORG_ID"),
        "X-Project-Id": required("CONVOR_PROJECT_ID"),
      },
    },
  );
  expect(project.ok()).toBe(true);
  const key: string = (await project.json()).project.widgetPublicKey;
  expect(key).toMatch(/^convor_wpk_[a-f0-9]{64}$/);
  await wordpressAdmin(page);
  const publicKey = page.locator("#convor_widget_key");
  const enabled = page.getByLabel("Enable Convor on public pages");
  const consent = page.getByLabel("Wait for consent before loading Convor");
  const save = page.getByRole("button", { name: "Save settings" });
  try {
    await publicKey.fill(key);
    await enabled.check();
    await consent.uncheck();
    await save.click();
    await expect(publicKey).toHaveValue(key);
    await roundTrip(page, browser, key);

    await enabled.uncheck();
    await save.click();
    await expect(enabled).not.toBeChecked();
    const visitor = await browser.newPage({ ...devices["Desktop Chrome"] });
    try {
      await visitor.goto(wp);
      await expect(visitor.locator('script[src*="/widget.js"]')).toHaveCount(0);
      await expect(visitor.locator(".convor-trigger")).toHaveCount(0);
      await enabled.check();
      await consent.check();
      await save.click();
      await expect(consent).toBeChecked();
      await visitor.reload();
      await expect(visitor.locator('script[src*="/widget.js"]')).toHaveCount(0);
      await expect(visitor.locator(".convor-trigger")).toHaveCount(0);
    } finally {
      await visitor.close();
    }
  } finally {
    await page.goto(`${wp}/wp-admin/options-general.php?page=convor`);
    await publicKey.fill(key);
    await enabled.check();
    await consent.uncheck();
    await save.click();
  }
});

test("Deactivation preserves settings and uninstall clears only WordPress data", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  await operator(page);
  const project = await page.request.get(
    `${api}/api/projects/${required("CONVOR_PROJECT_ID")}`,
    {
      headers: {
        Origin: dashboard,
        "X-Organization-Id": required("CONVOR_ORG_ID"),
        "X-Project-Id": required("CONVOR_PROJECT_ID"),
      },
    },
  );
  expect(project.ok()).toBe(true);
  const key = (await project.json()).project.widgetPublicKey;
  expect(key).toMatch(/^convor_wpk_[a-f0-9]{64}$/);
  const visitor = await browser.newPage({ ...devices["Desktop Chrome"] });
  const loader = visitor.locator('script[src*="/widget.js"][data-key]');
  try {
    wpEval(
      'update_option("convor_settings", array_replace(convor_settings_defaults(), array("widget_key"=>getenv("CONVOR_QA_THEME_KEY"),"enabled"=>true)));',
      key,
    );
    await visitor.goto(wp);
    await expect(loader).toHaveAttribute("data-key", key);

    wpEval('deactivate_plugins("convor/convor.php");');
    await visitor.reload();
    await expect(loader).toHaveCount(0);
    expect(
      wpEval('echo get_option("convor_settings")["enabled"] ? "yes" : "no";'),
    ).toBe("yes");

    wpEval(
      '$r=activate_plugin("convor/convor.php"); if(is_wp_error($r)){exit(1);}',
    );
    await visitor.reload();
    await expect(loader).toHaveAttribute("data-key", key);

    wpEval(
      'set_transient("convor_widget_pairing", array("test"=>true), 60); deactivate_plugins("convor/convor.php"); uninstall_plugin("convor/convor.php"); echo (false===get_option("convor_settings") && false===get_transient("convor_widget_pairing")) ? "clean" : "dirty";',
    );
    expect(
      wpEval('echo false===get_option("convor_settings") ? "clean" : "dirty";'),
    ).toBe("clean");
    expect(
      wpEval(
        'echo false===get_transient("convor_widget_pairing") ? "clean" : "dirty";',
      ),
    ).toBe("clean");
    wpEval(
      '$r=activate_plugin("convor/convor.php"); if(is_wp_error($r)){exit(1);}',
    );
    await visitor.reload();
    await expect(loader).toHaveCount(0);
    await wordpressAdmin(page);
    await expect(page.locator("#convor_widget_key")).toHaveValue("");
    const stillExists = await page.request.get(
      `${api}/api/projects/${required("CONVOR_PROJECT_ID")}`,
      {
        headers: {
          Origin: dashboard,
          "X-Organization-Id": required("CONVOR_ORG_ID"),
          "X-Project-Id": required("CONVOR_PROJECT_ID"),
        },
      },
    );
    expect(stillExists.ok()).toBe(true);
    expect((await stillExists.json()).project.widgetPublicKey).toBe(key);
  } finally {
    await visitor.close();
    wpEval(
      '$r=activate_plugin("convor/convor.php"); if(is_wp_error($r)){exit(1);}',
    );
    wpEval(
      'update_option("convor_settings", array_replace(convor_settings_defaults(), array("widget_key"=>getenv("CONVOR_QA_THEME_KEY"),"enabled"=>true)));',
      key,
    );
  }
});

// Theme tests mutate only the dedicated disposable WordPress container.
function wpEval(code: string, key?: string): string {
  for (const url of [wp, dashboard, api]) {
    expect(["127.0.0.1", "localhost"]).toContain(new URL(url).hostname);
  }
  const container = process.env.WP_QA_CONTAINER ?? "convor-wordpress-1806-wp-1";
  if (!/^convor-wordpress-[0-9]+-wp-1$/.test(container))
    throw new Error("Dedicated WordPress fixture required");
  return execFileSync(
    "docker",
    [
      "exec",
      ...(key ? ["-e", "CONVOR_QA_THEME_KEY"] : []),
      container,
      "php",
      "-r",
      'require "/var/www/html/wp-load.php"; require_once ABSPATH."wp-admin/includes/plugin.php"; ' +
        code,
    ],
    {
      encoding: "utf8",
      timeout: 30_000,
      env: { ...process.env, CONVOR_QA_THEME_KEY: key ?? "" },
    },
  ).trim();
}

// Playwright gives afterEach its own timeout budget. Restore the fixture even
// if a browser operation times out before the test body's finally completes.
let manualThemeToRestore: string | undefined;
function restoreManualTheme() {
  const original = manualThemeToRestore;
  if (!original) return;
  wpEval(
    `switch_theme("${original}"); delete_option("convor_qa_theme_public_key"); $result = activate_plugin("convor/convor.php"); if (is_wp_error($result)) { exit(1); }`,
  );
  manualThemeToRestore = undefined;
}

test.afterEach(() => restoreManualTheme());

test("Manual installation in classic and block themes works with the plugin deactivated", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await operator(page);
  const project = await page.request.get(
    `${api}/api/projects/${required("CONVOR_PROJECT_ID")}`,
    {
      headers: {
        Origin: dashboard,
        "X-Organization-Id": required("CONVOR_ORG_ID"),
        "X-Project-Id": required("CONVOR_PROJECT_ID"),
      },
    },
  );
  expect(project.ok()).toBe(true);
  const key = (await project.json()).project.widgetPublicKey;
  expect(key).toMatch(/^convor_wpk_[a-f0-9]{64}$/);
  const original = wpEval("echo get_stylesheet();");
  if (!/^[a-z0-9_-]+$/.test(original))
    throw new Error("Unexpected fixture theme");
  manualThemeToRestore = original;
  try {
    wpEval(
      'deactivate_plugins("convor/convor.php"); update_option("convor_qa_theme_public_key", getenv("CONVOR_QA_THEME_KEY"));',
      key,
    );
    expect(
      wpEval(
        'echo is_plugin_active("convor/convor.php") ? "active" : "inactive";',
      ),
    ).toBe("inactive");
    for (const theme of ["convor-qa-classic", "convor-qa-block"]) {
      wpEval(
        `if (!wp_get_theme("${theme}")->exists()) { exit(1); } switch_theme("${theme}");`,
      );
      expect(wpEval("echo get_stylesheet();")).toBe(theme);
      await roundTrip(page, browser, key);
    }
  } finally {
    restoreManualTheme();
  }
});

test("WooCommerce product and cart context is persisted for each visitor", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  await operator(page);
  const productId = Number(
    wpEval(
      '$p = new WC_Product_Simple(); $p->set_name("Convor QA product"); $p->set_status("publish"); $p->set_regular_price("19.50"); $p->save(); echo $p->get_id();',
    ),
  );
  expect(Number.isSafeInteger(productId) && productId > 0).toBe(true);
  const productUrl = new URL(wpEval(`echo get_permalink(${productId});`));
  expect(productUrl.origin).toBe(new URL(wp).origin);
  const currency = wpEval("echo get_woocommerce_currency();");
  const headers = {
    Origin: dashboard,
    "X-Organization-Id": required("CONVOR_ORG_ID"),
    "X-Project-Id": required("CONVOR_PROJECT_ID"),
  };
  try {
    for (const cartTotal of ["19.50", "0.00"]) {
      const visitor = await browser.newPage({ ...devices["Desktop Chrome"] });
      try {
        if (cartTotal !== "0.00") {
          const cartUrl = new URL(productUrl);
          cartUrl.searchParams.set("add-to-cart", String(productId));
          await visitor.goto(cartUrl.href);
        }
        await visitor.goto(productUrl.href);
        await expect(visitor.locator(".convor-trigger")).toBeVisible({
          timeout: 30_000,
        });
        const state = await visitor.evaluate(async () => {
          const api = (
            window as Window & {
              Convor: {
                ready(): Promise<{ ready: boolean; visitorId: string }>;
              };
            }
          ).Convor;
          return api.ready();
        });
        expect(state.ready).toBe(true);
        expect(state.visitorId).toBeTruthy();
        await expect
          .poll(
            async () => {
              const response = await page.request.get(
                `${api}/api/visitors/${state.visitorId}`,
                { headers },
              );
              if (!response.ok()) return null;
              const body = await response.json();
              return body.metadata?.attributes;
            },
            { timeout: 30_000 },
          )
          .toMatchObject({
            productId,
            productName: "Convor QA product",
            productPrice: "19.50",
            cartTotal,
            cartCurrency: currency,
          });
      } finally {
        await visitor.close();
      }
    }
  } finally {
    wpEval(`wp_delete_post(${productId}, true);`);
  }
});

test("WP Consent API opt-in and withdrawal gate the real widget", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const plugin = "wp-consent-api/wp-consent-api.php";
  const original = wpEval(
    `echo is_plugin_active("${plugin}") ? "active" : "inactive";`,
  );
  await wordpressAdmin(page);
  const consent = page.getByLabel("Wait for consent before loading Convor");
  const save = page.getByRole("button", { name: "Save settings" });
  const initialConsent = await consent.isChecked();
  try {
    wpEval(
      `$result = activate_plugin("${plugin}"); if (is_wp_error($result)) { fwrite(STDERR, $result->get_error_message()); exit(1); } update_option("convor_qa_cmp_optin", true);`,
    );
    expect(
      wpEval("echo function_exists('wp_has_consent') ? 'yes' : 'no';"),
    ).toBe("yes");
    await consent.check();
    await save.click();
    await expect(consent).toBeChecked();
    const visitor = await browser.newPage({ ...devices["Desktop Chrome"] });
    try {
      const requests: string[] = [];
      visitor.on("request", (request) => {
        const url = new URL(request.url());
        if (url.origin === new URL(api).origin) requests.push(url.pathname);
      });
      await visitor.goto(wp);
      await visitor.waitForFunction(
        () =>
          typeof (window as Window & { wp_has_consent?: unknown })
            .wp_has_consent === "function",
      );
      const script = visitor.locator('script[src*="/widget.js"][data-key]');
      await expect(script).toHaveCount(0);
      expect(requests).toEqual([]);
      await visitor.evaluate(() => {
        (
          window as Window & {
            wp_set_consent(category: string, value: string): void;
          }
        ).wp_set_consent("marketing", "allow");
      });
      await expect(script).toHaveCount(1);
      await expect(visitor.locator(".convor-trigger")).toBeVisible({
        timeout: 30_000,
      });
      expect(requests).toContain("/widget.js");

      const reload = visitor.waitForEvent("framenavigated", {
        predicate: (frame) => frame === visitor.mainFrame(),
        timeout: 30_000,
      });
      await visitor.evaluate(() => {
        (
          window as Window & {
            wp_set_consent(category: string, value: string): void;
          }
        ).wp_set_consent("marketing", "deny");
      });
      await reload;
      await visitor.waitForLoadState("domcontentloaded");
      await expect(script).toHaveCount(0);
      await expect(visitor.locator(".convor-trigger")).toHaveCount(0);
      const count = requests.length;
      await visitor.reload();
      await expect(script).toHaveCount(0);
      expect(requests).toHaveLength(count);
    } finally {
      await visitor.close();
    }
  } finally {
    wpEval(
      `delete_option("convor_qa_cmp_optin"); ${original === "active" ? "" : `deactivate_plugins("${plugin}");`}`,
    );
    await page.goto(`${wp}/wp-admin/options-general.php?page=convor`);
    await consent.setChecked(initialConsent);
    await save.click();
  }
});

test("Mobile WordPress chat sends and receives a persisted conversation", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  await operator(page);
  const response = await page.request.get(
    `${api}/api/projects/${required("CONVOR_PROJECT_ID")}`,
    {
      headers: {
        Origin: dashboard,
        "X-Organization-Id": required("CONVOR_ORG_ID"),
        "X-Project-Id": required("CONVOR_PROJECT_ID"),
      },
    },
  );
  expect(response.ok()).toBe(true);
  const key = (await response.json()).project.widgetPublicKey;
  await roundTrip(page, browser, key, "Pixel 7");
});

async function roundTrip(
  page: Page,
  browser: Browser,
  expectedKey: string,
  device: "Desktop Chrome" | "Pixel 7" = "Desktop Chrome",
) {
  // A human-visitor profile on the isolated local fixture, matching the
  // existing SaaS browser test configuration. Never use it on a live site.
  for (const url of [wp, dashboard, api]) {
    expect(["127.0.0.1", "localhost"]).toContain(new URL(url).hostname);
  }
  const visitor = await browser.newPage({ ...devices[device] });
  visitor.setDefaultTimeout(30_000);
  visitor.setDefaultNavigationTimeout(30_000);
  // Collect browser-side exceptions when a send fails before reaching the API.
  const pageErrors: string[] = [];
  visitor.on("pageerror", (error) => {
    pageErrors.push(error.message.slice(0, 300));
  });
  try {
    await visitor.goto(wp);
    const script = visitor.locator('script[src*="/widget.js"][data-key]');
    await expect(script).toHaveCount(1);
    await expect(script).toHaveAttribute("data-key", expectedKey);
    const launcher = visitor.locator(".convor-trigger");
    await expect(launcher).toBeVisible({ timeout: 30_000 });
    // The launcher can appear before the real iframe has completed visitor
    // bootstrap. Wait for its public readiness contract, not a fixed delay.
    const readiness = await visitor.evaluate(async () =>
      (
        window as Window & {
          Convor: { ready(): Promise<{ ready: boolean }> };
        }
      ).Convor.ready(),
    );
    expect(readiness.ready).toBe(true);
    // Keep the cross-origin iframe's physical click targets stationary while
    // opening; a transformed iframe can receive a pointer event on the host
    // element rather than the actual button in Chromium.
    const iframe = visitor.locator('iframe[src*="widget-iframe"]').first();
    const closedGeometry = await iframe.boundingBox();
    expect(closedGeometry).not.toBeNull();
    await launcher.click();
    await expect(launcher).toHaveAttribute("aria-expanded", "true");
    const openingGeometry = await iframe.evaluate(async (element) => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    });
    expect(openingGeometry).toEqual(closedGeometry);
    const frame = visitor.frameLocator('iframe[src*="widget-iframe"]').first();
    const startChat = frame.locator('[data-welcome-action="start"]');
    const composer = frame.locator(".convor-chat > .convor-input");
    const input = composer.locator('[data-testid="widget-input-field"]');
    // A returning visitor may have a restored conversation instead of the welcome screen.
    await expect(
      startChat.or(input).filter({ visible: true }).first(),
    ).toBeVisible({ timeout: 30_000 });
    if (await startChat.isVisible()) await startChat.click();
    await expect(input).toBeVisible({ timeout: 30_000 });
    // Host ready() covers visitor bootstrap; this test also requires a live
    // conversation subscription before asserting bidirectional delivery.
    await expect(frame.locator(".convor-chat")).toHaveClass(
      /convor-chat--ready/,
      { timeout: 30_000 },
    );
    const suffix = Date.now();
    const question = `WordPress chat test ${suffix}`;
    const answer = `Convor operator reply ${suffix}`;
    await input.fill(question);
    await expect(input).toHaveValue(question);
    const sendButton = composer.locator(".convor-input__send");
    await expect(sendButton).toBeEnabled();
    const result = await Promise.all([
      visitor.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          /\/api\/conversations\/[^/]+\/messages$/.test(
            new URL(response.url()).pathname,
          ),
        { timeout: 30_000 },
      ),
      sendButton.click(),
    ])
      .then(([response]) => response)
      .catch(async (error) => {
        const state = await frame.locator(".convor-chat").evaluate((el) => ({
          composerValue: el.querySelector<HTMLTextAreaElement>(
            ":scope > .convor-input .convor-input__field",
          )?.value,
          failed: el.querySelectorAll(".convor-msg--failed").length,
          queued: el.querySelectorAll(".convor-msg__queued").length,
          status: el.querySelector(".convor-header__status-label")?.textContent,
        }));
        throw new Error(
          `No visitor message HTTP response: ${JSON.stringify({ ...state, pageErrors })}`,
          { cause: error },
        );
      });
    expect(
      result.status(),
      `Visitor message response: ${await result.text()}`,
    ).toBe(201);
    const conversationId = new URL(result.url()).pathname.split("/")[3];
    const headers = {
      Origin: dashboard,
      "X-Organization-Id": required("CONVOR_ORG_ID"),
      "X-Project-Id": required("CONVOR_PROJECT_ID"),
    };
    const messages = await page.request.get(
      `${api}/api/conversations/${conversationId}/messages?limit=50`,
      { headers },
    );
    expect(messages.status()).toBe(200);
    expect(await messages.text()).toContain(question);
    const sent = await page.request.post(
      `${api}/api/conversations/${conversationId}/messages`,
      {
        headers,
        data: { senderType: "operator", content: answer, type: "text" },
      },
    );
    expect(sent.status()).toBe(201);
    await expect(
      frame
        .locator(".convor-msg--operator .convor-msg__bubble")
        .filter({ hasText: answer }),
    ).toBeVisible({ timeout: 30_000 });
    if (device === "Pixel 7") {
      // The same visitor should recover its persisted messages on reload.
      await visitor.reload();
      await visitor.locator(".convor-trigger").waitFor();
      await visitor.evaluate(() =>
        (
          window as Window & { Convor: { ready(): Promise<unknown> } }
        ).Convor.ready(),
      );
      const trigger = visitor.locator(".convor-trigger");
      if ((await trigger.getAttribute("aria-expanded")) !== "true")
        await trigger.click();
      await expect(
        frame
          .locator(".convor-msg--operator .convor-msg__bubble")
          .filter({ hasText: answer }),
      ).toBeVisible({ timeout: 30_000 });
    }
  } finally {
    await visitor.close();
  }
}
