/**
 * Builders integration test.
 *
 * Each website-builder package (webflow, framer, squarespace, duda, sky-shop) ships a
 * `snippet.html` the merchant pastes into their builder's "custom code" box.
 * The shipped snippet must carry the canonical Convor widget tag:
 *
 *   <script src="<apiBase>/widget.js" data-key="<public site key>" async></script>
 *
 * The snippet ships with a YOUR_WIDGET_KEY placeholder; we substitute a
 * per-website public key and assert the customer-facing artifact matches the embed
 * contract. Documentation prose is intentionally not duplicated into tests.
 */

const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const assert = require("node:assert/strict");

const { assertSnippetMatches } = require("./assert-snippet.js");

const REPO_ROOT = join(__dirname, "..");
const BUILDERS_DIR = join(REPO_ROOT, "builders");
const BUILDERS = ["webflow", "framer", "squarespace", "duda", "sky-shop"];

const API_BASE = "https://cdn.convor.io";
const WIDGET_KEY =
  "convor_wpk_testsite00000000000000000000000000000000000000000000";

async function main() {
  for (const builder of BUILDERS) {
    const dir = join(BUILDERS_DIR, builder);

    // snippet.html — substitute the placeholder and assert canonical form.
    const snippetPath = join(dir, "snippet.html");
    const raw = readFileSync(snippetPath, "utf8");
    assert.ok(
      raw.includes("YOUR_WIDGET_KEY"),
      `${builder}: must request a public site key`,
    );
    assert.ok(
      !raw.includes("YOUR_ORG_SLUG"),
      `${builder}: must not request an org slug`,
    );
    const substituted = raw.replaceAll("YOUR_WIDGET_KEY", WIDGET_KEY);
    const tag = assertSnippetMatches(substituted, {
      apiBase: API_BASE,
      slug: WIDGET_KEY,
    });
    assert.ok(tag, `${builder}: assertSnippetMatches returned no tag`);
    assert.equal(
      (substituted.match(/<script\b/gi) ?? []).length,
      1,
      `${builder}: must load the widget exactly once`,
    );
    assert.ok(
      !/data-(?:api|token|secret|locale)=/i.test(tag),
      `${builder}: must not expose a private key or override visitor locale`,
    );

    console.log(
      `PASS: ${builder} snippet.html matches canonical (${tag.trim().replace(/\s+/g, " ")})`,
    );
  }

  console.log(
    `\n=== builders: ${BUILDERS.length}/${BUILDERS.length} passed ===`,
  );
}

main().catch((err) => {
  console.error("FAIL: builders test errored");
  console.error(err?.stack ? err.stack : err);
  process.exit(1);
});
