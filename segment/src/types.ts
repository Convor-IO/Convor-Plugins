/**
 * Options accepted by {@link initConvorSegmentBridge}.
 */
export interface ConvorSegmentBridgeOptions {
  /** Required organization slug (Settings → Widget in the Convor dashboard). */
  slug: string;
  /**
   * Base URL serving `widget.js`. Defaults to `https://cdn.convor.io`.
   * A trailing slash is trimmed.
   */
  apiBase?: string;
  /**
   * Forward `analytics.identify()` → `window.Convor.identify()`. Default `true`.
   */
  forwardIdentify?: boolean;
  /**
   * Forward `analytics.track()` → `window.Convor.track()`. Default `true`.
   */
  forwardTrack?: boolean;
  /**
   * Max time (ms) to wait for `window.Convor` to become ready after the embed
   * script is injected. Default `10000`.
   */
  widgetTimeoutMs?: number;
  /**
   * Max time (ms) to wait for `window.analytics` to become available if it
   * hasn't loaded yet when the bridge initializes. Default `15000`.
   */
  analyticsTimeoutMs?: number;
}

/**
 * The visitor SDK global exposed by the Convor embed loader, once ready. Only
 * the methods this bridge touches are declared here.
 */
export interface ConvorVisitorSDK {
  identify(attrs: Record<string, unknown>): void;
  track(event: string, props?: Record<string, unknown>): void;
  setAttributes(attrs: Record<string, unknown>): void;
}

/**
 * A registered event listener off `window.analytics`. Segment's analytics.js
 * exposes a `component-emitter`-style `on`/`off` pair.
 */
export interface AnalyticsEmitter {
  /**
   * Register a listener for a named event (`"identify"`, `"track"`, `"page"`,
   * …). The arguments passed to the callback mirror whatever the corresponding
   * analytics method was invoked with.
   *
   * Classic analytics.js (the snippet) emits raw method args, e.g.
   * `emit("identify", userId, traits, options)`. analytics-next
   * (`@segment/analytics-next`) emits a single context object instead. The
   * bridge normalizes both, so listeners should accept a variadic signature.
   */
  on(event: string, listener: (...args: unknown[]) => void): void;
  off?(event: string, listener: (...args: unknown[]) => void): void;
}

/**
 * The minimal slice of Segment's `window.analytics` this bridge relies on. The
 * real object has many more methods (`track`, `identify`, `page`, `alias`,
 * `group`, `ready`, `user`, …); we only type what we touch.
 */
export interface AnalyticsJS extends AnalyticsEmitter {
  /** Push a call onto the analytics queue (used by the snippet before load). */
  push(...args: unknown[]): void;
}

/**
 * Augment the global window so we can read Convor + Segment globals safely.
 */
declare global {
  interface Window {
    /** The visitor SDK global, exposed by the Convor embed loader once ready. */
    Convor?: ConvorVisitorSDK;
    /** Set by the embed loader once it has bootstrapped the visitor SDK. */
    ConvorWidget?: unknown;
    /** Segment's analytics.js global. */
    analytics?: AnalyticsJS;
  }
}
