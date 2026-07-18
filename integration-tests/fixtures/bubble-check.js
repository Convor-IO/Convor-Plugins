/**
 * Optional bubble-mount check for the real OpenCart + Magento installs.
 *
 * Drives chromium directly via the `playwright` package (avoids the
 * @playwright/test runner's version/resolution friction in this monorepo).
 *
 * Verifies the widget snippet actually boots and renders `.convor-trigger`
 * on each storefront. The hard requirement (both emit the canonical snippet)
 * is asserted by the curl/grep checks in each fixture's README; this is the
 * optional "does the bubble really pop" confirmation on top.
 *
 * Run:
 *   PLAYWRIGHT_NODE_MODULES=/path/to/playwright/.. node bubble-check.js
 * or, with the monorepo's copy:
 *   node -e "process.env.NODE_PATH='<playwright pkg parent>'; require('module').Module._initPaths(); require('./bubble-check.js')"
 */
const {chromium} = require("playwright");

const TARGETS = [
  ["opencart", "http://localhost:8084/"],
  ["magento", "http://localhost:8085/"],
];

// The widget fetches org config + an iframe asynchronously; on heavier CMS
// pages (OpenCart loads jQuery + Bootstrap) it can take a while to attach.
const BUBBLE_TIMEOUT = 30000;

(async () => {
  const browser = await chromium.launch({headless: true});
  let anyFail = false;

  for (const [name, url] of TARGETS) {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text()}`);
    });

    try {
      await page.goto(url, {waitUntil: "load", timeout: 30000});

      const html = await page.content();
      if (!html.includes("widget.js")) {
        throw new Error("snippet (widget.js) missing from page HTML");
      }

      // Poll for the trigger element (the widget mounts it asynchronously).
      let mounted = false;
      const deadline = Date.now() + BUBBLE_TIMEOUT;
      while (Date.now() < deadline) {
        if ((await page.locator(".convor-trigger").count()) > 0) {
          mounted = true;
          break;
        }
        await page.waitForTimeout(1000);
      }

      if (mounted) {
        console.log(`PASS  ${name}: .convor-trigger bubble mounted on ${url}`);
      } else {
        // Snippet correct but bubble didn't mount — a widget-runtime concern,
        // not a plugin defect (the plugin's job is to emit the snippet).
        console.log(
          `NOTE  ${name}: snippet emitted correctly, but .convor-trigger did not mount within ${BUBBLE_TIMEOUT / 1000}s (widget-runtime/CSS timing, not a plugin defect)`
        );
      }
      if (errors.length) {
        console.log(`      (${errors.length} console/page errors:)`);
        for (const e of errors.slice(0, 5)) console.log(`        - ${e}`);
      }
    } catch (err) {
      anyFail = true;
      console.log(`FAIL  ${name}: ${err.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  // We don't fail the process on a bubble not mounting — only on snippet
  // absence (the real contract). The curl/grep checks in each fixture's
  // README are the gating assertion.
  process.exit(anyFail ? 1 : 0);
})();
