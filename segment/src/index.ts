import {
  attachForwarders,
  buildScriptUrl,
  DEFAULT_ANALYTICS_TIMEOUT_MS,
  DEFAULT_API_BASE,
  DEFAULT_WIDGET_TIMEOUT_MS,
  findScript,
  injectScript,
  waitForAnalytics,
  waitForConvor,
} from "./analytics-source.js";
import type {ConvorSegmentBridgeOptions} from "./types.js";

export type {IdentifyPayload, TrackPayload} from "./analytics-source.js";
export {
  attachForwarders,
  buildScriptUrl,
  DEFAULT_ANALYTICS_TIMEOUT_MS,
  DEFAULT_API_BASE,
  DEFAULT_WIDGET_TIMEOUT_MS,
  findScript,
  injectScript,
  normalizeIdentify,
  normalizeTrack,
  waitForAnalytics,
  waitForConvor,
} from "./analytics-source.js";
export type {
  AnalyticsEmitter,
  AnalyticsJS,
  ConvorSegmentBridgeOptions,
  ConvorVisitorSDK,
} from "./types.js";

/** Internal state tracked per-init so re-init is a no-op. */
interface BridgeState {
  /** The script URL we injected (matched for idempotency). */
  src: string;
  /** Detach handle returned by {@link attachForwarders}. */
  detach: () => void;
}

let singleton: BridgeState | null = null;

/** For tests only: clear the singleton without detaching listeners. */
export function __resetBridge(): void {
  singleton = null;
}

/**
 * Initialize the Convor ↔ Segment analytics.js bridge.
 *
 * Behavior:
 * 1. Injects the Convor embed script
 *    (`<script src="<apiBase>/widget.js" data-key="<slug>" async>`) into
 *    `document.head` — idempotent: a pre-existing tag is reused.
 * 2. Waits for the visitor SDK global `window.Convor` to be ready (poll).
 * 3. Waits for Segment's `window.analytics` to be available (poll; this also
 *    covers the case where the analytics.js snippet hasn't finished loading
 *    yet — its stub queue is sufficient once `.on` exists).
 * 4. Subscribes `analytics.on("identify", …)` and `analytics.on("track", …)`
 *    listeners that forward into `window.Convor.identify()` / `.track()`.
 *
 * The listeners normalize **both** Segment runtimes:
 * - classic analytics.js (emits raw method args), and
 * - analytics-next (emits a single context object).
 *
 * SSR-safe: rejects with a clear error when `window`/`document` are missing.
 *
 * @example
 * ```ts
 * import { initConvorSegmentBridge } from "@convor/segment-bridge";
 *
 * await initConvorSegmentBridge({ slug: "my-org" });
 * // analytics.identify(...) and analytics.track(...) now flow into Convor.
 * ```
 */
export async function initConvorSegmentBridge(
  options: ConvorSegmentBridgeOptions
): Promise<void> {
  if (!options || !options.slug) {
    throw new Error(
      "[convor-segment] initConvorSegmentBridge requires a `slug` option"
    );
  }

  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error(
      "[convor-segment] initConvorSegmentBridge must be called in a browser " +
        "environment (window/document are undefined). Guard with a " +
        '`typeof window !== "undefined"` check when running on the server.'
    );
  }

  // Idempotency: a bridge for this src is already attached.
  const apiBase = options.apiBase ?? DEFAULT_API_BASE;
  const src = buildScriptUrl(apiBase);
  if (singleton && findScript(src)) {
    return;
  }

  const widgetTimeoutMs = options.widgetTimeoutMs ?? DEFAULT_WIDGET_TIMEOUT_MS;
  const analyticsTimeoutMs =
    options.analyticsTimeoutMs ?? DEFAULT_ANALYTICS_TIMEOUT_MS;
  const forwardIdentify = options.forwardIdentify ?? true;
  const forwardTrack = options.forwardTrack ?? true;

  // 1. Inject the widget script (reuses an existing tag if present).
  injectScript(src, options.slug);

  // 2 + 3. Wait for both globals in parallel.
  const [analytics] = await Promise.all([
    waitForAnalytics(analyticsTimeoutMs),
    waitForConvor(widgetTimeoutMs),
  ]);

  // 4. Attach the forwarding listeners.
  const detach = attachForwarders(analytics, {forwardIdentify, forwardTrack});
  singleton = {src, detach};
}

/**
 * Tear down an initialized bridge: detaches the Segment listeners. The widget
 * script tag is left in place (the Convor widget keeps running); call the
 * widget SDK's `destroy()` separately if you want to remove it.
 */
export function teardownConvorSegmentBridge(): void {
  const state = singleton;
  if (!state) return;
  state.detach();
  singleton = null;
}
