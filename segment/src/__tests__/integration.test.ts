import { beforeEach, describe, expect, it } from "vitest";
import { __resetBridge, initConvorSegmentBridge } from "../index.js";
import type { AnalyticsJS } from "../types.js";

// Integration tests — exercise the REAL script-tag injection path of the
// Segment bridge against the local widget dev server URL
// (http://localhost:5173), instead of the faked globals the unit tests use.
//
// Scope note (same compromise as the widget-sdk / widget-react suites):
//   - The sandbox cannot reach http://localhost:5173/widget.js (connection
//     refused), so URL reachability is intentionally skipped.
//   - happy-dom does not execute fetched external scripts, so the embed
//     loader global window.Convor is released via simulateConvorReady() to
//     unblock the bridge readiness poll — same technique the unit tests use,
//     but driven through the real initConvorSegmentBridge() against the
//     local URL.
//
// What IS asserted for real:
//   - The bridge injects the widget script tag with the local URL + data-key
//     through the public initConvorSegmentBridge() API.
//   - A real component-emitter-style analytics.on("identify", ...) listener
//     is attached and forwards into window.Convor.identify when a synthetic
//     identify event is emitted.

const LOCAL_API_BASE = "http://localhost:5173";
const LOCAL_WIDGET_SRC = `${LOCAL_API_BASE}/widget.js`;

// Minimal component-emitter-style analytics stub (mirrors the unit tests).
function makeAnalytics(): AnalyticsJS & {
  emit: (event: string, ...args: unknown[]) => void;
} {
  const listeners = new Map<string, Array<(...a: unknown[]) => void>>();
  return {
    push: () => {},
    on: (event, cb) => {
      const list = listeners.get(event) ?? [];
      list.push(cb);
      listeners.set(event, list);
    },
    off: (event, cb) => {
      const list = listeners.get(event);
      if (!list) return;
      const idx = list.indexOf(cb);
      if (idx >= 0) list.splice(idx, 1);
    },
    emit: (event, ...args) => {
      for (const cb of listeners.get(event) ?? []) cb(...args);
    },
  };
}

function resetDom(): void {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  window.Convor = undefined;
  window.ConvorWidget = undefined;
  window.analytics = undefined;
  __resetBridge();
}

// Release the bridge waitForConvor poll.
function simulateConvorReady(
  impl: Partial<{ identify: (a: Record<string, unknown>) => void }> = {},
): void {
  window.Convor = {
    identify: impl.identify ?? (() => {}),
    track: () => {},
    setAttributes: () => {},
  };
}

describe("initConvorSegmentBridge — real DOM injection against local widget URL", () => {
  beforeEach(resetDom);

  it("injects the widget script tag with the local URL + data-key", async () => {
    window.analytics = makeAnalytics();

    const ready = initConvorSegmentBridge({
      slug: "acme",
      apiBase: LOCAL_API_BASE,
    });
    setTimeout(() => simulateConvorReady(), 0);
    await ready;

    const tag = document.head.querySelector<HTMLScriptElement>(
      `script[src="${LOCAL_WIDGET_SRC}"]`,
    );
    expect(
      tag,
      "widget script tag must be present in document.head",
    ).not.toBeNull();
    expect(tag?.getAttribute("src")).toBe(LOCAL_WIDGET_SRC);
    expect(tag?.dataset.key).toBe("acme");
    expect(tag?.async).toBe(true);
  });

  it("forwards a synthetic analytics.identify event into window.Convor.identify", async () => {
    const analytics = makeAnalytics();
    window.analytics = analytics;

    const spy: Array<Record<string, unknown>> = [];
    const ready = initConvorSegmentBridge({
      slug: "acme",
      apiBase: LOCAL_API_BASE,
    });
    setTimeout(() => simulateConvorReady({ identify: (a) => spy.push(a) }), 0);
    await ready;

    // Sanity: the script tag is still the one we injected (not duplicated by
    // the forward path).
    const scripts = document.head.querySelectorAll<HTMLScriptElement>(
      `script[src="${LOCAL_WIDGET_SRC}"]`,
    );
    expect(scripts.length).toBe(1);

    // Emit a classic analytics.js identify event.
    analytics.emit(
      "identify",
      "user-42",
      { email: "x@y.com", plan: "pro" },
      {},
    );

    expect(spy, "Convor.identify must be called exactly once").toHaveLength(1);
    expect(spy[0]).toEqual({
      userId: "user-42",
      email: "x@y.com",
      plan: "pro",
    });
  });
});
