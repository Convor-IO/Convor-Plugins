import type {ConvorSDK} from "@convor/widget-sdk";

/**
 * Module-level singleton holding the most-recent SDK handle.
 *
 * The widget is a singleton by design (one embed script per page), so rather
 * than threading a React context + provider through every layout, we store the
 * handle at module scope. {@link useConvor} reads from here.
 *
 * Trade-off: this keeps the API tiny (no provider boilerplate) at the cost of
 * supporting multiple widgets on one page. Convor doesn't support multi-widget
 * embedding today, so that's an acceptable trade.
 */
let currentHandle: ConvorSDK | null = null;

/** Subscribers notified whenever the handle is set/cleared. */
const subscribers = new Set<(handle: ConvorSDK | null) => void>();

/** Update the singleton handle and notify subscribers. Internal use only. */
export function setHandle(handle: ConvorSDK | null): void {
  currentHandle = handle;
  for (const sub of subscribers) sub(handle);
}

/** Read the current SDK handle (or `null` if not initialized/destroyed). */
export function getHandle(): ConvorSDK | null {
  return currentHandle;
}

/** Subscribe to handle changes. Returns an unsubscribe function. */
export function subscribe(cb: (handle: ConvorSDK | null) => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/** For tests only: clear the module-level handle and listeners. */
export function __resetHandle(): void {
  currentHandle = null;
  subscribers.clear();
}

/** `console.warn` wrapper that stays silent in production. */
export function warn(message: string): void {
  if (
    typeof process !== "undefined" &&
    typeof process.env !== "undefined" &&
    process.env.NODE_ENV !== "production" &&
    typeof console !== "undefined" &&
    console.warn
  ) {
    console.warn(`[convor/react] ${message}`);
  }
}
