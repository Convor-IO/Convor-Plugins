import type {ConvorPosition, ConvorSDK, ConvorTheme} from "@convor/widget-sdk";
import {initConvor} from "@convor/widget-sdk";
import {useEffect, useRef} from "react";
import {setHandle, warn} from "./handle.js";

/** Props accepted by {@link ConvorWidget}. */
export interface ConvorWidgetProps {
  /** Required organization slug (Settings → Widget). */
  slug: string;
  /** Base URL serving widget.js. Defaults to the Convor CDN. */
  apiBase?: string;
  /** Primary color override. Server config wins for unset fields. */
  primaryColor?: string;
  /** Position override. Server config wins for unset fields. */
  position?: ConvorPosition;
  /** Theme override. Server config wins for unset fields. */
  theme?: ConvorTheme;
  /** Max ms to wait for window.ConvorWidget. */
  timeoutMs?: number;
  /** Rendered into the host component; the widget itself injects an iframe. */
  children?: React.ReactNode;
}

/**
 * Embeds the Convor live-chat widget on mount.
 *
 * - Calls {@link initConvor} inside a `useEffect`, stores the SDK handle in a
 *   ref, and calls `destroy()` on unmount.
 * - **Stable.** It does not re-init on every render. Only a `slug` change
 *   triggers a teardown + re-init; other prop changes mid-mount are ignored
 *   with a dev warning, because the embed script is keyed by `slug` and
 *   appearance config is owned server-side.
 * - Renders no DOM of its own (the widget injects its own iframe); any
 *   `children` you pass are rendered as-is, which is handy for layouts.
 *
 * Child components can grab the SDK handle via {@link useConvor}.
 *
 * @example
 * ```tsx
 * // in app/layout.tsx or a footer component
 * <ConvorWidget slug="my-org" />
 * ```
 */
export function ConvorWidget(props: ConvorWidgetProps): React.ReactElement {
  const handleRef = useRef<ConvorSDK | null>(null);
  const slugRef = useRef<string>(props.slug);

  // Intentionally only re-init when the slug changes. See component docs:
  // appearance config is owned server-side, so other prop changes mid-mount
  // are surfaced as a dev warning rather than triggering a teardown.
  // biome-ignore lint/correctness/useExhaustiveDependencies: slug-driven lifecycle
  useEffect(() => {
    let cancelled = false;
    slugRef.current = props.slug;

    initConvor({
      slug: props.slug,
      apiBase: props.apiBase,
      primaryColor: props.primaryColor,
      position: props.position,
      theme: props.theme,
      timeoutMs: props.timeoutMs,
    })
      .then((sdk) => {
        if (cancelled) {
          // Component unmounted while we were initializing — clean up.
          sdk.destroy();
          return;
        }
        handleRef.current = sdk;
        setHandle(sdk);
      })
      .catch((error: unknown) => {
        // Don't throw into an unmounted component; log so devs notice.
        warn(`initConvor failed: ${(error as Error)?.message ?? error}`);
      });

    return () => {
      cancelled = true;
      const sdk = handleRef.current;
      if (sdk) {
        sdk.destroy();
        handleRef.current = null;
        setHandle(null);
      }
    };
  }, [props.slug]);

  // Surface mid-mount appearance changes in dev without re-initializing.
  const changedRef = useRef({
    apiBase: props.apiBase,
    primaryColor: props.primaryColor,
    position: props.position,
    theme: props.theme,
  });
  useEffect(() => {
    const prev = changedRef.current;
    if (
      prev.apiBase !== props.apiBase ||
      prev.primaryColor !== props.primaryColor ||
      prev.position !== props.position ||
      prev.theme !== props.theme
    ) {
      warn(
        "ConvorWidget appearance props changed after mount — these are ignored. " +
          "Unmount/remount the component (or change `slug`) to apply new overrides."
      );
      changedRef.current = {
        apiBase: props.apiBase,
        primaryColor: props.primaryColor,
        position: props.position,
        theme: props.theme,
      };
    }
  }, [props.apiBase, props.primaryColor, props.position, props.theme]);

  return <>{props.children ?? null}</>;
}
