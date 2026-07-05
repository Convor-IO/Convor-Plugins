import jwt from "jsonwebtoken";

/**
 * Session cookie issued by the Load callback after the `signed_payload` is
 * verified. The cookie carries the verified `store_hash` so the embedded
 * app's JSON API calls don't have to re-trust client-supplied input.
 *
 * Signed with the same `client_secret` used for the BC callbacks (HMAC-SHA256).
 */

const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

export interface SessionClaims {
  store_hash: string;
  iat: number;
  exp: number;
}

export function createSessionToken(
  storeHash: string,
  clientSecret: string,
): string {
  return jwt.sign({ store_hash: storeHash }, clientSecret, {
    algorithm: "HS256",
    expiresIn: SESSION_TTL_SECONDS,
  });
}

/** Verify a session cookie JWT. Throws on invalid signature or expiry. */
export function verifySessionToken(
  token: string,
  clientSecret: string,
): SessionClaims {
  const decoded = jwt.verify(token, clientSecret, {
    algorithms: ["HS256"],
  }) as unknown;
  if (
    typeof decoded !== "object" ||
    decoded === null ||
    typeof (decoded as SessionClaims).store_hash !== "string"
  ) {
    throw new Error("Invalid session token.");
  }
  return decoded as SessionClaims;
}

export const SESSION_COOKIE_NAME = "convor_session";
export const SESSION_MAX_AGE = SESSION_TTL_SECONDS;
