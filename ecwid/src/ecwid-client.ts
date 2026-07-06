import { config, ECWID_HOSTS } from "./config.js";

/**
 * Typed client for the Ecwid REST API.
 *
 * Auth: Bearer access token (the private OAuth token). The token is stored
 * server-side and never exposed to the storefront.
 *
 * Reference: https://developers.ecwid.com/api-documentation
 */

export interface StorageEntry {
  key: string;
  value: string;
}

export class EcwidApiError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string) {
    super(`Ecwid API error ${status}: ${body.slice(0, 200)}`);
    this.name = "EcwidApiError";
    this.status = status;
    this.body = body;
  }
}

async function readError(res: Response): Promise<EcwidApiError> {
  const body = await res.text();
  return new EcwidApiError(res.status, body);
}

function apiUrl(
  storeId: string,
  path: string,
  token: string,
  query?: Record<string, string>,
): string {
  const url = new URL(`${ECWID_HOSTS.api}/${storeId}${path}`, ECWID_HOSTS.api);
  url.searchParams.set("token", token);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export class EcwidClient {
  private readonly storeId: string;
  private readonly token: string;

  constructor(storeId: string, token: string) {
    this.storeId = storeId;
    this.token = token;
  }

  /** `GET /api/v3/{storeId}/storage/{key}` — value as a string. */
  async getStorage(key: string): Promise<string | null> {
    const res = await fetch(
      apiUrl(this.storeId, `/storage/${encodeURIComponent(key)}`, this.token),
      { method: "GET" },
    );
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw await readError(res);
    }
    const body = (await res.json()) as StorageEntry;
    return body.value;
  }

  /**
   * `PUT /api/v3/{storeId}/storage/{key}` — sets (or replaces) a value.
   * Used for the `public` key (public app config read by the storefront loader).
   */
  async putStorage(key: string, value: string): Promise<void> {
    const res = await fetch(
      apiUrl(this.storeId, `/storage/${encodeURIComponent(key)}`, this.token),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json;charset=utf-8" },
        body: value,
      },
    );
    if (!res.ok) {
      throw await readError(res);
    }
  }

  /** `DELETE /api/v3/{storeId}/storage/{key}`. */
  async deleteStorage(key: string): Promise<void> {
    const res = await fetch(
      apiUrl(this.storeId, `/storage/${encodeURIComponent(key)}`, this.token),
      { method: "DELETE" },
    );
    // 404 is fine — nothing to delete.
    if (!res.ok && res.status !== 404) {
      throw await readError(res);
    }
  }

  /** `GET /api/v3/{storeId}/profile` — sanity check that the token works. */
  async getProfile(): Promise<unknown> {
    const res = await fetch(apiUrl(this.storeId, "/profile", this.token), {
      method: "GET",
    });
    if (!res.ok) {
      throw await readError(res);
    }
    return (await res.json()) as unknown;
  }
}

/**
 * Per-store public config payload consumed by the storefront loader
 * (`Ecwid.getAppPublicConfig(appId)`). Kept deliberately small and
 * JSON-parseable.
 */
export interface ConvorPublicConfig {
  slug: string;
  apiBase: string;
  /** App appId, echoed so the storefront loader can sanity-check its caller. */
  appId: string;
}

export function buildPublicConfig(
  slug: string,
  apiBase: string,
): ConvorPublicConfig {
  return {
    slug,
    apiBase: apiBase || config.defaultApiBase,
    appId: config.appId,
  };
}
