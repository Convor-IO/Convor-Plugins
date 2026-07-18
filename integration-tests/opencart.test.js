/**
 * OpenCart integration test.
 *
 * OpenCart 4's Catalog\Controller\Module\Convor::injectScript is an event
 * listener on `catalog/view/common/header/after` that receives the rendered
 * header HTML by reference and inserts the Convor <script> tag before </head>
 * (or appends it when no </head> is present). We can't boot OpenCart, so
 * _opencart-harness.php extracts the method body and evaluates it inside a
 * stubbed controller with a fake $this->config.
 *
 * This test fetches the harness output for both the append branch (no seed)
 * and the </head>-insertion branch (seeded header HTML) and asserts each
 * contains the canonical snippet. For the seeded case it also verifies the
 * tag sits BEFORE </head>.
 */

const {join} = require("node:path");
const assert = require("node:assert/strict");

const {assertSnippetMatches} = require("./assert-snippet.js");
const {startPhpServer, fetchText} = require("./_helpers.js");

const PORT = 8104;
const API_BASE = "http://localhost:5173";
const SLUG = "acme";

async function main() {
  const server = await startPhpServer({
    port: PORT,
    harness: join(__dirname, "_opencart-harness.php"),
    docroot: __dirname,
    env: {CONVOR_ORG_SLUG: SLUG, CONVOR_API_BASE: API_BASE},
  });

  try {
    // --- Case 1: empty $output → tag appended (bare canonical tag). ---
    const appended = await fetchText(`http://127.0.0.1:${PORT}/`);
    assert.equal(appended.status, 200, `HTTP ${appended.status} (append)`);

    console.log("--- OpenCart injectScript output (append) ---");
    console.log(JSON.stringify(appended.text));
    console.log("---------------------------------------------");

    const expected = `<script src="${API_BASE}/widget.js" data-key="${SLUG}" async></script>`;
    assert.ok(
      appended.text.includes(expected),
      `append branch: missing exact canonical tag.\nGot: ${appended.text}`
    );
    const tag1 = assertSnippetMatches(appended.text, {
      apiBase: API_BASE,
      slug: SLUG,
    });
    console.log(
      `PASS: opencart [append] emitted canonical tag (${tag1.trim().replace(/\s+/g, " ")})`
    );

    // --- Case 2: header HTML present → tag inserted before </head>. ---
    const headerHtml =
      '<html><head><title>x</title><link rel="stylesheet" href="/a.css"></head><body></body></html>';
    const inserted = await fetchText(
      `http://127.0.0.1:${PORT}/?seed=${encodeURIComponent(headerHtml)}`
    );
    assert.equal(inserted.status, 200, `HTTP ${inserted.status} (</head>)`);

    const tag2 = assertSnippetMatches(inserted.text, {
      apiBase: API_BASE,
      slug: SLUG,
    });
    const tagPos = inserted.text.indexOf(tag2.trim());
    const headPos = inserted.text.toLowerCase().indexOf("</head>");
    assert.ok(
      tagPos > -1 && headPos > -1 && tagPos < headPos,
      "</head> branch: tag was not inserted before </head>"
    );
    console.log(
      `PASS: opencart [</head>] tag inserted before </head> at offset ${tagPos}`
    );

    console.log("\n=== opencart: PASS ===");
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error("FAIL: opencart test errored");
  console.error(err?.stack ? err.stack : err);
  process.exit(1);
});
