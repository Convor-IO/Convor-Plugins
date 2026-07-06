import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { config } from "./config.js";
import {
  buildPublicConfig,
  EcwidApiError,
  EcwidClient,
} from "./ecwid-client.js";
import { escapeHtml } from "./html.js";
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  OAuthError,
} from "./oauth.js";
import { deleteStore, readStore, saveInstall, saveSettings } from "./store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the package root — works whether we run from `src/` (tsx dev) or
 * `dist/src/` (compiled). `views/` and `public/` live at the package root and
 * are not emitted by `tsc`.
 */
function resolvePackageRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 5; i += 1) {
    if (existsSync(join(dir, "package.json"))) {
      return dir;
    }
    dir = dirname(dir);
  }
  return __dirname;
}

const PACKAGE_ROOT = resolvePackageRoot();
const VIEWS = join(PACKAGE_ROOT, "views");
const PUBLIC = join(PACKAGE_ROOT, "public");

async function readView(name: string): Promise<string> {
  return readFile(join(VIEWS, name), "utf8");
}

/** Validate a Convor org slug: lowercase alnum + hyphens, 1-64 chars. */
function isValidSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(slug);
}

function isValidApiBase(apiBase: string): boolean {
  if (apiBase.trim() === "") return true;
  try {
    const url = new URL(apiBase);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

const server = Fastify({ logger: true });

/** `GET /` — install landing page linking to the Ecwid OAuth dialog. */
server.get("/", async (_req, reply) => {
  const html = await readView("install.html");
  return reply
    .type("text/html")
    .send(html.replace("__AUTHORIZE_URL__", escapeHtml(buildAuthorizeUrl())));
});

/**
 * `GET /install` — OAuth callback.
 * Ecwid redirects here with `?code=...`. We exchange it for an access token
 * and persist the install record, then redirect into the embedded app.
 */
server.get("/install", async (req, reply) => {
  const query = req.query as { code?: string; error?: string };
  if (query.error) {
    req.log.error({ error: query.error }, "OAuth authorization denied");
    return reply
      .code(400)
      .type("text/html")
      .send(`<h1>Authorization canceled</h1><p>${escapeHtml(query.error)}</p>`);
  }
  const code = query.code;
  if (!code) {
    return reply.code(400).send("Missing code parameter.");
  }

  let token: Awaited<ReturnType<typeof exchangeCodeForToken>>;
  try {
    token = await exchangeCodeForToken(code);
  } catch (err) {
    const msg =
      err instanceof OAuthError ? err.message : "Token exchange failed.";
    req.log.error({ err }, "OAuth token exchange failed");
    return reply
      .code(400)
      .type("text/html")
      .send(`<h1>Install failed</h1><p>${escapeHtml(msg)}</p>`);
  }

  const storeId = String(token.store_id);
  saveInstall({
    storeId,
    accessToken: token.access_token,
    scope: token.scope,
    installedAt: new Date().toISOString(),
  });
  req.log.info({ storeId, scope: token.scope }, "Ecwid app installed");

  // Drop into the embedded settings app.
  return reply.redirect(`/app?storeId=${encodeURIComponent(storeId)}`, 302);
});

/** `GET /app` — embedded settings form (rendered in the Ecwid Control Panel iframe). */
server.get("/app", async (req, reply) => {
  const storeId = (req.query as { storeId?: string }).storeId;
  if (!storeId) {
    return reply.code(400).send("Missing storeId.");
  }
  const record = readStore(storeId);

  const slug = record?.settings?.slug ?? "";
  const apiBase = record?.settings?.apiBase ?? config.defaultApiBase;

  const html = await readView("app.html");
  return reply.type("text/html").send(
    html
      .replace(/__STORE_ID__/g, escapeHtml(storeId))
      .replace(/__SLUG__/g, escapeHtml(slug))
      .replace(/__API_BASE__/g, escapeHtml(apiBase)),
  );
});

interface SettingsBody {
  storeId?: unknown;
  slug?: unknown;
  apiBase?: unknown;
}

/**
 * `POST /api/settings` — save `{slug, apiBase}` and publish the per-store
 * public config that the storefront loader reads to inject the widget.
 */
server.post("/api/settings", async (req, reply) => {
  const body = req.body as SettingsBody;
  const storeId = typeof body?.storeId === "string" ? body.storeId.trim() : "";
  const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
  const apiBase =
    typeof body?.apiBase === "string"
      ? body.apiBase.trim()
      : config.defaultApiBase;

  if (!storeId) {
    return reply.code(400).send({ error: "storeId is required." });
  }
  if (!isValidSlug(slug)) {
    return reply.code(400).send({
      error:
        "Invalid slug. Use lowercase letters, numbers, and hyphens (1-64 chars).",
    });
  }
  if (!isValidApiBase(apiBase)) {
    return reply.code(400).send({ error: "Invalid apiBase URL." });
  }

  const record = readStore(storeId);
  if (!record) {
    return reply.code(404).send({
      error: "Store not installed. Reinstall the app via /.",
    });
  }

  const resolvedApiBase = apiBase || config.defaultApiBase;
  const client = new EcwidClient(storeId, record.install.accessToken);

  /**
   * Publish the per-store public config. Ecwid auto-loads our registered
   * storefront loader JS on every storefront page; that loader calls
   * `Ecwid.getAppPublicConfig(appId)` to read this value and injects:
   *   <script src="<apiBase>/widget.js" data-key="<slug>" async></script>
   */
  const publicConfig = JSON.stringify(buildPublicConfig(slug, resolvedApiBase));
  try {
    await client.putStorage("public", publicConfig);
  } catch (err) {
    req.log.error({ err, storeId }, "Failed to publish public config");
    const msg =
      err instanceof EcwidApiError
        ? `Ecwid API error (${err.status}).`
        : "Failed to publish storefront config.";
    return reply.code(502).send({ error: msg });
  }

  saveSettings(storeId, {
    slug,
    apiBase: resolvedApiBase,
    updatedAt: new Date().toISOString(),
  });

  return reply.send({ ok: true, slug, apiBase: resolvedApiBase });
});

/**
 * `DELETE /api/uninstall` — clear the per-store public config so the widget
 * stops rendering, then drop the local install record.
 */
server.delete("/api/uninstall", async (req, reply) => {
  const storeId = (req.query as { storeId?: string }).storeId;
  if (!storeId) {
    return reply.code(400).send({ error: "storeId is required." });
  }
  const record = readStore(storeId);
  if (record) {
    const client = new EcwidClient(storeId, record.install.accessToken);
    try {
      await client.deleteStorage("public");
    } catch (err) {
      // Best-effort — token may already be revoked. Log and continue.
      req.log.warn(
        { err, storeId },
        "Could not clear public config on uninstall",
      );
    }
  }
  deleteStore(storeId);
  return reply.send({ ok: true });
});

/** Health check. */
server.get("/health", async () => ({ ok: true }));

/**
 * `GET /storefront.js` — the loader JS Ecwid auto-injects on storefront pages.
 * Served from `public/storefront.js` with the appId baked in.
 */
server.get("/storefront.js", async (_req, reply) => {
  let js: string;
  try {
    js = await readFile(join(PUBLIC, "storefront.js"), "utf8");
  } catch {
    return reply.code(404).send("storefront.js not found");
  }
  // Bake in the appId so the loader knows which public config to read.
  js = js.replace(
    "window.__CONVOR_ECWID_APP_ID__",
    JSON.stringify(config.appId),
  );
  return reply
    .type("application/javascript; charset=utf-8")
    .header("Cache-Control", "public, max-age=300")
    .send(js);
});

const start = async (): Promise<void> => {
  try {
    await server.listen({ host: "0.0.0.0", port: config.port });
    server.log.info(
      { storefrontJs: config.storefrontJs },
      "Convor-Ecwid app running. Register this storefront.js URL with Ecwid (customize_storefront scope).",
    );
  } catch (err) {
    server.log.error({ err }, "Server failed to start");
    process.exit(1);
  }
};

void start();
