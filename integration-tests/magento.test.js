/**
 * Magento integration test.
 *
 * The Magento module emits the Convor widget <script> tag into the storefront
 * <head> via view/frontend/templates/widget_script.phtml (backed by
 * Block/WidgetScript, which reads system config). It also ships a CSP
 * whitelist (etc/csp_whitelist.xml) that must let the widget's hosts through
 * Magento's default strict CSP.
 *
 * We can't boot Magento, so _magento-harness.php stubs $escaper (passthrough —
 * test values are safe) and $block (getScriptUrl/getOrgSlug from env) and
 * requires the REAL .phtml, capturing its output. This test fetches that
 * output over `php -S` and asserts it matches canonical. It then fetches the
 * parsed CSP whitelist and asserts script-src whitelists cdn.convor.io, and
 * reports on connect-src (the WS/API host — a common omission).
 */

const { join } = require("node:path");
const assert = require("node:assert/strict");

const { assertSnippetMatches } = require("./assert-snippet.js");
const { startPhpServer, fetchText } = require("./_helpers.js");

const PORT = 8103;
const API_BASE = "http://localhost:5173";
const SLUG = "acme";

async function main() {
  const server = await startPhpServer({
    port: PORT,
    harness: join(__dirname, "_magento-harness.php"),
    docroot: __dirname,
    env: { CONVOR_ORG_SLUG: SLUG, CONVOR_API_BASE: API_BASE },
  });

  try {
    // --- 1. Rendered .phtml must match canonical snippet. ---
    const { status, text } = await fetchText(`http://127.0.0.1:${PORT}/`);
    assert.equal(status, 200, `HTTP ${status} from harness`);

    console.log("--- Magento widget_script.phtml rendered output ---");
    console.log(JSON.stringify(text));
    console.log("---------------------------------------------------");

    const tag = assertSnippetMatches(text, { apiBase: API_BASE, slug: SLUG });
    console.log(
      `PASS: magento phtml matches canonical (${tag.trim().replace(/\s+/g, " ")})`,
    );

    // --- 2. CSP whitelist: script-src MUST whitelist cdn.convor.io. ---
    const cspRes = await fetchText(`http://127.0.0.1:${PORT}/csp`);
    assert.equal(cspRes.status, 200, `HTTP ${cspRes.status} from /csp`);
    const policies = JSON.parse(cspRes.text);

    const scriptSrc = policies["script-src"] || [];
    assert.ok(
      scriptSrc.some((h) => h.includes("cdn.convor.io")),
      `CSP script-src does not whitelist cdn.convor.io (got: ${scriptSrc.join(", ")})`,
    );
    console.log("PASS: magento CSP script-src whitelists cdn.convor.io");

    // --- 3. connect-src must include the REST API host (api.convor.io) so
    // the widget's fetchRemoteConfig / visitor-token XHRs aren't blocked. ---
    const connectSrc = policies["connect-src"] || [];
    const hasApi = connectSrc.some((h) => h.includes("api.convor.io"));
    const hasCdn = connectSrc.some((h) => h.includes("cdn.convor.io"));
    assert.ok(
      hasApi,
      "CSP connect-src is missing api.convor.io — widget REST calls (config, visitor-token) would be CSP-blocked",
    );
    console.log(
      `      CSP connect-src = [${connectSrc.join(", ")}] → api.convor.io ${hasApi ? "present" : "MISSING"}, cdn.convor.io ${hasCdn ? "present" : "MISSING"}`,
    );

    // NOTE on WebSocket: the shipped csp_whitelist.xml has an img-src policy
    // whose comment says "WebSocket (Centrifugo)" — that label is wrong
    // (img-src governs images, not WS). connect-src only lists the two
    // https:// hosts, so a production wss:// Centrifugo connect would be
    // blocked. Reported as a finding, not fatal for snippet emission.
    const wsHost = connectSrc.find((h) => h.startsWith("ws"));
    if (!wsHost) {
      console.log(
        "      NOTE: connect-src has no wss:// host — live Centrifugo WebSocket (realtime chat) would be CSP-blocked in production. (The img-src policy's comment wrongly claims it covers WebSocket.)",
      );
    }

    console.log("\n=== magento: PASS ===");
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error("FAIL: magento test errored");
  console.error(err?.stack ? err.stack : err);
  process.exit(1);
});
