import "dotenv/config";

/**
 * Required environment variables. We validate up front so missing config
 * fails loudly on boot rather than mid-OAuth.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required env var ${name}. Copy env.example to .env and fill it in.`
    );
  }
  return value.trim();
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    return fallback;
  }
  return value.trim();
}

function redirectBase(url: string): string {
  // Normalize: strip a trailing path so CONVOR_STOREFRONT_JS / install paths
  // can be derived consistently. We keep scheme + host (+ port).
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    throw new Error(`ECWID_REDIRECT_URL is not a valid URL: ${url}`);
  }
}

export const config = {
  clientId: required("ECWID_CLIENT_ID"),
  clientSecret: required("ECWID_CLIENT_SECRET"),
  redirectUrl: required("ECWID_REDIRECT_URL"),
  /** Public appId used by Ecwid.getAppPublicConfig() in the storefront loader. */
  appId: required("ECWID_APP_ID"),
  /** HTTPS URL of the loader JS that Ecwid injects on storefront pages. */
  storefrontJs:
    process.env.CONVOR_STOREFRONT_JS ??
    `${redirectBase(required("ECWID_REDIRECT_URL"))}/storefront.js`,
  /** Default Convor widget CDN — overridable per-store via the settings form. */
  defaultApiBase: optional("CONVOR_DEFAULT_API_BASE", "https://cdn.convor.io"),
  port: Number.parseInt(optional("PORT", "3000"), 10),
  /** Postgres database for marketplace-safe install token persistence. */
  databaseUrl: required("DATABASE_URL"),
} as const;

/** Access scopes requested from the merchant at install time. */
export const ECWID_SCOPES = [
  "read_store_profile",
  "customize_storefront",
] as const;

export const ECWID_HOSTS = {
  /** OAuth authorize dialog + token exchange. */
  oauth: "https://my.ecwid.com/api/oauth",
  /** REST API base (Bearer / token auth). */
  api: "https://app.ecwid.com/api/v3",
} as const;
