/**
 * Shared types + helpers for the Convor browser extension.
 *
 * Everything here is bundle-internal (tsup inlines it into each entry point),
 * so it deliberately avoids side effects — pure data + pure functions only.
 */

/** Canonical CDN base for the widget script, mirroring the embed snippet. */
export const DEFAULT_API_BASE = "https://cdn.convor.io";

/** Storage key (single object under `chrome.storage.sync`). */
export const STORAGE_KEY = "convor";

/**
 * Persistent extension settings. Stored in `chrome.storage.sync` so they roam
 * with the signed-in browser profile.
 */
export interface ConvorSettings {
  /** Organization public slug. Required — without it nothing injects. */
  orgSlug: string;
  /** Widget CDN base URL. Defaults to {@link DEFAULT_API_BASE}. */
  apiBase: string;
  /** Master switch for auto-inject on `allowedSites`. */
  autoInject: boolean;
  /**
   * Host patterns (one per line in the options UI) that auto-inject may fire
   * on, e.g. `example.com`, `*.internalcorp.net`. Empty = nowhere.
   */
  allowedSites: string[];
}

/** Sensible defaults for a fresh install (no slug configured yet). */
export const DEFAULT_SETTINGS: ConvorSettings = {
  orgSlug: "",
  apiBase: DEFAULT_API_BASE,
  autoInject: false,
  allowedSites: [],
};

/**
 * Read the full settings object, merged over {@link DEFAULT_SETTINGS} so any
 * field added in a later version still has a value. Resolves synchronously in
 * service-worker/popup contexts alike.
 */
export async function getSettings(): Promise<ConvorSettings> {
  const raw = await chrome.storage.sync.get(STORAGE_KEY);
  const stored = raw[STORAGE_KEY];
  if (!stored || typeof stored !== "object") {
    return { ...DEFAULT_SETTINGS };
  }
  return { ...DEFAULT_SETTINGS, ...(stored as Partial<ConvorSettings>) };
}

/** Replace the full settings object. */
export async function setSettings(settings: ConvorSettings): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEY]: settings });
}

/**
 * Build the full `widget.js` URL for a given base. Matches the embed loader in
 * `@convor/widget-sdk` — trims a trailing slash, appends `/widget.js`.
 */
export function buildWidgetUrl(apiBase: string): string {
  const base = (apiBase || DEFAULT_API_BASE).replace(/\/+$/, "");
  return `${base}/widget.js`;
}

/**
 * True when the slug looks non-empty after trimming. Org slugs are URL-safe
 * identifiers (the same `key` used in `?key=<slug>`), so a light sanity check
 * is enough — the server is the source of truth.
 */
export function isSlugValid(slug: string): boolean {
  return slug.trim().length > 0;
}

/**
 * Normalize a free-form host entry from the options textarea into a comparable
 * string: lowercase, trim, strip scheme/path/port the user may have pasted.
 *
 * Returns the empty string for blanks / comment lines (lines starting with `#`).
 */
export function normalizeHost(entry: string): string {
  let host = entry.trim().toLowerCase();
  if (host.startsWith("#")) return "";
  // Strip a scheme if present.
  host = host.replace(/^https?:\/\//, "");
  // Strip path/query/fragment — keep just the host[:port], and drop the port
  // too so `example.com:443` matches `example.com`.
  host = host.split(/[/?#]/)[0];
  host = host.replace(/:\d+$/, "");
  return host;
}

/**
 * True when `url`'s hostname matches any pattern in `allowedSites`. Patterns
 * support a leading `*.` wildcard (e.g. `*.internalcorp.net` matches
 * `wiki.internalcorp.net`). Bare hosts match themselves and all subdomains
 * (`example.com` matches `app.example.com`).
 */
export function matchesAllowedSites(
  url: string,
  allowedSites: string[],
): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!hostname) return false;

  for (const raw of allowedSites) {
    const pattern = normalizeHost(raw);
    if (!pattern) continue;

    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(1); // ".internalcorp.net"
      if (hostname === pattern.slice(2) || hostname.endsWith(suffix)) {
        return true;
      }
    } else if (hostname === pattern || hostname.endsWith(`.${pattern}`)) {
      return true;
    }
  }
  return false;
}

/**
 * The host permission origin string we request at runtime for a given host,
 * e.g. `example.com` -> `*://example.com/*`. Used for optional-host opt-in.
 */
export function hostToOrigin(host: string): string {
  const clean = normalizeHost(host);
  if (!clean) return "";
  return `*://${clean}/*`;
}
