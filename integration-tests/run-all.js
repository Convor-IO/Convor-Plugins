/**
 * Run every Convor plugin integration test sequentially.
 *
 * Each <name>.test.js is a standalone script (prints PASS/FAIL, exits non-zero
 * on error). This runner spawns them one at a time so a crash in one doesn't
 * abort the others, and reports a final tally. Exit non-zero if any failed.
 */

const {spawnSync} = require("node:child_process");
const {join} = require("node:path");

// All integration-test suites. Each entry is `<script-name>` (without .js);
// the file is `<script-name>.test.js` in this directory.
const tests = [
  "assert-snippet",
  // PHP platforms (server-rendered snippets)
  "wordpress",
  "prestashop",
  "drupal",
  "joomla",
  "magento",
  "opencart",
  // App-embed / server-app platforms
  "bigcommerce",
  "ecwid",
  // SDK + bridges
  // (widget-sdk / widget-react / segment ship their own vitest suites under
  // their packages — not run here.)
  // Tag managers + extensions + builders
  "gtm",
  "browser-extension",
  "builders",
];

let failed = 0;
for (const name of tests) {
  console.log(`\n=== ${name} ===`);
  const res = spawnSync("node", [join(__dirname, `${name}.test.js`)], {
    stdio: "inherit",
  });
  if (res.status !== 0) {
    failed++;
    console.error(`✗ ${name} FAILED (exit ${res.status})`);
  } else {
    console.log(`✓ ${name} PASSED`);
  }
}

console.log(
  `\n=== summary: ${tests.length - failed}/${tests.length} passed ===`
);
process.exit(failed === 0 ? 0 : 1);
