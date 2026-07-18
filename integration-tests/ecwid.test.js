const {spawn} = require("node:child_process");
const {existsSync, mkdtempSync, readFileSync} = require("node:fs");
const {tmpdir} = require("node:os");
const {join} = require("node:path");
const http = require("node:http");
const net = require("node:net");
const {JSDOM} = require("jsdom");

const {assertSnippetMatches} = require("./assert-snippet.js");

const REPO_ROOT = join(__dirname, "..");
const ECWID_DIR = join(REPO_ROOT, "ecwid");
const API_BASE = "http://localhost:5173";
const SLUG = "acme";
const APP_ID = "test-ecwid-app-id";

function fail(msg) {
  console.error(`\n❌ FAIL: ${msg}`);
  process.exitCode = 1;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function waitForUp(port, timeoutMs = 8000) {
  const start = Date.now();
  return new Promise(function retry(resolve, reject) {
    const req = http.get(
      {host: "127.0.0.1", port, path: "/health", timeout: 1000},
      () => resolve()
    );
    req.on("error", () => {
      if (Date.now() - start > timeoutMs) {
        reject(
          new Error(`server on :${port} did not come up within ${timeoutMs}ms`)
        );
        return;
      }
      setTimeout(() => retry(resolve, reject), 150);
    });
    req.on("timeout", () => {
      req.destroy();
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`server on :${port} timed out within ${timeoutMs}ms`));
        return;
      }
      setTimeout(() => retry(resolve, reject), 150);
    });
  });
}

function get(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      {host: "127.0.0.1", port, path, timeout: 5000},
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () =>
          resolve({status: res.statusCode, headers: res.headers, body})
        );
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("request timeout")));
  });
}

// ---------------------------------------------------------------------------
// 1. JSDOM test of the storefront loader.
// ---------------------------------------------------------------------------

/**
 * Reproduce what the Fastify /storefront.js handler does: read the source
 * file and bake in the appId by replacing the first occurrence of the
 * placeholder with JSON.stringify(appId). This mirrors src/index.ts exactly.
 */
function buildServedStorefrontJs(appId) {
  const src = readFileSync(join(ECWID_DIR, "public/storefront.js"), "utf8");
  return src.replace("window.__CONVOR_ECWID_APP_ID__", JSON.stringify(appId));
}

function runStorefrontInJsdom(appId, publicConfig) {
  const js = buildServedStorefrontJs(appId);
  const dom = new JSDOM(
    "<!DOCTYPE html><html><head></head><body></body></html>",
    {
      runScripts: "outside-only",
      url: "https://store.example.com/",
    }
  );
  const {window} = dom;

  // Stub the Ecwid global the loader reads from.
  window.Ecwid = {
    getAppPublicConfig: (_id) => publicConfig,
  };
  // __CONVOR_ECWID_APP_ID__ is no longer referenced after the bake-in (the
  // served JS has the literal appId string), but set it for fidelity.
  window.__CONVOR_ECWID_APP_ID__ = appId;

  // storefront.js registers a DOMContentLoaded listener (the doc starts in
  // "loading" under JSDOM). Run the script, then fire the event so bootstrap()
  // actually executes and injects the widget script.
  window.eval(js);
  window.document.dispatchEvent(
    new window.Event("DOMContentLoaded", {bubbles: true})
  );

  // Find the Convor widget script the loader injected into <head>.
  const scripts = Array.from(window.document.querySelectorAll("script"));
  const convor = scripts.find((s) =>
    /\/widget\.js$/.test(s.getAttribute("src") || "")
  );
  if (!convor) return null;

  // Reconstruct the canonical tag text from the element's attributes + the
  // `async` IDL property. JSDOM (per the HTML spec) does not reflect the
  // `async` IDL property into the content attribute for dynamically-created
  // scripts, so `outerHTML` omits the `async` token even though the loader
  // set `s.async = true`. We render the literal attribute here so the shared
  // snippet-shape harness can assert the canonical form exactly.
  const src = convor.getAttribute("src");
  const dataKey = convor.getAttribute("data-key");
  const asyncAttr = convor.async ? " async" : "";
  return `<script src="${src}" data-key="${dataKey}"${asyncAttr}></script>`;
}

// ---------------------------------------------------------------------------
// 2. Boot the Fastify server.
// ---------------------------------------------------------------------------

function bootServer(port) {
  const env = {
    ...process.env,
    PORT: String(port),
    ECWID_CLIENT_ID: "test-client-id",
    ECWID_CLIENT_SECRET: "test-client-secret",
    ECWID_REDIRECT_URL: "https://convor-ecwid.test/install",
    ECWID_APP_ID: APP_ID,
    DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:1/convor_plugins",
    // Quiet logs in test output.
    FASTIFY_LOG_LEVEL: "error",
  };
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["tsx", "src/index.ts"], {
      cwd: ECWID_DIR,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stdout.on("data", (d) => {
      stderr += d;
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      reject(new Error(`server exited early with code ${code}\n${stderr}`));
    });
    resolve({
      child,
      stderr: () => stderr,
      stop: () =>
        new Promise((res) => {
          child.removeAllListeners("close");
          child.kill("SIGTERM");
          child.on("close", () => res());
          setTimeout(() => {
            try {
              child.kill("SIGKILL");
            } catch {
              /* ignore */
            }
            res();
          }, 3000);
        }),
    });
  });
}

// ---------------------------------------------------------------------------

async function main() {
  if (!existsSync(join(ECWID_DIR, "node_modules"))) {
    fail(`ecwid/node_modules missing — run "npm install" in ${ECWID_DIR}`);
    return;
  }

  // --- 1. Storefront loader (JSDOM) ---
  const publicConfig = JSON.stringify({slug: SLUG, apiBase: API_BASE});
  let injectedTag;
  try {
    injectedTag = runStorefrontInJsdom(APP_ID, publicConfig);
  } catch (err) {
    fail(`storefront JSDOM test failed: ${err.message}`);
    return;
  }
  if (!injectedTag) {
    fail("storefront loader did not inject a Convor widget <script> tag");
    return;
  }
  try {
    assertSnippetMatches(injectedTag, {apiBase: API_BASE, slug: SLUG});
  } catch (err) {
    fail(`storefront snippet assertion failed: ${err.message}`);
    return;
  }
  console.log(`✅ PASS ecwid/storefront.js inject -> ${injectedTag}`);

  // --- 2. Boot + HTTP smoke ---
  const port = await freePort();
  // Ensure a writable DATA_DIR exists (the app defaults to ./data).
  mkdtempSync(join(tmpdir(), "convor-ecwid-"));

  let server;
  try {
    server = await bootServer(port);
    await waitForUp(port);
  } catch (err) {
    fail(`server boot failed: ${err.message}`);
    if (server) await server.stop();
    return;
  }

  let allOk = true;
  try {
    const health = await get(port, "/health");
    if (health.status !== 200) {
      fail(`GET /health -> expected 200, got ${health.status}`);
      allOk = false;
    } else {
      let parsed;
      try {
        parsed = JSON.parse(health.body);
      } catch {
        /* ignore */
      }
      if (!parsed || parsed.ok !== true) {
        fail(`GET /health -> 200 but body not {"ok":true}: ${health.body}`);
        allOk = false;
      } else {
        console.log(
          `✅ PASS ecwid GET /health -> HTTP ${health.status} ${health.body.trim()}`
        );
      }
    }

    const sf = await get(port, "/storefront.js");
    if (sf.status !== 200) {
      fail(`GET /storefront.js -> expected 200, got ${sf.status}`);
      allOk = false;
    } else if (!/widget\.js/.test(sf.body)) {
      fail("GET /storefront.js -> 200 but body does not reference widget.js");
      allOk = false;
    } else if (!sf.body.includes(JSON.stringify(APP_ID))) {
      fail("GET /storefront.js -> 200 but appId not baked into the JS body");
      allOk = false;
    } else {
      console.log(
        `✅ PASS ecwid GET /storefront.js -> HTTP ${sf.status} (${sf.headers["content-type"]}, ${sf.body.length} bytes)`
      );
    }

    const root = await get(port, "/");
    if (root.status !== 200) {
      fail(`GET / -> expected 200, got ${root.status}`);
      allOk = false;
    } else if (!/Convor/i.test(root.body)) {
      fail(`GET / -> 200 but body does not mention "Convor"`);
      allOk = false;
    } else {
      console.log(`✅ PASS ecwid GET / -> HTTP ${root.status} (install page)`);
    }
  } finally {
    await server.stop();
  }

  if (allOk) {
    console.log("\n🎉 ecwid: all integration checks passed.");
  } else {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  fail(`unhandled error: ${err?.stack ? err.stack : err}`);
});
