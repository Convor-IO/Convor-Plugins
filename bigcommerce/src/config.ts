import dotenv from "dotenv";

// Load .env once, at import time, before anything reads process.env.
dotenv.config();

const DEFAULT_API_BASE = "https://cdn.convor.io";
const DEFAULT_PORT = 3000;

function required(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required env var ${key}. Copy env.example to .env and fill it in.`,
    );
  }
  return value.trim();
}

function optional(key: string, fallback: string): string {
  const value = process.env[key];
  return value && value.trim() !== "" ? value.trim() : fallback;
}

/**
 * Resolved app configuration. Read once at boot; routes import this object.
 *
 * `clientId` / `clientSecret` come from the BigCommerce Developer Portal.
 * `appBaseUrl` is the public HTTPS URL the app is served from and must match
 * the Auth/Load callback URLs registered against the app exactly.
 */
export interface AppConfig {
  clientId: string;
  clientSecret: string;
  appBaseUrl: string;
  port: number;
  defaultApiBase: string;
  tokenStorePath: string;
}

export function loadConfig(): AppConfig {
  const portRaw = optional("PORT", String(DEFAULT_PORT));
  const port = Number.parseInt(portRaw, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`PORT must be a valid TCP port (got "${portRaw}").`);
  }

  const appBaseUrl = optional("APP_BASE_URL", "").replace(/\/+$/, "");
  if (!appBaseUrl) {
    throw new Error(
      "Missing APP_BASE_URL — the public HTTPS URL of the running app.",
    );
  }
  if (!/^https:\/\//i.test(appBaseUrl)) {
    throw new Error(`APP_BASE_URL must be HTTPS (got "${appBaseUrl}").`);
  }

  return {
    clientId: required("BC_CLIENT_ID"),
    clientSecret: required("BC_CLIENT_SECRET"),
    appBaseUrl,
    port,
    defaultApiBase: optional(
      "CONVOR_DEFAULT_API_BASE",
      DEFAULT_API_BASE,
    ).replace(/\/+$/, ""),
    tokenStorePath: optional("TOKEN_STORE_PATH", "./data/tokens.json"),
  };
}

export const CONVOR_DASHBOARD_URL = "https://convor.io/dashboard";

// BigCommerce scopes. The Scripts API + store metafields both live under the
// store_content family; we request the broadest stable scope the merchant can
// grant. Only the scopes actually needed are listed — BigCommerce rejects
// over-scoped apps at UAT.
export const BC_SCOPES = ["store_v2_content", "store_v2_information"].join(" ");
