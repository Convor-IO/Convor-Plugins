const assert = require("node:assert/strict");
const path = require("node:path");
const { assertSnippetMatches } = require("./assert-snippet");
const { startPhpServer, fetchText } = require("./_helpers");

const PORT = 8101;
const API_BASE = "http://localhost:5173";
const KEY = "convor_wpk_" + "ab".repeat(32);
const CHALLENGE = "verification-example_123";

async function main() {
  const server = await startPhpServer({
    port: PORT,
    harness: path.join(__dirname, "_wp-harness.php"),
    docroot: __dirname,
    env: { CONVOR_WIDGET_KEY: KEY, CONVOR_API_BASE: API_BASE },
  });
  const get = async (query = "") => {
    const result = await fetchText(`http://127.0.0.1:${PORT}/?${query}`);
    assert.equal(result.status, 200);
    return result.text;
  };

  try {
    assertSnippetMatches(await get(), { apiBase: API_BASE, slug: KEY });
    assert.match(
      assertSnippetMatches(await get(`challenge=${CHALLENGE}`), {
        apiBase: API_BASE,
        slug: KEY,
      }),
      /data-convor-verification="verification-example_123"/,
    );
    for (const query of [
      "key=",
      "key=old-slug",
      "key=convor_wpk_invalid",
      "disabled=1",
      "consent=1",
      "suppress=1",
      "consent=1&allow=1&suppress=1",
    ]) {
      assert.equal((await get(query)).trim(), "", query);
    }
    assertSnippetMatches(await get("consent=1&allow=1"), {
      apiBase: API_BASE,
      slug: KEY,
    });
    // Existing pre-release installations sometimes already stored a current
    // public widget key in the old org_slug field. Preserve that installation
    // on update, but do not trust the obsolete arbitrary CDN setting.
    assertSnippetMatches(await get(`legacy=${KEY}`), {
      apiBase: API_BASE,
      slug: KEY,
    });
    assert.equal((await get("legacy=old-slug")).trim(), "");
    const unchanged = JSON.parse(await get("sanitize=bad"));
    assert.equal(
      unchanged.widget_key,
      KEY,
      "invalid input must preserve prior key",
    );
    const changed = "convor_wpk_" + "cd".repeat(32);
    assert.equal(
      JSON.parse(await get(`sanitize=${changed}`)).widget_key,
      changed,
    );
    console.log(
      "PASS: key, verification, consent, disable and validation contracts",
    );
  } finally {
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
