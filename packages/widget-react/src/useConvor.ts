import type { ConvorSDK } from "@convor/widget-sdk";
import { useSyncExternalStore } from "react";
import { getHandle, subscribe } from "./handle.js";

/**
 * Access the live Convor SDK handle from any child component.
 *
 * Returns the current {@link ConvorSDK} (or `null` while it's initializing /
 * after it's destroyed) and stays in sync via `useSyncExternalStore`. Use it to
 * trigger programmatic actions:
 *
 * ```tsx
 * function SupportButton() {
 *   const convor = useConvor();
 *   return <button onClick={() => convor?.openChat()}>Chat with us</button>;
 * }
 * ```
 *
 * **Why a module-level handle instead of React context?** The widget is a
 * singleton — there's exactly one embed script per page — so a provider adds
 * boilerplate without value. A module-level ref keeps the API tiny while still
 * being reactive. (See `handle.ts` for the full rationale.)
 *
 * @returns the current SDK handle, or `null` if not yet ready.
 */
export function useConvor(): ConvorSDK | null {
  return useSyncExternalStore(
    subscribe,
    getHandle,
    // SSR snapshot: the widget can't load on the server, so always null.
    () => null,
  );
}
