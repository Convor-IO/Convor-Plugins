/**
 * Browser extension integration test.
 *
 * Can't load the unpacked extension into Chrome here, so this does static +
 * structural + DOM-level validation:
 *
 *   1. manifest.json — assert MV3, service_worker background, action popup,
 *      and permissions include scripting + storage.
 *   2. content-script source — assert it builds `<apiBase>/widget.js` and
 *      sets data-key (NOT ?key= / window global).
 *   3. Build (pnpm build) and confirm dist/ files exist.
 *   4. Load dist/content-script.js in jsdom, call injectConvorWidget, and
 *      assert the injected <script> tag matches canonical — plus idempotency.
 *
 * The content-script is bundled as an IIFE that attaches its export to an
 * `exports` object literal. We evaluate it with a captured exports bag and a
 * jsdom document so the closure picks up the right `document`.
 */

const {existsSync, readFileSync} = require("node:fs");
const {join} = require("node:path");
const {execFileSync} = require("node:child_process");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const {JSDOM} = require("jsdom");

const {assertSnippetMatches} = require("./assert-snippet.js");

const REPO_ROOT = join(__dirname, "..");
const EXT_DIR = join(REPO_ROOT, "browser-extension");
const DIST_DIR = join(EXT_DIR, "dist");

const API_BASE = "http://localhost:5173";
const SLUG = "acme";

async function main() {
  // --- 1. manifest.json structure ---
  const manifest = JSON.parse(
    readFileSync(join(EXT_DIR, "manifest.json"), "utf8")
  );
  assert.equal(
    manifest.manifest_version,
    3,
    "manifest_version must be 3 (MV3)"
  );
  assert.ok(
    manifest.background?.service_worker,
    "must declare a service_worker background"
  );
  assert.ok(
    manifest.action?.default_popup,
    "must declare action.default_popup"
  );
  const perms = manifest.permissions || [];
  for (const required of ["scripting", "storage"]) {
    assert.ok(
      perms.includes(required),
      `permissions must include ${required} (got: ${perms.join(", ")})`
    );
  }
  console.log(
    `PASS: manifest is MV3, has service_worker + default_popup, permissions [${perms.join(", ")}]`
  );

  // --- 2. content-script source inspection ---
  const src = readFileSync(join(EXT_DIR, "src", "content-script.ts"), "utf8");
  assert.match(
    src,
    /`\$\{base\}\/widget\.js`/,
    "content-script must build <apiBase>/widget.js"
  );
  assert.match(
    src,
    /setAttribute\(\s*["']data-key["']/,
    "content-script must set the data-key attribute"
  );
  assert.doesNotMatch(
    src,
    /injectConvorWidget[^;]*\?key=/,
    "content-script must not pass ?key= on the widget URL"
  );
  console.log(
    "PASS: content-script builds <apiBase>/widget.js and sets data-key"
  );

  // --- 3. build dist/ ---
  execFileSync("pnpm", ["build"], {
    cwd: EXT_DIR,
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const f of [
    "background.js",
    "content-script.js",
    "popup.js",
    "options.js",
  ]) {
    assert.ok(existsSync(join(DIST_DIR, f)), `build did not produce dist/${f}`);
  }
  console.log(
    "PASS: pnpm build produced dist/{background,content-script,popup,options}.js"
  );

  // --- 4. jsdom DOM test ---
  const built = readFileSync(join(DIST_DIR, "content-script.js"), "utf8");
  const dom = new JSDOM(
    "<!DOCTYPE html><html><head></head><body></body></html>",
    {
      url: "https://example.com/",
    }
  );

  // The IIFE is `(function(exports){...body...})(<arg>)`; tsup emits the
  // invocation as `({})`. Swap that argument for a reference to a global we
  // seed, so the bundle attaches its exports onto it and we can read them
  // back. We don't touch the body — that's the real shipped code.
  const exposed = {};
  const sandbox = {
    document: dom.window.document,
    console,
    __convor_exports: exposed,
  };
  const patched = built.replace(
    /\}\)\(\s*\{\s*\}\s*\)\s*;?\s*$/,
    "})(globalThis.__convor_exports);"
  );
  assert.ok(
    patched !== built,
    "could not patch IIFE invocation — bundle shape changed"
  );
  vm.runInNewContext(patched, sandbox);
  assert.strictEqual(
    typeof exposed.injectConvorWidget,
    "function",
    "built content-script must export injectConvorWidget"
  );

  // Inject using the host page's document, exactly as
  // chrome.scripting.executeScript would in the page's main world.
  const added = exposed.injectConvorWidget(API_BASE, SLUG);
  assert.strictEqual(
    added,
    true,
    "injectConvorWidget should report it added the tag"
  );

  const doc = dom.window.document;
  const injected = doc.head.innerHTML;
  const tag = assertSnippetMatches(injected, {apiBase: API_BASE, slug: SLUG});

  // Verify the tag was appended to <head> with the right attrs.
  const scriptEl = doc.head.querySelector("script[data-key]");
  assert.ok(scriptEl, "no <script data-key> element in <head>");
  assert.equal(scriptEl.getAttribute("src"), `${API_BASE}/widget.js`);
  assert.equal(scriptEl.getAttribute("data-key"), SLUG);
  assert.ok(
    scriptEl.hasAttribute("async"),
    "injected script must carry the async attribute"
  );

  // Idempotency: a second call must NOT add a duplicate.
  const addedAgain = exposed.injectConvorWidget(API_BASE, SLUG);
  assert.strictEqual(addedAgain, false, "second inject should be a no-op");
  assert.equal(
    doc.head.querySelectorAll("script[data-key]").length,
    1,
    "duplicate script tag was added"
  );

  console.log(
    `PASS: jsdom inject produced canonical tag (${tag.trim().replace(/\s+/g, " ")}) + idempotent`
  );

  console.log("\n=== browser-extension: PASS ===");
}

main().catch((err) => {
  console.error("FAIL: browser-extension test errored");
  console.error(err?.stack ? err.stack : err);
  process.exit(1);
});
