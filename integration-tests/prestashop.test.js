/**
 * PrestaShop integration test.
 *
 * Starts a PHP built-in server running `_ps-harness.php` (which loads the
 * real `prestashop/convor.php` module with minimal PrestaShop shims: Module,
 * Configuration, Context, smarty, Tools), calls hookDisplayHeader([]), and
 * renders the Smarty header.tpl with the assigned vars. Asserts the emitted
 * HTML matches the canonical Convor widget snippet.
 */

const path = require("node:path");
const {assertSnippetMatches} = require("./assert-snippet");
const {startPhpServer, fetchText} = require("./_helpers");

const PORT = 8102;
const API_BASE = "http://localhost:5173";
const SLUG = "acme";

async function main() {
  const server = await startPhpServer({
    port: PORT,
    harness: path.join(__dirname, "_ps-harness.php"),
    docroot: __dirname,
    env: {CONVOR_ORG_SLUG: SLUG, CONVOR_API_BASE: API_BASE},
  });

  try {
    const {status, text} = await fetchText(`http://127.0.0.1:${PORT}/`);
    if (status !== 200) {
      throw new Error(`HTTP ${status} from harness`);
    }

    console.log("--- PrestaShop rendered output ---");
    console.log(JSON.stringify(text));
    console.log("----------------------------------");

    const matched = assertSnippetMatches(text, {
      apiBase: API_BASE,
      slug: SLUG,
    });
    console.log("PASS: prestashop snippet matches canonical form");
    console.log("Matched tag:", matched);
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error("FAIL: prestashop test errored");
  console.error(err?.stack ? err.stack : err);
  process.exit(1);
});
