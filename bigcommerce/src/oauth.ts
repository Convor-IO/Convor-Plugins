import { type AppConfig, BC_SCOPES } from "./config.js";
import type { StoreInstall } from "./token-store.js";

/**
 * BigCommerce single-click-app OAuth helpers.
 *
 * Flow:
 *   1. Merchant clicks "Install" on the BC install URL (built below).
 *   2. BC redirects to our Auth Callback with `?code=...&context=stores/{hash}`.
 *   3. We POST the code to the token endpoint, BC returns a long-lived
 *      `access_token` + `scope`.
 *   4. BC then redirects the merchant to the Load Callback with a
 *      `signed_payload` JWT, which we verify to render the embedded app.
 */

const BC_API_HOST = "https://api.bigcommerce.com";
const BC_INSTALL_HOST = "https://login.bigcommerce.com";

/** The Auth Callback URL BC redirects to after the merchant approves. */
export function authCallbackUrl(cfg: AppConfig): string {
  return `${cfg.appBaseUrl}/auth`;
}

/** BigCommerce's install URL — the "Install" button links here. */
export function buildInstallUrl(cfg: AppConfig): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    context: "stores/",
    redirect_uri: authCallbackUrl(cfg),
    response_type: "code",
    scope: BC_SCOPES,
  });
  return `${BC_INSTALL_HOST}/oauth2/authorize?${params.toString()}`;
}

export interface TokenExchangeResponse {
  access_token: string;
  scope: string;
  user?: { id: number; email: string };
  context: string; // "stores/{hash}"
}

/**
 * Exchange an OAuth code for a long-lived store access token. Throws on any
 * network or BC error response.
 */
export async function exchangeCodeForToken(
  cfg: AppConfig,
  code: string,
  context: string,
  scope: string,
): Promise<StoreInstall> {
  const body = {
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    scope,
    grant_type: "authorization_code",
    redirect_uri: authCallbackUrl(cfg),
    context,
  };

  const response = await fetch(`${BC_API_HOST}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `BC token exchange failed (${response.status}): ${text.slice(0, 500)}`,
    );
  }

  const data = (await response.json()) as TokenExchangeResponse;
  const storeHash = parseStoreHash(data.context);

  return {
    storeHash,
    accessToken: data.access_token,
    installedAt: new Date().toISOString(),
    scope: data.scope,
  };
}

/** "stores/abc123" → "abc123". Throws if the context is malformed. */
export function parseStoreHash(context: string): string {
  const match = /^stores\/([a-zA-Z0-9]+)$/.exec(context);
  if (!match || !match[1]) {
    throw new Error(`Malformed BC OAuth context: "${context}".`);
  }
  return match[1];
}
