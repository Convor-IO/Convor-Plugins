/**
 * GTM template integration test.
 *
 * The GTM custom template (gtm/template.tpl) cannot emit a literal
 * `<script data-key=...>` tag — GTM's sandboxed `injectScript` only takes a
 * URL. So this test verifies the *semantic* equivalent: the template loads
 * widget.js from the clean canonical URL and delivers the org slug through
 * the widget's supported `ConvorWidget.init({ key })` API.
 *
 * WHY THIS MATTERS — the previous template was BROKEN:
 *   The widget loader (saas/apps/widget/src/embed.ts → config.ts:resolveConfig)
 *   reads the org slug ONLY from the data-key/data-org attribute on its own
 *   <script> tag (or an explicit init({ key }) call). It does NOT read ?key=
 *   query params and does NOT read a window.ConvorConfig global. The old
 *   template delivered the slug via BOTH unsupported channels
 *   (setInWindow('ConvorConfig', { key }) + ?key= on the URL), so widget.js
 *   would load but the widget would throw `"key" is required` and never mount.
 *
 * THE FIX:
 *   The template now loads widget.js from a clean URL (no ?key=) and, in the
 *   script's onSuccess callback, calls `window.ConvorWidget.init({ key, ... })`
 *   via callInWindow — the widget's other documented entry point.
 *
 * This test:
 *   1. Extracts the ___SANDBOXED_JS_FOR_WEB_TEMPLATE___ section.
 *   2. Asserts the OLD broken mechanisms (?key= URL, setInWindow/ConvorConfig)
 *      are GONE from the source.
 *   3. Runs the template through a stubbed GTM sandbox and asserts:
 *      - injectScript is called with `<apiBase>/widget.js` (clean, no query).
 *      - callInWindow('ConvorWidget.init', { key: slug, ... }) fires.
 *      - gtmOnSuccess is reported.
 *   4. Reconstructs the canonical snippet from the captured URL + init key
 *      and asserts it matches canonical.
 *   5. Regression guard: empty slug must NOT inject (fails safe).
 */

const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const assert = require("node:assert/strict");

const { assertSnippetMatches } = require("./assert-snippet.js");
const { makeSandbox } = require("./gtm-sandbox.js");

const TPL_PATH = join(__dirname, "..", "gtm", "template.tpl");
const API_BASE = "http://localhost:5173";
const SLUG = "acme";

/** Pull the body of the ___SANDBOXED_JS_FOR_WEB_TEMPLATE___ section. */
function extractSandboxedJs(tpl) {
  const startMarker = "___SANDBOXED_JS_FOR_WEB_TEMPLATE___";
  const endMarkers = ["___WEB_PERMISSIONS___", "___TESTS___", "___NOTES___"];
  const start = tpl.indexOf(startMarker);
  assert.ok(
    start > -1,
    "template has no ___SANDBOXED_JS_FOR_WEB_TEMPLATE___ section",
  );
  const after = tpl.indexOf("\n", start) + 1;
  let end = tpl.length;
  for (const m of endMarkers) {
    const idx = tpl.indexOf(m, after);
    if (idx > -1 && idx < end) {
      end = idx;
    }
  }
  return tpl.slice(after, end).trim();
}

async function main() {
  const tpl = readFileSync(TPL_PATH, "utf8");
  const js = extractSandboxedJs(tpl);

  // --- 1. The OLD broken delivery mechanisms must be GONE from the code. ---
  // (Strip comments first so explanatory mentions of "?key=" in prose don't
  // trip the assertions.)
  const codeOnly = js
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, "");

  assert.doesNotMatch(
    codeOnly,
    /['"`][^'"`]*widget\.js\?[^'"`]*/,
    "template must NOT build a widget.js URL with a query string (the widget ignores ?key=)",
  );
  assert.doesNotMatch(
    codeOnly,
    /setInWindow/,
    "template must NOT call setInWindow",
  );
  assert.doesNotMatch(
    codeOnly,
    /ConvorConfig/,
    "template must NOT reference ConvorConfig",
  );
  assert.match(
    codeOnly,
    /callInWindow\s*\(\s*['"]ConvorWidget\.init['"]/,
    "template must call window.ConvorWidget.init via callInWindow",
  );
  assert.match(
    codeOnly,
    /injectScript\s*\(\s*\w+\s*,\s*\w+\s*,\s*\w+/,
    "template must call injectScript(url, onSuccess, onFailure)",
  );
  console.log(
    "PASS: broken mechanisms removed (?key=, ConvorConfig) — now uses injectScript + ConvorWidget.init",
  );

  // --- 2. Run the template in the stubbed sandbox. ---
  // Simulate the page state AFTER widget.js loads: ConvorWidget.init is
  // registered. The sandbox's injectScript merges that in and fires
  // onSuccess inline, so the template's callInWindow runs in the same tick.
  let initReceived = null;
  const loadedWindowState = {
    ConvorWidget: {
      init: (opts) => {
        initReceived = opts;
      },
    },
  };
  const sandbox = makeSandbox(
    {
      orgSlug: SLUG,
      apiBase: API_BASE,
      primaryColor: "",
      position: "",
      theme: "",
    },
    loadedWindowState,
  );
  const calls = sandbox.run(js);

  // --- 3. Assert the behaviour. ---
  assert.equal(
    calls.injectScript.length,
    1,
    "expected exactly one injectScript call",
  );
  const inj = calls.injectScript[0];
  assert.equal(
    inj.url,
    `${API_BASE}/widget.js`,
    `injectScript URL must be clean canonical (got: ${inj.url})`,
  );
  assert.ok(
    !inj.url.includes("?"),
    "injectScript URL must NOT carry a query string",
  );

  const initCalls = calls.callInWindow.filter(
    (c) => c.path === "ConvorWidget.init",
  );
  assert.equal(
    initCalls.length,
    1,
    "expected exactly one ConvorWidget.init call",
  );
  const initArg = initCalls[0].args[0];
  assert.equal(initArg.key, SLUG, "init() must be passed the org slug as key");
  assert.notEqual(
    initArg.key,
    undefined,
    "init() must NOT be called with undefined key (the original bug)",
  );
  assert.ok(calls.gtmOnSuccess >= 1, "gtmOnSuccess should fire after init");
  console.log(
    `PASS: injectScript("${inj.url}") → ConvorWidget.init({ key: "${initArg.key}", … }) → gtmOnSuccess`,
  );

  // --- 4. Reconstruct the canonical snippet from the captured URL + key. ---
  // The template emits a load+init behaviour rather than HTML; the semantic
  // equivalent, as a snippet, is the canonical tag — build it from what the
  // template actually did and assert it matches canonical.
  const reconstructed = `<script src="${inj.url}" data-key="${initArg.key}" async></script>`;
  const tag = assertSnippetMatches(reconstructed, {
    apiBase: API_BASE,
    slug: SLUG,
  });
  console.log(
    `PASS: behaviour-equivalent snippet matches canonical (${tag.trim().replace(/\s+/g, " ")})`,
  );

  // --- 5. Empty-slug regression guard: must fail safe, not load keyless. ---
  const badCalls = makeSandbox(
    {
      orgSlug: "   ",
      apiBase: API_BASE,
      primaryColor: "",
      position: "",
      theme: "",
    },
    loadedWindowState,
  ).run(js);
  assert.equal(
    badCalls.injectScript.length,
    0,
    "empty slug must NOT inject the widget script",
  );
  assert.ok(badCalls.gtmOnFailure >= 1, "empty slug must report gtmOnFailure");
  console.log("PASS: empty slug → no inject + gtmOnFailure (fails safe)");

  // initReceived sanity (the widget really got the key).
  assert.deepEqual(initReceived?.key, SLUG);

  console.log("\n=== gtm: PASS ===");
}

main().catch((err) => {
  console.error("FAIL: gtm test errored");
  console.error(err?.stack ? err.stack : err);
  process.exit(1);
});
