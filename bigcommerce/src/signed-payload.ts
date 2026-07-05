import jwt from "jsonwebtoken";

/**
 * Verifies BigCommerce single-click-app callback JWTs.
 *
 * BigCommerce signs the Auth and Load callbacks (and the legacy signed
 * payload) with HS256, using the app's `client_secret` as the HMAC key. The
 * decoded payload identifies the store, the user, and (for the load
 * callback) the installing owner.
 *
 * Ref: BigCommerce — Handling App Callbacks.
 */

export interface BcCallbackUser {
  id: number;
  email: string;
}

export interface BcCallbackOwner {
  id: number;
  email: string;
  name?: string;
}

/** Shape of the decoded `signed_payload` JWT on the load callback. */
export interface SignedPayload {
  /** "bigcommerce". */
  aud: string;
  /** App client id. */
  sub: string;
  /** BC store hash without the leading "store_". */
  store_hash: string;
  /** ISO-8601 issued-at. */
  iat?: number;
  /** The acting user. */
  user?: BcCallbackUser;
  /** The store owner who installed the app. */
  owner?: BcCallbackOwner;
  /** Optional installation / context URL. */
  url?: string;
  [key: string]: unknown;
}

/**
 * Verify a `signed_payload` JWT. Throws if the signature is invalid or the
 * token has expired.
 */
export function verifySignedPayload(
  token: string,
  clientSecret: string,
): SignedPayload {
  const decoded = jwt.verify(token, clientSecret, {
    algorithms: ["HS256"],
  }) as unknown;

  if (typeof decoded !== "object" || decoded === null) {
    throw new Error("signed_payload decoded to a non-object.");
  }

  const payload = decoded as Record<string, unknown>;
  if (typeof payload.store_hash !== "string" || !payload.store_hash) {
    throw new Error("signed_payload missing store_hash.");
  }
  return payload as unknown as SignedPayload;
}
