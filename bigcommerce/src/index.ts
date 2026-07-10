import cookiePlugin from "@fastify/cookie";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import {
  type BcRequestError,
  createScript,
  deleteScript,
  findConvorScript,
} from "./bigcommerce-client.js";
import { type AppConfig, loadConfig } from "./config.js";
import {
  buildInstallUrl,
  exchangeCodeForToken,
  parseStoreHash,
} from "./oauth.js";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
  verifySessionToken,
} from "./session.js";
import { PostgresSettingsStore, type SettingsStore } from "./settings-store.js";
import {
  storeHashFromSignedPayload,
  verifySignedPayload,
} from "./signed-payload.js";
import { PostgresTokenStore, type TokenStore } from "./token-store.js";
import { renderError, renderLanding, renderSettings } from "./views.js";
import {
  buildWidgetHtml,
  type ConvorWidgetConfig,
  parseConfig,
  validateConfig,
} from "./widget-config.js";

interface AppBindings {
  config: AppConfig;
  settings: SettingsStore;
  tokens: TokenStore;
}

async function buildServer(bindings: AppBindings) {
  const { config, settings, tokens } = bindings;
  const app = Fastify({ logger: true });
  await app.register(cookiePlugin, {});

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Read+verify the session cookie. On success returns the store hash. On
   * failure throws a 401-shaped error the route handler turns into a redirect.
   */
  function readSession(req: FastifyRequest): string {
    const token = req.cookies[SESSION_COOKIE_NAME];
    if (!token) throw unauthorized("Missing session.");
    const claims = verifySessionToken(token, config.clientSecret);
    return claims.store_hash;
  }

  function unauthorized(message: string): Error & {
    statusCode: number;
    publicMessage: string;
  } {
    const err = new Error(message) as Error & {
      statusCode: number;
      publicMessage: string;
    };
    err.statusCode = 401;
    err.publicMessage = message;
    return err;
  }

  function html(res: FastifyReply, body: string, status = 200): FastifyReply {
    return res.status(status).type("text/html; charset=utf-8").send(body);
  }

  function jsonError(
    res: FastifyReply,
    status: number,
    message: string,
  ): FastifyReply {
    return res.status(status).type("application/json").send({
      ok: false,
      error: message,
    });
  }

  /** Surface BC API errors as a readable message. */
  function describeBcError(err: unknown): string {
    if (
      err &&
      typeof err === "object" &&
      "status" in err &&
      typeof (err as { status?: unknown }).status === "number"
    ) {
      const e = err as BcRequestError;
      return `BigCommerce API error (${e.status}).`;
    }
    return err instanceof Error ? err.message : String(err);
  }

  // -------------------------------------------------------------------------
  // Routes
  // -------------------------------------------------------------------------

  // Landing / install page.
  app.get("/", async (_req, reply) => {
    return html(reply, renderLanding({ installUrl: buildInstallUrl(config) }));
  });

  // Health check — used by orchestrators and integration smoke tests.
  app.get("/health", async () => ({ ok: true }));

  // OAuth callback — exchange code for token, persist install, set session,
  // then redirect to /load so BC's signed_payload flow takes over.
  app.get<{ Querystring: { code?: string; context?: string; scope?: string } }>(
    "/auth",
    async (req, reply) => {
      const { code, context, scope } = req.query;
      if (!code || !context || !scope) {
        return html(
          reply,
          renderError({
            message:
              "Missing OAuth parameters. Start the install from BigCommerce.",
          }),
          400,
        );
      }

      try {
        parseStoreHash(context); // validate early for a clearer error
        const install = await exchangeCodeForToken(
          config,
          code,
          context,
          scope,
        );
        await tokens.upsert(install);

        // Issue a session cookie so /load and the JSON API trust the caller.
        const sessionToken = createSessionToken(
          install.storeHash,
          config.clientSecret,
        );
        reply.setCookie(SESSION_COOKIE_NAME, sessionToken, {
          httpOnly: true,
          secure: true,
          sameSite: "none", // BC embeds us in an iframe on a different origin
          path: "/",
          maxAge: SESSION_MAX_AGE,
        });

        return reply.redirect(`${config.appBaseUrl}/load`);
      } catch (err) {
        req.log.error({ err }, "OAuth callback failed");
        return html(
          reply,
          renderError({
            message: `We could not complete the BigCommerce install. ${describeBcError(err)}`,
          }),
          502,
        );
      }
    },
  );

  // Load callback — the embedded iframe entry point. BC hits this with a
  // signed_payload JWT. We verify it, refresh the session cookie, and render
  // the settings page.
  app.get<{
    Querystring: { signed_payload?: string; signed_payload_jwt?: string };
  }>("/load", async (req, reply) => {
    const signed_payload =
      req.query.signed_payload_jwt ?? req.query.signed_payload;
    if (!signed_payload) {
      // Fall back to the session cookie if BC omitted the payload (e.g. on
      // an in-app navigation).
      try {
        const storeHash = readSession(req);
        return reply.redirect(`/load/${storeHash}`);
      } catch {
        return html(
          reply,
          renderError({
            message: "Missing signed_payload from BigCommerce.",
          }),
          400,
        );
      }
    }

    try {
      const payload = verifySignedPayload(signed_payload, config.clientSecret);
      const storeHash = storeHashFromSignedPayload(payload);
      const sessionToken = createSessionToken(storeHash, config.clientSecret);
      reply.setCookie(SESSION_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path: "/",
        maxAge: SESSION_MAX_AGE,
      });
      return reply.redirect(`/load/${storeHash}`);
    } catch (err) {
      req.log.error({ err }, "signed_payload verification failed");
      return html(
        reply,
        renderError({
          message: "We could not verify the BigCommerce session.",
        }),
        401,
      );
    }
  });

  // Internal: render the settings app once we trust the store hash.
  app.get<{ Params: { storeHash: string } }>(
    "/load/:storeHash",
    async (req, reply) => {
      let storeHash: string;
      try {
        storeHash = readSession(req);
      } catch {
        return html(
          reply,
          renderError({ message: "Session expired — reinstall the app." }),
          401,
        );
      }
      if (storeHash !== req.params.storeHash) {
        return html(
          reply,
          renderError({ message: "Session does not match this store." }),
          403,
        );
      }

      const install = await tokens.get(storeHash);
      if (!install) {
        return html(
          reply,
          renderError({
            message:
              "This store has not installed Convor. Reinstall to continue.",
          }),
          404,
        );
      }

      // Load current config + script status for the initial render.
      let configSnapshot: ConvorWidgetConfig = parseConfig(
        null,
        config.defaultApiBase,
      );
      let scriptInstalled = false;
      try {
        configSnapshot = (await settings.get(storeHash)) ?? configSnapshot;
        const script = await findConvorScript(
          storeHash,
          config.clientId,
          install.accessToken,
        );
        scriptInstalled = script !== null;
      } catch (err) {
        req.log.warn({ err }, "could not pre-load settings");
      }

      return html(
        reply,
        renderSettings({
          storeHash,
          ownerEmail: null,
          config: configSnapshot,
          defaultApiBase: config.defaultApiBase,
          scriptInstalled,
        }),
      );
    },
  );

  // Uninstall callback (BC sends a signed JWT when the merchant removes app).
  app.get<{ Querystring: { signed_payload_jwt?: string } }>(
    "/uninstall",
    async (req, reply) => {
      const { signed_payload_jwt } = req.query;
      if (!signed_payload_jwt) {
        return jsonError(reply, 400, "Missing signed_payload_jwt.");
      }

      try {
        const payload = verifySignedPayload(
          signed_payload_jwt,
          config.clientSecret,
        );
        const storeHash = storeHashFromSignedPayload(payload);
        await settings.delete(storeHash);
        await tokens.delete(storeHash);
      } catch (err) {
        req.log.warn({ err }, "uninstall callback verification failed");
        return jsonError(reply, 401, "Invalid uninstall callback.");
      }

      return reply.code(204).send();
    },
  );

  // -------------------------------------------------------------------------
  // JSON API — all guarded by the session cookie.
  // -------------------------------------------------------------------------

  interface SettingsBody {
    storeHash?: unknown;
    slug?: unknown;
    apiBase?: unknown;
  }

  app.post("/api/settings", async (req, reply) => {
    let sessionHash: string;
    try {
      sessionHash = readSession(req);
    } catch (err) {
      return jsonError(reply, 401, (err as Error).message);
    }

    const body = req.body as SettingsBody | null;
    if (!body || typeof body !== "object") {
      return jsonError(reply, 400, "Invalid request body.");
    }

    // The client may send a storeHash, but we always trust the session.
    const slug = String(body.slug ?? "").trim();
    const apiBase = String(body.apiBase ?? "").trim();

    const errors = validateConfig(slug, apiBase, config.defaultApiBase);
    if (errors.length > 0) {
      return jsonError(reply, 400, errors[0].message);
    }

    const install = await tokens.get(sessionHash);
    if (!install) {
      return jsonError(reply, 404, "Store is not installed.");
    }

    const resolved: ConvorWidgetConfig = {
      slug,
      apiBase: apiBase || config.defaultApiBase,
    };

    await settings.upsert(sessionHash, resolved);

    return reply.send({ ok: true, config: resolved });
  });

  app.post("/api/install-script", async (req, reply) => {
    let sessionHash: string;
    try {
      sessionHash = readSession(req);
    } catch (err) {
      return jsonError(reply, 401, (err as Error).message);
    }

    const install = await tokens.get(sessionHash);
    if (!install) {
      return jsonError(reply, 404, "Store is not installed.");
    }

    // Resolve the slug from app storage — we never inject a script before the
    // merchant has saved a config.
    const widgetConfig =
      (await settings.get(sessionHash)) ??
      parseConfig(null, config.defaultApiBase);
    if (!widgetConfig.slug) {
      return jsonError(
        reply,
        400,
        "Save your Convor org slug before installing the script.",
      );
    }

    // Idempotent: replace any existing Convor script.
    try {
      const existing = await findConvorScript(
        sessionHash,
        config.clientId,
        install.accessToken,
      );
      if (existing) {
        await deleteScript(
          sessionHash,
          config.clientId,
          install.accessToken,
          existing.uuid,
        );
      }
      const script = await createScript(
        sessionHash,
        config.clientId,
        install.accessToken,
        {
          name: "Convor Widget",
          description:
            "Loads the Convor live-chat widget. Installed by the Convor app.",
          kind: "script_tag",
          html: buildWidgetHtml(widgetConfig),
          location: "head",
          load_method: "default",
          // "storefront" = all storefront pages, all channels.
          visibility: "storefront",
          channel_id: null,
          auto_uninstall: true,
        },
      );
      return reply.send({ ok: true, script });
    } catch (err) {
      req.log.error({ err }, "script create failed");
      return jsonError(reply, 502, describeBcError(err));
    }
  });

  app.post("/api/uninstall-script", async (req, reply) => {
    let sessionHash: string;
    try {
      sessionHash = readSession(req);
    } catch (err) {
      return jsonError(reply, 401, (err as Error).message);
    }

    const install = await tokens.get(sessionHash);
    if (!install) {
      return jsonError(reply, 404, "Store is not installed.");
    }

    try {
      const existing = await findConvorScript(
        sessionHash,
        config.clientId,
        install.accessToken,
      );
      if (!existing) {
        return reply.send({ ok: true, removed: false });
      }
      await deleteScript(
        sessionHash,
        config.clientId,
        install.accessToken,
        existing.uuid,
      );
      return reply.send({ ok: true, removed: true });
    } catch (err) {
      req.log.error({ err }, "script delete failed");
      return jsonError(reply, 502, describeBcError(err));
    }
  });

  // DELETE alias requested in the spec (POST above is what the UI calls).
  app.delete("/api/uninstall-script", async (req, reply) => {
    let sessionHash: string;
    try {
      sessionHash = readSession(req);
    } catch (err) {
      return jsonError(reply, 401, (err as Error).message);
    }
    const install = await tokens.get(sessionHash);
    if (!install) return jsonError(reply, 404, "Store is not installed.");
    try {
      const existing = await findConvorScript(
        sessionHash,
        config.clientId,
        install.accessToken,
      );
      if (existing) {
        await deleteScript(
          sessionHash,
          config.clientId,
          install.accessToken,
          existing.uuid,
        );
      }
      return reply.send({ ok: true, removed: existing !== null });
    } catch (err) {
      req.log.error({ err }, "script delete failed");
      return jsonError(reply, 502, describeBcError(err));
    }
  });

  return app;
}

async function main() {
  const config = loadConfig();
  const settings = new PostgresSettingsStore({
    connectionString: config.databaseUrl,
  });
  const tokens = new PostgresTokenStore({
    connectionString: config.databaseUrl,
  });
  const app = await buildServer({ config, settings, tokens });

  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
    app.log.info(
      "Convor BigCommerce app listening on http://0.0.0.0:%d",
      config.port,
    );
  } catch (err) {
    app.log.error({ err }, "server failed to start");
    process.exit(1);
  }
}

await main();
