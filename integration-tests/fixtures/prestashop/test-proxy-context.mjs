// Actual PrestaShop virtual shop behind a loopback reverse proxy.
// No external requests and no production database. The temporary shop,
// URL, configuration and generated rewrite rules are removed afterwards.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer, request } from "node:http";
import { chromium, expect } from "@playwright/test";

const container = "convor-prestashop-1807-82-prestashop-1";
assert.equal(
  execFileSync(
    "docker",
    [
      "inspect",
      "-f",
      '{{ index .Config.Labels "com.docker.compose.project" }}',
      container,
    ],
    { encoding: "utf8" },
  ).trim(),
  "convor-prestashop-1807-82",
);
const idn = process.env.CONVOR_QA_MULTISHOP_PROXY_IDN === "1";
const host = new URL(
  idn ? "http://sklep-łódź.localhost:18226" : "http://localhost:18226",
);
const origin = host.origin;
const base = `${origin}/convor-qa/`;
const htaccess = "/var/www/html/.htaccess";
const original = execFileSync("docker", ["exec", container, "cat", htaccess]);
const fixtureSource = readFileSync(
  new URL("./multistore-fixture.php", import.meta.url),
);
const php = (action, extra = {}) =>
  JSON.parse(
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "-u",
        "www-data",
        "-e",
        `CONVOR_QA_MULTISHOP_ACTION=${action}`,
        "-e",
        "CONVOR_QA_MULTISHOP_PROXY=1",
        "-e",
        `CONVOR_QA_MULTISHOP_PROXY_IDN=${idn ? "1" : "0"}`,
        ...Object.entries(extra).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
        container,
        "php",
      ],
      { input: fixtureSource, encoding: "utf8" },
    ),
  );
let contextRequests = 0;
const proxy = createServer((req, res) => {
  const url = new URL(req.url, origin);
  if (req.headers.host !== host.host || url.origin !== origin) {
    res.writeHead(400).end();
    return;
  }
  const isContext =
    url.searchParams.get("controller") === "context" &&
    url.searchParams.get("module") === "convor";
  if (isContext) contextRequests++;
  const upstream = request(
    {
      hostname: "127.0.0.1",
      port: 18218,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        "x-forwarded-host": req.headers.host,
        "x-forwarded-proto": "http",
      },
    },
    (response) => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    },
  );
  upstream.on("error", () => res.writeHead(502).end());
  req.pipe(upstream);
});
let fixture;
let fixtureAttempted = false;
let browser;
try {
  await new Promise((resolve, reject) =>
    proxy.once("error", reject).listen(18226, "127.0.0.1", resolve),
  );
  fixtureAttempted = true;
  fixture = php("create");
  browser = await chromium.launch({
    headless: true,
    args: [`--host-resolver-rules=MAP ${host.hostname} 127.0.0.1`],
  });
  async function createPage() {
    const page = await browser.newPage();
    await page
      .context()
      .route("**/*", (route) =>
        new URL(route.request().url()).origin === origin
          ? route.continue()
          : route.abort(),
      );
    const response = await page.goto(base, { waitUntil: "domcontentloaded" });
    assert.equal(response.status(), 200, "Virtual shop route");
    assert.ok(page.url().startsWith(base), "Canonical subdirectory");
    const tag = page.locator("script[data-convor-context]");
    await expect(tag).toHaveCount(1);
    const data = await tag.evaluate((el) => ({
      endpoint: el.dataset.convorContext,
      key: el.dataset.key,
      source: el.getAttribute("src"),
    }));
    assert.match(data.key, /^convor_wpk_[a-f0-9]{64}$/);
    assert.ok(
      new URL(data.source, page.url()).pathname.startsWith(
        "/convor-qa/modules/convor/",
      ),
      "Script path includes shop prefix",
    );
    assert.equal(
      (await page.request.get(new URL(data.source, page.url()).href)).status(),
      200,
      "Actual prefixed script",
    );
    const endpoint = new URL(data.endpoint, page.url());
    assert.equal(endpoint.origin, origin);
    assert.ok(
      endpoint.pathname.startsWith("/convor-qa/"),
      "Context path includes shop prefix",
    );
    return { page, endpoint: endpoint.href, key: data.key };
  }
  const a = await createPage();
  const b = await createPage();
  async function context(session) {
    const result = await session.page.evaluate(
      async ({ endpoint, key }) => {
        const response = await fetch(endpoint, {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "X-Convor-Context": "1",
          },
          body: JSON.stringify({ widgetKey: key }),
        });
        return {
          status: response.status,
          cache: response.headers.get("cache-control"),
          body: await response.json(),
        };
      },
      { endpoint: session.endpoint, key: session.key },
    );
    assert.equal(result.status, 200);
    assert.match(result.cache, /\bprivate\b/);
    assert.match(result.cache, /\bno-store\b/);
    return result.body.attributes;
  }
  const beforeA = await context(a);
  const beforeB = await context(b);
  assert.equal(Number(beforeA.cartTotal ?? 0), 0);
  assert.equal(Number(beforeB.cartTotal ?? 0), 0);
  const href = await a.page
    .locator("article.product-miniature a[href],.product-miniature a[href]")
    .first()
    .getAttribute("href");
  assert.ok(href);
  await a.page.goto(new URL(href, a.page.url()).href, {
    waitUntil: "domcontentloaded",
  });
  const added = a.page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      new URL(r.url()).origin === origin &&
      r.request().postData()?.includes("add=1"),
  );
  await a.page.locator('[data-button-action="add-to-cart"]').first().click();
  assert.ok((await added).ok());
  const afterA = await context(a);
  assert.ok(Number(afterA.cartTotal) > 0, "A has an actual cart");
  const afterB = await context(b);
  assert.equal(Number(afterB.cartTotal ?? 0), 0, "B must not get A's cart");
  assert.equal(
    (await context(a)).cartTotal,
    afterA.cartTotal,
    "A retains its own cart",
  );
  const cross = await a.page.request.post(a.endpoint, {
    headers: { Origin: "http://localhost:18227", "X-Convor-Context": "1" },
    data: { widgetKey: a.key },
  });
  assert.equal(cross.status(), 403);
  assert.match(cross.headers()["cache-control"], /\bno-store\b/);
  assert.equal(
    contextRequests,
    6,
    "Every context call forwarded to actual shop",
  );
  console.log(
    `PASS actual loopback reverse proxy (${idn ? "IDN/punycode" : "ASCII"}) with virtual subdirectory, prefixed assets/context, private no-store, two independent carts and foreign-origin rejection`,
  );
} finally {
  if (browser) await browser.close();
  try {
    if (fixture)
      php("remove", {
        CONVOR_QA_MULTISHOP_ID: String(fixture.shopId),
        CONVOR_QA_MULTISHOP_OLD: String(fixture.oldMulti),
      });
  } finally {
    if (fixtureAttempted) {
      execFileSync(
        "docker",
        ["exec", "-i", container, "sh", "-ec", "cat > /var/www/html/.htaccess"],
        { input: original },
      );
      assert.deepEqual(
        execFileSync("docker", ["exec", container, "cat", htaccess]),
        original,
      );
    }
    proxy.closeAllConnections();
    await new Promise((resolve) => proxy.close(resolve));
  }
}
