import { callVisitor, findScript, removeScript } from "./loader.js";
import type { ConvorSDK } from "./types.js";

/** Internal state tracked per-init so we can return idempotent handles. */
interface InitState {
  /** The script URL we injected (used to find/remove the tag). */
  src: string;
  /** Strong ref to the script element we appended (for fast removal). */
  script: HTMLScriptElement | null;
  /** Resolved SDK handle. */
  sdk: ConvorSDK;
  /** Resolves once the embed loader is fully torn down. */
  destroyed: boolean;
}

let singleton: InitState | null = null;

/** For tests only: clear the singleton without touching the DOM. */
export function __resetSingleton(): void {
  singleton = null;
}

/** Build a fresh {@link ConvorSDK} handle. */
export function createSdk(): ConvorSDK {
  return {
    identify: (attrs) => callVisitor("identify", attrs),
    track: (event, props) => callVisitor("track", event, props),
    setAttributes: (attrs) => callVisitor("setAttributes", attrs),
    openChat: () => callVisitor("openChat"),
    closeChat: () => callVisitor("closeChat"),
    on: (event, cb) => callVisitor("on", event, cb),
    off: (event, cb) => callVisitor("off", event, cb),
    destroy: () => {
      callVisitor("destroy");
      const state = singleton;
      if (!state) return;
      removeScript(state.script);
      // `findScript` is a fallback in case the ref got detached elsewhere.
      const stale = findScript(state.src);
      removeScript(stale);
      state.destroyed = true;
      singleton = null;
    },
  };
}

/** Record and return the singleton state for a given init invocation. */
export function setState(state: InitState): InitState {
  singleton = state;
  return state;
}

/** Read the current singleton state (or `null` if never initialized/destroyed). */
export function getState(): InitState | null {
  return singleton;
}
