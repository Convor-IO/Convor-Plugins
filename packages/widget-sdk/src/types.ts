/**
 * Widget position override. Server-side config still wins for unset fields.
 */
export type ConvorPosition =
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left"
  | "center";

/**
 * Widget color theme override. Server-side config still wins for unset fields.
 */
export type ConvorTheme = "light" | "dark" | "auto";

/**
 * Options accepted by {@link initConvor}.
 */
export interface ConvorOptions {
  /** Required organization slug (visible in the dashboard under Settings → Widget). */
  slug: string;
  /** Base URL serving `widget.js`. Defaults to `https://cdn.convor.io`. */
  apiBase?: string;
  /** Primary color override, passed as `data-primary-color`. Server config wins if unset. */
  primaryColor?: string;
  /** Position override, passed as `data-position`. Server config wins if unset. */
  position?: ConvorPosition;
  /** Theme override, passed as `data-theme`. Server config wins if unset. */
  theme?: ConvorTheme;
  /** Max time (ms) to wait for the embed loader to expose `window.Convor`. Default `10000`. */
  timeoutMs?: number;
}

/**
 * The shape of the canonical browser API exposed by the embed loader.
 * The npm SDK is a thin, typed pass-through over these methods.
 */
export interface ConvorVisitorSDK {
  init(options: Record<string, unknown>): void;
  identify(attrs: Record<string, unknown>): void;
  track(event: string, props?: Record<string, unknown>): void;
  setAttributes(attrs: Record<string, unknown>): void;
  openChat(): void;
  closeChat(): void;
  on(event: string, cb: (...args: unknown[]) => void): void;
  off(event: string, cb: (...args: unknown[]) => void): void;
  destroy(): void;
}

/**
 * Handle returned by {@link initConvor}. The pass-through methods forward to the
 * live visitor SDK global (`window.Convor`); when that global is not ready yet
 * (or has been destroyed) they no-op and log a warning in development.
 */
export interface ConvorSDK {
  /** Remove the injected script tag and call `destroy()` on the visitor SDK if present. */
  destroy(): void;
  /** Forward to `window.Convor.identify`. */
  identify(attrs: Record<string, unknown>): void;
  /** Forward to `window.Convor.track`. */
  track(event: string, props?: Record<string, unknown>): void;
  /** Forward to `window.Convor.setAttributes`. */
  setAttributes(attrs: Record<string, unknown>): void;
  /** Forward to `window.Convor.openChat`. */
  openChat(): void;
  /** Forward to `window.Convor.closeChat`. */
  closeChat(): void;
  /** Forward to `window.Convor.on`. */
  on(event: string, cb: (...args: unknown[]) => void): void;
  /** Forward to `window.Convor.off`. */
  off(event: string, cb: (...args: unknown[]) => void): void;
}

/**
 * Augment the global window with the canonical browser API.
 */
declare global {
  interface Window {
    /** The canonical browser API exposed by the embed loader. */
    Convor?: ConvorVisitorSDK;
  }
}
