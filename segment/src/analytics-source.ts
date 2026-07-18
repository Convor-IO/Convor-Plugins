import type {AnalyticsJS} from "./types.js";

/** Default CDN base when `apiBase` is omitted. */
export const DEFAULT_API_BASE = "https://cdn.convor.io";

/** Default timeout for the `window.Convor` readiness poll. */
export const DEFAULT_WIDGET_TIMEOUT_MS = 10_000;

/** Default timeout for the `window.analytics` availability poll. */
export const DEFAULT_ANALYTICS_TIMEOUT_MS = 15_000;

/** Poll interval for the readiness/availability polls. */
const POLL_INTERVAL_MS = 50;

/** `console.warn` wrapper that stays silent in production. */
function warn(message: string): void {
  const isDev =
    typeof process !== "undefined" &&
    typeof process.env !== "undefined" &&
    process.env.NODE_ENV !== "production";
  if (isDev && typeof console !== "undefined" && console.warn) {
    console.warn(`[convor-segment] ${message}`);
  }
}

/** Inline SSR check, evaluated per-call so it can be stubbed in tests. */
function hasDOM(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/**
 * Build the full `widget.js` URL for a given base. Trims a trailing slash.
 */
export function buildScriptUrl(apiBase: string): string {
  const base = apiBase.replace(/\/+$/, "");
  return `${base}/widget.js`;
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
 * Inject the Convor embed script tag into `document.head` if one with the same
 * `src` isn't already present. Returns the relevant script element either way.
 */
export function injectScript(src: string, slug: string): HTMLScriptElement {
  const existing = findScript(src);
  if (existing) return existing;

  const script = document.createElement("script");
  script.src = src;
  script.async = true;
  script.setAttribute("data-key", slug);
  document.head.appendChild(script);
  return script;
}

/**
 * Resolve once `window.Convor` is defined, or reject on timeout. The embed
 * loader exposes this global as soon as the visitor SDK is bootstrapped.
 */
export function waitForConvor(timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (!hasDOM()) {
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
            `[convor-segment] timed out after ${timeoutMs}ms waiting for window.Convor`
          )
        );
      }
    }, POLL_INTERVAL_MS);
  });
}

/**
 * Resolve once `window.analytics` is available, or reject on timeout.
 *
 * Segment's analytics.js is loaded asynchronously by its snippet, which sets up
 * a stub `window.analytics` with a `push`-based queue *before* the real library
 * loads. Either form is enough for us: the stub already exposes `.on()` once
 * analytics.js initializes, and we poll for the real object. We treat the
 * presence of `window.analytics` (with an `on` method) as "ready".
 */
export function waitForAnalytics(timeoutMs: number): Promise<AnalyticsJS> {
  return new Promise<AnalyticsJS>((resolve, reject) => {
    if (!hasDOM()) {
      reject(new Error("window is not available (SSR environment)"));
      return;
    }
    const ready = (): AnalyticsJS | null => {
      const a = window.analytics;
      return a !== undefined && typeof a.on === "function" ? a : null;
    };

    const initial = ready();
    if (initial) {
      resolve(initial);
      return;
    }
    const start = Date.now();
    const timer = setInterval(() => {
      const a = ready();
      if (a) {
        clearInterval(timer);
        resolve(a);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        clearInterval(timer);
        reject(
          new Error(
            `[convor-segment] timed out after ${timeoutMs}ms waiting for window.analytics`
          )
        );
      }
    }, POLL_INTERVAL_MS);
  });
}

/**
 * Normalized view of a Segment `identify` emission, regardless of whether it
 * came from classic analytics.js or analytics-next.
 */
export interface IdentifyPayload {
  userId?: string;
  traits: Record<string, unknown>;
}

/**
 * Normalized view of a Segment `track` emission.
 */
export interface TrackPayload {
  event: string;
  properties: Record<string, unknown>;
}

/**
 * `analytics.on("identify", …)` listeners fire with different shapes depending
 * on the Segment runtime:
 *
 * - **Classic analytics.js** (the snippet): `emit("identify", userId, traits,
 *   options)` — i.e. the raw method arguments.
 * - **analytics-next** (`@segment/analytics-next`): `emit("identify", ctx)`
 *   where `ctx` is a single object whose `.event`/`.traits`/`.userId` fields
 *   carry the normalized data.
 *
 * This normalizer accepts the variadic listener args and returns a single
 * payload, or `null` if the args can't be interpreted (in which case the call
 * is dropped with a dev warning).
 */
export function normalizeIdentify(args: unknown[]): IdentifyPayload | null {
  if (args.length === 0) return null;
  const first = args[0];

  // analytics-next: single context object.
  if (typeof first === "object" && first !== null) {
    const ctx = first as Record<string, unknown>;
    // analytics-next wraps the data under an `event` field on the context.
    const inner =
      typeof ctx.event === "object" && ctx.event !== null
        ? (ctx.event as Record<string, unknown>)
        : ctx;
    const traits =
      typeof inner.traits === "object" && inner.traits !== null
        ? (inner.traits as Record<string, unknown>)
        : {};
    const userIdRaw = inner.userId ?? ctx.userId;
    const userId =
      typeof userIdRaw === "string" ? userIdRaw : String(userIdRaw ?? "");
    return {userId: userId || undefined, traits};
  }

  // Classic analytics.js: (userId, traits, options).
  const userIdRaw = first;
  const userId =
    typeof userIdRaw === "string"
      ? userIdRaw
      : String(userIdRaw ?? "") || undefined;
  const traitsArg = args[1];
  const traits =
    typeof traitsArg === "object" && traitsArg !== null
      ? (traitsArg as Record<string, unknown>)
      : {};
  return {userId, traits};
}

/**
 * `analytics.on("track", …)` listener normalizer — see {@link normalizeIdentify}
 * for the dual-format rationale.
 *
 * - Classic: `emit("track", event, properties, options)`.
 * - analytics-next: `emit("track", ctx)` with `ctx.event.event` and
 *   `ctx.event.properties`.
 */
export function normalizeTrack(args: unknown[]): TrackPayload | null {
  if (args.length === 0) return null;
  const first = args[0];

  // analytics-next: single context object with a nested event.
  if (typeof first === "object" && first !== null) {
    const ctx = first as Record<string, unknown>;
    const inner =
      typeof ctx.event === "object" && ctx.event !== null
        ? (ctx.event as Record<string, unknown>)
        : ctx;
    const event = inner.event;
    const propertiesArg = inner.properties;
    if (typeof event !== "string") return null;
    const properties =
      typeof propertiesArg === "object" && propertiesArg !== null
        ? (propertiesArg as Record<string, unknown>)
        : {};
    return {event, properties};
  }

  // Classic analytics.js: (event, properties, options).
  if (typeof first !== "string") return null;
  const propertiesArg = args[1];
  const properties =
    typeof propertiesArg === "object" && propertiesArg !== null
      ? (propertiesArg as Record<string, unknown>)
      : {};
  return {event: first, properties};
}

/** Forward a normalized identify payload to the Convor visitor SDK. */
export function forwardIdentify(payload: IdentifyPayload): void {
  const sdk = window.Convor;
  if (!sdk) {
    warn("window.Convor not ready — skipping identify forward");
    return;
  }
  const attrs: Record<string, unknown> = {...payload.traits};
  if (payload.userId) attrs.userId = payload.userId;
  sdk.identify(attrs);
}

/** Forward a normalized track payload to the Convor visitor SDK. */
export function forwardTrack(payload: TrackPayload): void {
  const sdk = window.Convor;
  if (!sdk) {
    warn("window.Convor not ready — skipping track forward");
    return;
  }
  sdk.track(payload.event, payload.properties);
}

/**
 * Subscribe the forwarding listeners to `window.analytics` and return an
 * `off()` handle that removes them. Both classic analytics.js and analytics-next
 * expose `.on()`; analytics-next (and recent classic builds) also expose `.off()`.
 * When `.off()` is unavailable we leave the listeners attached (no-op teardown).
 */
export function attachForwarders(
  analytics: AnalyticsJS,
  opts: {forwardIdentify: boolean; forwardTrack: boolean}
): () => void {
  const listeners: Array<[string, (...args: unknown[]) => void]> = [];

  if (opts.forwardIdentify) {
    const onIdentify = (...args: unknown[]): void => {
      const payload = normalizeIdentify(args);
      if (payload) forwardIdentify(payload);
    };
    analytics.on("identify", onIdentify);
    listeners.push(["identify", onIdentify]);
  }

  if (opts.forwardTrack) {
    const onTrack = (...args: unknown[]): void => {
      const payload = normalizeTrack(args);
      if (payload) forwardTrack(payload);
    };
    analytics.on("track", onTrack);
    listeners.push(["track", onTrack]);
  }

  return () => {
    for (const [event, listener] of listeners) {
      if (typeof analytics.off === "function") {
        analytics.off(event, listener);
      }
    }
  };
}
