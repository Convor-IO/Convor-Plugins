/**
 * Local widget origin server for E2E tests.
 *
 * Serves the built widget files (dist/widget.js, dist/widget-iframe.html,
 * dist/widget-iframe.js, dist/assets/*) from :5173 AND proxies /api/* and
 * /connection/* to the SaaS API server on :3000, so the widget iframe can
 * reach the backend same-origin.
 *
 * In production this is what cdn.convor.io does: serve widget.js + proxy
 * /api to the SaaS server.
 *
 * Usage:
 *   cd saas/apps/widget && pnpm build
 *   node plugins/integration-tests/fixtures/widget-proxy.js
 */
const { createServer } = require("node:http");
const { createReadStream, statSync } = require("node:fs");
const { extname, join, normalize } = require("node:path");
const { createProxyServer } = require("http-proxy");

const WIDGET_DIST =
  process.env.WIDGET_DIST ?? join(__dirname, "../../../saas/apps/widget/dist");
const PORT = Number(process.env.WIDGET_PORT ?? 5173);
const API_TARGET = process.env.API_TARGET ?? "http://localhost:3000";

const proxy = createProxyServer({ target: API_TARGET, changeOrigin: true });
proxy.on("error", (err, _req, res) => {
  console.error("[proxy] error:", err.message);
  if (res && !res.headersSent) {
    res.writeHead(502);
    res.end(`proxy error: ${err.message}`);
  }
});

const MIME = {
  ".js": "text/javascript",
  ".html": "text/html",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".map": "application/json",
};

function serveStatic(req, res, urlPath) {
  let rel = normalize(urlPath).replace(/^\/+/, "");
  if (rel === "") rel = "widget-iframe.html";
  const abs = join(WIDGET_DIST, rel);
  try {
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      res.writeHead(403);
      res.end("directory");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[extname(abs)] ?? "application/octet-stream",
      "Access-Control-Allow-Origin": "*",
    });
    createReadStream(abs).pipe(res);
  } catch {
    res.writeHead(404);
    res.end(`not found: ${rel}`);
  }
}

const srv = createServer((req, res) => {
  const url = req.url ?? "/";
  const path = url.split("?")[0];

  if (path.startsWith("/api/") || path.startsWith("/connection/")) {
    proxy.web(req, res);
    return;
  }
  serveStatic(req, res, path);
});

srv.on("upgrade", (req, socket, head) => {
  proxy.ws(req, socket, head);
});

srv.listen(PORT, "0.0.0.0", () => {
  console.log(
    `[widget-proxy] serving ${WIDGET_DIST} on :${PORT}, proxying /api + /connection → ${API_TARGET}`,
  );
});
