/**
 * Builders integration test.
 *
 * Each website-builder package (webflow, framer, squarespace, duda) ships a
 * `snippet.html` the merchant pastes into their builder's "custom code" box,
 * plus a README documenting the same snippet. Both must carry the canonical
 * Convor widget tag:
 *
 *   <script src="<apiBase>/widget.js" data-key="<slug>" async></script>
 *
 * The snippet ships with a YOUR_ORG_SLUG placeholder; we substitute `acme`
 * and assert the result matches canonical. The README keeps the placeholder
 * (that's what the merchant copies) so we assert it matches with slug
 * `YOUR_ORG_SLUG`.
 */

const {readFileSync} = require("node:fs");
const {join} = require("node:path");
const assert = require("node:assert/strict");

const {assertSnippetMatches} = require("./assert-snippet.js");

const REPO_ROOT = join(__dirname, "..");
const BUILDERS_DIR = join(REPO_ROOT, "builders");
const BUILDERS = ["webflow", "framer", "squarespace", "duda"];

const API_BASE = "https://cdn.convor.io";
const SLUG = "acme";

async function main() {
  for (const builder of BUILDERS) {
    const dir = join(BUILDERS_DIR, builder);

    // snippet.html — substitute the placeholder and assert canonical form.
    const snippetPath = join(dir, "snippet.html");
    const raw = readFileSync(snippetPath, "utf8");
    const substituted = raw.replaceAll("YOUR_ORG_SLUG", SLUG);
    const tag = assertSnippetMatches(substituted, {
      apiBase: API_BASE,
      slug: SLUG,
    });
    assert.ok(tag, `${builder}: assertSnippetMatches returned no tag`);

    // README must document the canonical snippet (with the placeholder).
    const readmePath = join(dir, "README.md");
    const readme = readFileSync(readmePath, "utf8");
    assertSnippetMatches(readme, {
      apiBase: API_BASE,
      slug: "YOUR_ORG_SLUG",
    });

    console.log(
      `PASS: ${builder} snippet.html + README match canonical (${tag.trim().replace(/\s+/g, " ")})`
    );
  }

  console.log(
    `\n=== builders: ${BUILDERS.length}/${BUILDERS.length} passed ===`
  );
}

main().catch((err) => {
  console.error("FAIL: builders test errored");
  console.error(err?.stack ? err.stack : err);
  process.exit(1);
});
