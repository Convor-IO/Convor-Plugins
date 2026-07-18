import {act, cleanup, render} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {ConvorWidget} from "../ConvorWidget.js";
import {__resetHandle} from "../handle.js";

/**
 * Integration tests — render `<ConvorWidget>` and assert the REAL script-tag
 * injection path against the local widget dev server URL
 * (`http://localhost:5173`), instead of the faked `window.ConvorWidget` the
 * unit tests use.
 *
 * Scope note (same compromise as the widget-sdk integration suite):
 *   - The sandbox cannot reach `http://localhost:5173/widget.js` (connection
 *     refused), so URL reachability is intentionally skipped.
 *   - happy-dom does not execute fetched external scripts, so the embed
 *     loader's `window.ConvorWidget` global is released via
 *     `simulateReady()` to unblock the SDK readiness poll — the same
 *     technique the unit tests use, just driven through the real React
 *     effect lifecycle against the local URL.
 *
 * What IS asserted for real: the component mounts → injects the script tag
 * with the correct `src`/`data-key`/`async`, and unmounts → removes it,
 * all through the public React API.
 */

const LOCAL_API_BASE = "http://localhost:5173";
const LOCAL_WIDGET_SRC = `${LOCAL_API_BASE}/widget.js`;

function resetDom(): void {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  window.ConvorWidget = undefined;
  window.Convor = undefined;
  __resetHandle();
}

/** Release the SDK's `waitForReady` poll (the embed loader owns this global). */
function simulateReady(): void {
  window.ConvorWidget = {ready: true};
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

/** Flush the loader's readiness poll (50ms interval) + microtasks. */
async function flushReady(): Promise<void> {
  await new Promise((r) => setTimeout(r, 80));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("ConvorWidget — real DOM injection against local widget URL", () => {
  beforeEach(resetDom);
  afterEach(cleanup);

  it("injects the script tag with the local widget URL + data-key on mount", async () => {
    render(<ConvorWidget slug="acme" apiBase={LOCAL_API_BASE} />);
    setTimeout(simulateReady, 0);
    await flushReady();

    const tag = document.head.querySelector<HTMLScriptElement>(
      `script[src="${LOCAL_WIDGET_SRC}"]`
    );
    expect(tag, "script tag must be present in document.head").not.toBeNull();
    expect(tag?.getAttribute("src")).toBe(LOCAL_WIDGET_SRC);
    expect(tag?.dataset.key).toBe("acme");
    expect(tag?.async).toBe(true);
  });

  it("removes the script tag on unmount", async () => {
    const {unmount} = render(
      <ConvorWidget slug="acme" apiBase={LOCAL_API_BASE} />
    );
    setTimeout(simulateReady, 0);
    await flushReady();

    expect(
      document.head.querySelector(`script[src="${LOCAL_WIDGET_SRC}"]`)
    ).not.toBeNull();

    unmount();

    expect(
      document.head.querySelector(`script[src="${LOCAL_WIDGET_SRC}"]`)
    ).toBeNull();
  });
});
