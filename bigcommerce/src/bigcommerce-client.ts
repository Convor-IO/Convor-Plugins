/**
 * Typed BigCommerce REST client — covers only the surfaces this app needs:
 * store metafields (for widget config) and the Scripts API (for storefront
 * script injection). All requests use the stored OAuth `access_token` with
 * `X-Auth-Token` bearer auth and the app's `client_id` in `X-Auth-Client`.
 */

const API_HOST = "https://api.bigcommerce.com";

const HEADERS = {
  Accept: "application/json",
  "Content-Type": "application/json",
} as const;

export interface BcRequestError {
  readonly name: string;
  readonly message: string;
  readonly status: number;
  readonly body: string;
}

function authHeaders(
  clientId: string,
  accessToken: string
): Record<string, string> {
  return {
    ...HEADERS,
    "X-Auth-Client": clientId,
    "X-Auth-Token": accessToken,
  };
}

async function readError(res: Response): Promise<BcRequestError> {
  const body = await res.text();
  return {
    name: "BcRequestError",
    message: `BigCommerce API ${res.status} ${res.statusText}: ${body.slice(0, 500)}`,
    status: res.status,
    body,
  };
}

// ---------------------------------------------------------------------------
// Metafields — we store the merchant's Convor config under a single store
// metafield: namespace "convor", key "widget", value is JSON { slug, apiBase }.
// ---------------------------------------------------------------------------

export const CONVOR_METAFIELD_NAMESPACE = "convor";
export const CONVOR_METAFIELD_KEY = "widget";

export interface BcMetafield {
  id: number;
  namespace: string;
  key: string;
  value: string;
  description: string | null;
  permission_set: string;
  resource_type: string;
  resource_id: number;
  created_at: string;
  updated_at: string;
}

interface BcMetafieldListResponse {
  metafields: BcMetafield[];
  meta_pagination?: {total?: number};
}

interface BcMetafieldResponse {
  metafield?: BcMetafield;
}

export async function getConvorMetafield(
  storeHash: string,
  clientId: string,
  accessToken: string
): Promise<BcMetafield | null> {
  // BC filters store metafields by namespace+key via query params.
  const url = new URL(`${API_HOST}/stores/${storeHash}/v3/metafields`);
  url.searchParams.set("namespace", CONVOR_METAFIELD_NAMESPACE);
  url.searchParams.set("key", CONVOR_METAFIELD_KEY);
  url.searchParams.set("scope_in", "store");

  const res = await fetch(url, {headers: authHeaders(clientId, accessToken)});
  if (res.status === 404) return null;
  if (!res.ok) throw await readError(res);

  const data = (await res.json()) as BcMetafieldListResponse;
  return data.metafields?.[0] ?? null;
}

export async function upsertConvorMetafield(
  storeHash: string,
  clientId: string,
  accessToken: string,
  value: string,
  description: string
): Promise<BcMetafield> {
  // Resolve the existing metafield id so we PUT (update) rather than create
  // a duplicate on each save.
  const existing = await getConvorMetafield(storeHash, clientId, accessToken);

  if (existing) {
    const res = await fetch(
      `${API_HOST}/stores/${storeHash}/v3/metafields/${existing.id}`,
      {
        method: "PUT",
        headers: authHeaders(clientId, accessToken),
        body: JSON.stringify({value, description, permission_set: "write"}),
      }
    );
    if (!res.ok) throw await readError(res);
    const data = (await res.json()) as BcMetafieldResponse;
    if (!data.metafield) {
      throw new Error("BigCommerce returned no metafield on update.");
    }
    return data.metafield;
  }

  const res = await fetch(`${API_HOST}/stores/${storeHash}/v3/metafields`, {
    method: "POST",
    headers: authHeaders(clientId, accessToken),
    body: JSON.stringify({
      namespace: CONVOR_METAFIELD_NAMESPACE,
      key: CONVOR_METAFIELD_KEY,
      value,
      description,
      permission_set: "write",
    }),
  });
  if (!res.ok) throw await readError(res);
  const data = (await res.json()) as BcMetafieldResponse;
  if (!data.metafield) {
    throw new Error("BigCommerce returned no metafield on create.");
  }
  return data.metafield;
}

// ---------------------------------------------------------------------------
// Scripts API — POST /stores/{hash}/v3/content/scripts injects the Convor
// widget loader into the storefront. Channel-aware and not deprecated.
// ---------------------------------------------------------------------------

export type ScriptLocation = "head" | "body" | "footer";
export type ScriptLoadMethod = "default" | "defer" | "async";
export type ScriptKind = "script_tag" | "src";

export interface BcScript {
  uuid: string;
  name: string;
  description: string;
  html: string;
  src: string | null;
  auto_uninstall: boolean;
  load_method: ScriptLoadMethod;
  location: ScriptLocation;
  visibility: string;
  kind: ScriptKind;
  channel_id: number | null;
  date_created: string;
  date_modified: string;
}

interface BcScriptResponse {
  data?: BcScript;
  title?: string;
  type?: string;
}

interface BcScriptListResponse {
  data?: BcScript[];
}

export interface CreateScriptInput {
  name: string;
  description: string;
  kind: ScriptKind;
  /** Raw HTML (incl. inline `<script>`) injected at `location`. */
  html: string;
  location: ScriptLocation;
  load_method: ScriptLoadMethod;
  visibility: string;
  /** Channel to target, or null for all channels. */
  channel_id: number | null;
  auto_uninstall: boolean;
}

export async function createScript(
  storeHash: string,
  clientId: string,
  accessToken: string,
  input: CreateScriptInput
): Promise<BcScript> {
  const res = await fetch(
    `${API_HOST}/stores/${storeHash}/v3/content/scripts`,
    {
      method: "POST",
      headers: authHeaders(clientId, accessToken),
      body: JSON.stringify(input),
    }
  );
  if (!res.ok) throw await readError(res);
  const data = (await res.json()) as BcScriptResponse;
  if (!data.data) {
    throw new Error("BigCommerce returned no script on create.");
  }
  return data.data;
}

export async function listScripts(
  storeHash: string,
  clientId: string,
  accessToken: string
): Promise<BcScript[]> {
  const res = await fetch(
    `${API_HOST}/stores/${storeHash}/v3/content/scripts`,
    {
      headers: authHeaders(clientId, accessToken),
    }
  );
  if (!res.ok) throw await readError(res);
  const data = (await res.json()) as BcScriptListResponse;
  return data.data ?? [];
}

export async function deleteScript(
  storeHash: string,
  clientId: string,
  accessToken: string,
  uuid: string
): Promise<void> {
  const res = await fetch(
    `${API_HOST}/stores/${storeHash}/v3/content/scripts/${encodeURIComponent(
      uuid
    )}`,
    {
      method: "DELETE",
      headers: authHeaders(clientId, accessToken),
    }
  );
  // 204 No Content on success; 404 if it was already gone.
  if (res.status === 404) return;
  if (!res.ok && res.status !== 204) throw await readError(res);
}

/** Find our previously-installed Convor script by name (case-insensitive). */
export async function findConvorScript(
  storeHash: string,
  clientId: string,
  accessToken: string
): Promise<BcScript | null> {
  const scripts = await listScripts(storeHash, clientId, accessToken);
  return scripts.find((s) => s.name.toLowerCase() === "convor widget") ?? null;
}
