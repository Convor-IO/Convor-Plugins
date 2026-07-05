/**
 * Tiny SSR guard. True when a `window`/`document` pair is available, i.e. we
 * are running in a browser (or a DOM emulation like jsdom/happy-dom).
 */
export const isBrowser =
  typeof window !== "undefined" && typeof document !== "undefined";

/** True when `process.env.NODE_ENV !== "production"`. */
export const isDev =
  typeof process !== "undefined" &&
  typeof process.env !== "undefined" &&
  process.env.NODE_ENV !== "production";

/** `console.warn` wrapper that stays silent in production. */
export function warn(message: string): void {
  if (isDev && typeof console !== "undefined" && console.warn) {
    console.warn(`[convor] ${message}`);
  }
}
