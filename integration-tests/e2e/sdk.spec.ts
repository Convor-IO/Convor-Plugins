import { readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { extname, join, resolve } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Real-browser E2E for @convor/widget-sdk against the real built widget.
 *
 * Serves a static HTML harness that imports the SDK's ESM bundle and calls
 * initConvor({slug, apiBase}) pointing at the locally-built widget
 * (served by `vite preview` on :5173). Asserts the SDK injects the canonical
 * script tag, the loader executes, and the trigger-button iframe mounts.
 *
 * Prereqs:
 *   - packages/widget-sdk built (`pnpm --filter @convor/widget-sdk build`)
 *     so dist/index.js (ESM) exists.
 *   - The widget built + served on http://localhost:5173
 *     (cd saas/apps/widget && pnpm build && pnpm exec vite preview --port 5173).
 */

const WIDGET_API_BASE = process.env.WIDGET_API_BASE ?? "http://localhost:5173";
const SDK_DIST = resolve(__dirname, "../../packages/widget-sdk/dist");

// Tiny static file server: serves the SDK bundle + the harness HTML.
async function startHarnessServer(port: number): Promise<Server> {
  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url === "/" ? "/index.html" : (req.url ?? "/404");
    const filePath = join(SDK_DIST, url);
    try {
      const buf = await readFile(filePath);
      const ext = extname(filePath);
      const ct =
        ext === ".js"
          ? "text/javascript"
          : ext === ".html"
            ? "text/html"
            : "application/octet-stream";
      res.writeHead(200, { "Content-Type": ct });
      res.end(buf);
    } catch {
      // index.html isn't in SDK_DIST — synthesise it on the fly.
      if (url === "/index.html") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(harnessHtml());
        return;
      }
      res.writeHead(404);
      res.end("not found");
    }
  };
  return new Promise<Server>((resolve) => {
    const srv = createServer(handler);
    srv.listen(port, "127.0.0.1", () => resolve(srv));
  });
}

function harnessHtml(): string {
  return `<!doctype html>
<html><body>
  <h1>SDK harness</h1>
  <div id="result">loading…</div>
  <script type="module">
    import { initConvor } from "./index.js";
    try {
      const sdk = await initConvor({
        slug: "acme",
        apiBase: "${WIDGET_API_BASE}",
      });
      document.getElementById("result").textContent =
        "sdk-ready:" + typeof window.ConvorWidget;
      window.__CONVOR_SDK = sdk;
    } catch (e) {
      document.getElementById("result").textContent = "sdk-error:" + e.message;
    }
  </script>
</body></html>`;
}

test("widget-sdk: real Chromium loads the SDK and mounts the widget iframe", async ({
  page,
}) => {
  await startHarnessServer(4099);
  await page.goto("http://127.0.0.1:4099/");

  // SDK resolved + the loader executed.
  await expect
    .poll(async () => page.locator("#result").textContent(), {
      timeout: 15_000,
    })
    .toBe("sdk-ready:object");

  // Canonical script tag injected by the SDK into document.head.
  await expect(
    page.locator(
      `head script[src="${WIDGET_API_BASE}/widget.js"][data-key="acme"]`,
    ),
  ).toHaveCount(1);

  // Trigger-button iframe mounted.
  await expect(page.locator('iframe[src*="widget-iframe.html"]')).toBeVisible({
    timeout: 15_000,
  });
});
