// Real browser smoke for the disposable WordPress HTTPS demo. Does not
// authorize a live Convor tenant or submit any request with real credentials.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const base = process.argv[2]?.replace(/\/$/, "");
if (!base || !/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(base)) {
  throw new Error("Expected the HTTPS quick-tunnel address");
}
const password = process.env.WP_DEMO_ADMIN_PASSWORD;
if (!password) throw new Error("Load the ignored public QA credentials");

const browser = await chromium.launch();
try {
  const visitor = await browser.newPage();
  try {
    const response = await visitor.goto(base, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    assert.equal(response?.status(), 200);
    assert.equal(await visitor.evaluate(() => window.isSecureContext), true);
    assert.match(await visitor.title(), /Convor WordPress demo/);
    assert.equal(
      await visitor.locator('meta[name="robots"][content*="noindex"]').count(),
      1,
    );
    assert.equal(
      await visitor.locator('script[src*="convor.io/widget.js"]').count(),
      0,
    );
    assert.equal(
      await visitor
        .locator(
          'script[src^="http://"],link[rel="stylesheet"][href^="http://"]',
        )
        .count(),
      0,
    );
    console.log(
      "PASS public HTTPS WordPress, noindex, no unconfigured widget or mixed-content scripts/styles",
    );
  } finally {
    await visitor.close();
  }

  const admin = await browser.newPage();
  try {
    await admin.goto(`${base}/wp-login.php`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await admin.locator("#user_login").fill("convorqa");
    await admin.locator("#user_pass").fill(password);
    await Promise.all([
      admin.waitForURL(
        (url) => url.origin === base && url.pathname.startsWith("/wp-admin/"),
        { timeout: 60_000 },
      ),
      admin.locator("#wp-submit").click(),
    ]);
    await admin.waitForLoadState("domcontentloaded");
    await admin.goto(`${base}/wp-admin/options-general.php?page=convor`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    const key = admin.locator("#convor_widget_key");
    await key.waitFor({ timeout: 30_000 });
    assert.equal(await key.inputValue(), "");
    const cookies = await admin
      .context()
      .cookies([`${base}/wp-admin/`, `${base}/`]);
    assert.ok(
      cookies.some(
        (cookie) =>
          cookie.name.startsWith("wordpress_sec_") &&
          cookie.secure &&
          cookie.httpOnly,
      ),
    );
    const start = await admin
      .getByRole("link", { name: "Connect with Convor" })
      .getAttribute("href");
    assert.ok(start);
    const redirect = await admin.request.get(start, { maxRedirects: 0 });
    assert.equal(redirect.status(), 302);
    const target = new URL(redirect.headers().location);
    assert.equal(target.origin, "https://dashboard.convor.io");
    assert.equal(target.searchParams.get("wp_site"), `${base}/`);
    const callback = new URL(target.searchParams.get("wp_callback"));
    assert.equal(callback.origin, base);
    assert.equal(callback.pathname, "/wp-admin/admin-post.php");
    assert.equal(callback.searchParams.get("action"), "convor_pair_complete");
    assert.match(target.searchParams.get("wp_state") ?? "", /^[a-f0-9]{64}$/);
    assert.match(target.searchParams.get("wp_proof") ?? "", /^[a-f0-9]{64}$/);
    console.log(
      "PASS public wp-admin, secure authentication cookie, genuine pairing redirect and HTTPS callback",
    );
  } finally {
    await admin.close();
  }
} finally {
  await browser.close();
}
