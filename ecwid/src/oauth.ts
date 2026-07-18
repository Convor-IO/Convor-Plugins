import {config, ECWID_HOSTS, ECWID_SCOPES} from "./config.js";

/**
 * Ecwid OAuth — external (server-side) app flow.
 *
 * Two steps:
 *  1. Send the merchant to the authorize dialog. On approval Ecwid redirects
 *     back to our redirect URL with a temporary `code`.
 *  2. Exchange that `code` for a long-lived access token at the token endpoint.
 *     The code is single-use and lives for a few minutes.
 *
 * Reference: https://developers.ecwid.com/api-documentation/external-applications
 */

export interface TokenResponse {
  access_token: string;
  token_type: "bearer";
  scope: string;
  store_id: number;
  email?: string;
  public_token?: string;
}

export class OAuthError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "OAuthError";
  }
}

/** Build the URL merchants hit to begin installation. */
export function buildAuthorizeUrl(): string {
  const url = new URL(`${ECWID_HOSTS.oauth}/authorize`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", ECWID_SCOPES.join(" "));
  return url.toString();
}

/**
 * Exchange a temporary `code` for an access token.
 *
 * `GET https://my.ecwid.com/api/oauth/token?client_id=...&client_secret=...&code=...&redirect_uri=...&grant_type=authorization_code`
 */
export async function exchangeCodeForToken(
  code: string
): Promise<TokenResponse> {
  const url = new URL(`${ECWID_HOSTS.oauth}/token`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("client_secret", config.clientSecret);
  url.searchParams.set("code", code);
  url.searchParams.set("redirect_uri", config.redirectUrl);
  url.searchParams.set("grant_type", "authorization_code");

  const res = await fetch(url.toString(), {method: "GET"});
  const body = await res.text();

  if (!res.ok) {
    throw new OAuthError(
      `Token exchange failed (${res.status}): ${body.slice(0, 200)}`,
      res.status
    );
  }

  let parsed: TokenResponse;
  try {
    parsed = JSON.parse(body) as TokenResponse;
  } catch {
    throw new OAuthError(
      `Token endpoint returned non-JSON: ${body.slice(0, 200)}`
    );
  }
  if (!parsed.access_token || typeof parsed.store_id !== "number") {
    throw new OAuthError(
      `Token response missing required fields: ${body.slice(0, 200)}`
    );
  }
  return parsed;
}
