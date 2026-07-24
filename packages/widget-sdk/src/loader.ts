import { warn } from "./env.js";
import type { ConvorOptions } from "./types.js";

/** Default CDN base when `apiBase` is omitted. */
export const DEFAULT_API_BASE = "https://cdn.convor.io";

/** Default timeout for the `window.Convor` readiness poll. */
export const DEFAULT_TIMEOUT_MS = 10_000;

/** Poll interval for `window.Convor` readiness. */
const POLL_INTERVAL_MS = 50;

/**
 * Build the full `widget.js` URL for a given base. Trims a trailing slash.
 */
export function buildScriptUrl(apiBase: string): string {
  const base = apiBase.replace(/\/+$/, "");
  return `${base}/widget.js`;
}

/**
 * Build the `data-*` attributes derived from {@link ConvorOptions}. Only fields
 * the caller set are included — server config still wins for the rest.
 */
export function buildDataAttrs(options: ConvorOptions): Record<string, string> {
  const attrs: Record<string, string> = { "data-key": options.slug };
  if (options.primaryColor) attrs["data-primary-color"] = options.primaryColor;
  if (options.position) attrs["data-position"] = options.position;
  if (options.theme) attrs["data-theme"] = options.theme;
  return attrs;
}

/**
 * Find an existing embed script tag by its `src`.
 */
export function findScript(src: string): HTMLScriptElement | null {
  return (
    document.querySelector<HTMLScriptElement>(`script[src="${src}"]`) ?? null
  );
}

/**
 * Inject the embed script tag into `document.head` if one with the same `src`
 * isn't already present. Returns the relevant script element either way.
 */
export function injectScript(
  src: string,
  attrs: Record<string, string>,
): HTMLScriptElement {
  const existing = findScript(src);
  if (existing) return existing;

  const script = document.createElement("script");
  script.src = src;
  script.async = true;
  for (const [key, value] of Object.entries(attrs)) {
    script.setAttribute(key, value);
  }
  document.head.appendChild(script);
  return script;
}

/**
 * Remove a script element from the DOM, if still attached.
 */
export function removeScript(script: HTMLScriptElement | null): void {
  if (script?.parentNode) {
    script.parentNode.removeChild(script);
  }
}

/**
 * Resolve once `window.Convor` is defined, or reject on timeout. The embed
 * loader sets this canonical API global synchronously when the script runs.
 */
export function waitForReady(timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("window is not available (SSR environment)"));
      return;
    }
    if (window.Convor !== undefined) {
      resolve();
      return;
    }
    const start = Date.now();
    const timer = setInterval(() => {
      if (window.Convor !== undefined) {
        clearInterval(timer);
        resolve();
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        clearInterval(timer);
        reject(
          new Error(
            `[convor] timed out after ${timeoutMs}ms waiting for window.Convor`,
          ),
        );
      }
    }, POLL_INTERVAL_MS);
  });
}

/** Resolve after `ms` (used to wait for any in-flight global to clear). */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Defensive caller for visitor-SDK methods. When `window.Convor` isn't ready
 * yet (or has been destroyed) it no-ops and warns in development.
 *
 * The implementation is untyped by design (it's a thin forwarder); the typed
 * surface lives on the {@link ConvorSDK} methods that wrap it.
 */
export function callVisitor(method: string, ...args: unknown[]): void {
  const sdk = typeof window !== "undefined" ? window.Convor : undefined;
  if (!sdk) {
    warn(`window.Convor not ready yet — ignoring "${method}()" call`);
    return;
  }
  // The visitor SDK is a black box at runtime; treat it as a method map. The
  // typed surface lives on the ConvorSDK methods that wrap this forwarder.
  const methods = sdk as unknown as Record<
    string,
    ((...a: unknown[]) => void) | undefined
  >;
  const fn = methods[method];
  if (typeof fn !== "function") {
    warn(`window.Convor has no "${method}" method — ignoring call`);
    return;
  }
  fn(...args);
}
