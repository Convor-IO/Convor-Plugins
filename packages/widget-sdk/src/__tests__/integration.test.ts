import { beforeEach, describe, expect, it } from "vitest";
import { initConvor } from "../index.js";
import { __resetSingleton } from "../sdk.js";

/**
 * Integration tests — exercise the REAL script-tag injection path against the
 * local widget dev server URL (`http://localhost:5173`), instead of the
 * faked `window.ConvorWidget` the unit tests use.
 *
 * Scope note: these tests prove the SDK does its one real DOM-side job —
 * inject `<script src="${apiBase}/widget.js" data-key="${slug}" async>` into
 * `document.head`, do it idempotently, and tear it down on `destroy()`. They
 * do NOT assert that the dev server actually serves a runnable `widget.js`:
 *
 *   - The sandbox this suite runs in cannot reach `http://localhost:5173`
 *     (`curl http://localhost:5173/widget.js` → connection refused), so URL
 *     reachability is intentionally skipped.
 *   - happy-dom does not execute fetched external scripts anyway, so even a
 *     reachable server would not define `window.ConvorWidget`. The embed
 *     loader (the contents of `widget.js`) owns that global — the SDK only
 *     polls for it. We release the poll with `simulateReady()`, which is the
 *     same compromise the unit tests make.
 *
 * What IS asserted for real: the script tag's `src`, `data-key`, `async`,
 * placement in `document.head`, idempotency, and `destroy()` cleanup — all
 * driven through the public `initConvor()` API against the local URL.
 */

const LOCAL_API_BASE = "http://localhost:5173";
const LOCAL_WIDGET_SRC = `${LOCAL_API_BASE}/widget.js`;

function resetDom(): void {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  window.ConvorWidget = undefined;
  window.Convor = undefined;
  __resetSingleton();
}

/** Release the SDK's `waitForReady` poll. See scope note above. */
function simulateReady(): void {
  window.ConvorWidget = { ready: true };
  window.Convor = {
    init: () => {},
    identify: () => {},
    track: () => {},
    setAttributes: () => {},
    openChat: () => {},
    closeChat: () => {},
    on: () => {},
    off: () => {},
    destroy: () => {},
  };
}

describe("initConvor — real DOM injection against local widget URL", () => {
  beforeEach(resetDom);

  it("injects a script tag into document.head with the local widget URL + data-key", async () => {
    const ready = initConvor({ slug: "acme", apiBase: LOCAL_API_BASE });
    setTimeout(simulateReady, 0);
    await ready;

    const tag = document.head.querySelector<HTMLScriptElement>(
      `script[src="${LOCAL_WIDGET_SRC}"]`,
    );
    expect(tag, "script tag must be present in document.head").not.toBeNull();
    // Canonical form asserted inline (no shared snippet helper for the local URL).
    expect(tag?.getAttribute("src")).toBe(LOCAL_WIDGET_SRC);
    expect(tag?.dataset.key).toBe("acme");
    expect(tag?.async).toBe(true);
    expect(tag?.parentNode).toBe(document.head);
  });

  it("does not inject a second script tag when called twice (idempotency)", async () => {
    const first = initConvor({ slug: "acme", apiBase: LOCAL_API_BASE });
    setTimeout(simulateReady, 0);
    await first;

    const second = await initConvor({
      slug: "acme",
      apiBase: LOCAL_API_BASE,
    });
    expect(second).toBeDefined();

    const scripts = document.head.querySelectorAll<HTMLScriptElement>(
      `script[src="${LOCAL_WIDGET_SRC}"]`,
    );
    expect(scripts.length, "exactly one script tag after two calls").toBe(1);
  });

  it("removes the script tag on destroy()", async () => {
    const ready = initConvor({ slug: "acme", apiBase: LOCAL_API_BASE });
    setTimeout(simulateReady, 0);
    const sdk = await ready;

    expect(
      document.head.querySelector(`script[src="${LOCAL_WIDGET_SRC}"]`),
    ).not.toBeNull();

    sdk.destroy();

    expect(
      document.head.querySelector(`script[src="${LOCAL_WIDGET_SRC}"]`),
    ).toBeNull();
  });
});
