import {
  buildDataAttrs,
  buildScriptUrl,
  DEFAULT_API_BASE,
  DEFAULT_TIMEOUT_MS,
  findScript,
  injectScript,
  waitForReady,
} from "./loader.js";
import { createSdk, getState, setState } from "./sdk.js";
import type { ConvorOptions, ConvorSDK } from "./types.js";

/** Inline SSR check so the guard is evaluated per-call (testable via stubbing). */
function hasDOM(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export { DEFAULT_API_BASE, DEFAULT_TIMEOUT_MS } from "./loader.js";
export type {
  ConvorOptions,
  ConvorPosition,
  ConvorSDK,
  ConvorTheme,
  ConvorVisitorSDK,
} from "./types.js";

/**
 * Embed the Convor live-chat widget and resolve a typed SDK handle.
 *
 * Behavior:
 * - SSR-safe. If called outside a browser (no `window`/`document`), this
 *   rejects with a clear error rather than touching globals.
 * - Idempotent. A second call reuses the existing embed script tag (matched by
 *   `src`) and resolves the same kind of handle without re-injecting.
 * - On resolve, `window.ConvorWidget` is guaranteed to be defined.
 *
 * The pass-through methods on the returned handle (`identify`, `track`, …)
 * forward to the visitor SDK global `window.Convor`. If that global isn't ready
 * yet — or has been destroyed — they no-op and log a warning in development.
 *
 * @example
 * ```ts
 * const convor = await initConvor({ slug: "my-org" });
 * convor.openChat();
 * ```
 */
export async function initConvor(options: ConvorOptions): Promise<ConvorSDK> {
  if (!options || !options.slug) {
    throw new Error("[convor] initConvor requires a `slug` option");
  }

  if (!hasDOM()) {
    throw new Error(
      "[convor] initConvor must be called in a browser environment (window/document are undefined). " +
        'Guard with a `typeof window !== "undefined"` check when running on the server.',
    );
  }

  const apiBase = options.apiBase ?? DEFAULT_API_BASE;
  const src = buildScriptUrl(apiBase);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Idempotency: if a script with this exact src is already on the page, we
  // reuse it. This covers both repeated initConvor() calls and the case where
  // the canonical snippet was already added by the host page.
  const existingScript = findScript(src);
  const cached = getState();
  if (existingScript && cached) {
    // Already initialized via this SDK — hand back the cached handle.
    return cached.sdk;
  }

  const script = injectScript(src, buildDataAttrs(options));
  await waitForReady(timeoutMs);

  const sdk = createSdk();
  setState({ src, script, sdk, destroyed: false });
  return sdk;
}
