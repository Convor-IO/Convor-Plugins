const assert = require("node:assert/strict");
const { assertSnippetMatches } = require("./assert-snippet.js");

const canonical =
  '<script src="https://cdn.convor.io/widget.js" data-key="acme" async></script>';

assert.equal(
  assertSnippetMatches(canonical, { slug: "acme" }),
  canonical,
  "canonical opening-tag attributes should pass",
);

assert.throws(
  () =>
    assertSnippetMatches(
      '<script src="https://cdn.convor.io/widget.js">const fake = \'data-key="acme" async\';</script>',
      { slug: "acme" },
    ),
  /data-key mismatch/,
  "attributes written in the script body must not satisfy the contract",
);

assert.throws(
  () =>
    assertSnippetMatches(
      '<script src="https://cdn.convor.io/widget.js" data-key="acme">async function boot() {}</script>',
      { slug: "acme" },
    ),
  /missing the 'async' attribute/,
  "the async keyword in the script body must not satisfy the contract",
);

console.log("PASS: snippet assertions inspect opening-tag attributes only");
