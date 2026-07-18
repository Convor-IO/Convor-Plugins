/**
 * Joomla integration test.
 *
 * Starts a PHP built-in server running `_joomla-harness.php` (which loads the
 * real `joomla/convor.php` plugin with minimal Joomla shims: CMSPlugin,
 * Factory, CMSApplicationInterface, WebAssetManager, Registry), constructs a
 * plugin instance with stub params/app/document, invokes onBeforeCompileHead(),
 * and reconstructs the canonical <script> tag from the WebAssetManager calls
 * (or the addCustomTag fallback). Asserts the emitted HTML matches the
 * canonical Convor widget snippet.
 */

const path = require("node:path");
const {assertSnippetMatches} = require("./assert-snippet");
const {startPhpServer, fetchText} = require("./_helpers");

const PORT = 8104;
const API_BASE = "http://localhost:5173";
const SLUG = "acme";

async function main() {
  const server = await startPhpServer({
    port: PORT,
    harness: path.join(__dirname, "_joomla-harness.php"),
    docroot: __dirname,
    env: {
      CONVOR_ORG_SLUG: SLUG,
      CONVOR_API_BASE: API_BASE,
      CONVOR_ENABLED: "1",
    },
  });

  try {
    const {status, text} = await fetchText(`http://127.0.0.1:${PORT}/`);
    if (status !== 200) {
      throw new Error(`HTTP ${status} from harness`);
    }

    console.log("--- Joomla rendered output ---");
    console.log(JSON.stringify(text));
    console.log("------------------------------");

    const matched = assertSnippetMatches(text, {
      apiBase: API_BASE,
      slug: SLUG,
    });
    console.log("PASS: joomla snippet matches canonical form");
    console.log("Matched tag:", matched);
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error("FAIL: joomla test errored");
  console.error(err?.stack ? err.stack : err);
  process.exit(1);
});
