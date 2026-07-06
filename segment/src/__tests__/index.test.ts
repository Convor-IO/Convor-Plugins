import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetBridge,
  DEFAULT_API_BASE,
  initConvorSegmentBridge,
  normalizeIdentify,
  normalizeTrack,
  teardownConvorSegmentBridge,
} from "../index.js";
import type { AnalyticsJS, ConvorVisitorSDK } from "../types.js";

const WIDGET_SRC = `${DEFAULT_API_BASE}/widget.js`;

/** Minimal component-emitter-style analytics stub for tests. */
function makeAnalytics(): AnalyticsJS & {
  emit: (event: string, ...args: unknown[]) => void;
  listeners: Map<string, Array<(...a: unknown[]) => void>>;
} {
  const listeners = new Map<string, Array<(...a: unknown[]) => void>>();
  return {
    listeners,
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

/** Pretend the Convor embed loader has booted. */
function simulateConvorReady(impl: Partial<ConvorVisitorSDK> = {}): void {
  window.ConvorWidget = { ready: true };
  window.Convor = {
    identify: impl.identify ?? (() => {}),
    track: impl.track ?? (() => {}),
    setAttributes: impl.setAttributes ?? (() => {}),
  };
}

describe("buildScriptUrl (via export)", () => {
  it("trims a trailing slash and appends /widget.js", async () => {
    const { buildScriptUrl } = await import("../index.js");
    expect(buildScriptUrl("https://cdn.convor.io")).toBe(WIDGET_SRC);
    expect(buildScriptUrl("https://cdn.convor.io/")).toBe(WIDGET_SRC);
    expect(buildScriptUrl("https://cdn.convor.io///")).toBe(WIDGET_SRC);
  });
});

describe("normalizeIdentify", () => {
  it("parses classic analytics.js args: (userId, traits, options)", () => {
    const payload = normalizeIdentify(["user-123", { email: "a@b.com" }, {}]);
    expect(payload).toEqual({
      userId: "user-123",
      traits: { email: "a@b.com" },
    });
  });

  it("parses classic args when userId is null (anonymous identify)", () => {
    const payload = normalizeIdentify([null, { name: "Anon" }]);
    expect(payload?.traits).toEqual({ name: "Anon" });
  });

  it("parses analytics-next ctx object with nested event", () => {
    const ctx = {
      type: "identify",
      event: {
        type: "identify",
        userId: "user-9",
        traits: { plan: "pro" },
      },
    };
    const payload = normalizeIdentify([ctx]);
    expect(payload).toEqual({ userId: "user-9", traits: { plan: "pro" } });
  });

  it("returns null for empty args", () => {
    expect(normalizeIdentify([])).toBeNull();
  });
});

describe("normalizeTrack", () => {
  it("parses classic analytics.js args: (event, properties, options)", () => {
    const payload = normalizeTrack(["signup", { plan: "pro" }, {}]);
    expect(payload).toEqual({ event: "signup", properties: { plan: "pro" } });
  });

  it("parses analytics-next ctx object with nested event", () => {
    const ctx = {
      type: "track",
      event: {
        type: "track",
        event: "checkout",
        properties: { total: 42 },
      },
    };
    const payload = normalizeTrack([ctx]);
    expect(payload).toEqual({ event: "checkout", properties: { total: 42 } });
  });

  it("returns null when the classic first arg is not a string", () => {
    expect(normalizeTrack([42])).toBeNull();
  });

  it("returns null for empty args", () => {
    expect(normalizeTrack([])).toBeNull();
  });
});

describe("initConvorSegmentBridge — injection", () => {
  beforeEach(resetDom);

  it("injects the Convor script tag with data-key", async () => {
    const analytics = makeAnalytics();
    window.analytics = analytics;

    const ready = initConvorSegmentBridge({ slug: "acme" });
    setTimeout(() => simulateConvorReady(), 0);
    await ready;

    const scripts = Array.from(
      document.head.querySelectorAll<HTMLScriptElement>("script"),
    );
    expect(scripts.length).toBe(1);
    expect(scripts[0]?.src).toBe(WIDGET_SRC);
    expect(scripts[0]?.async).toBe(true);
    expect(scripts[0]?.getAttribute("data-key")).toBe("acme");
  });

  it("rejects when no slug is supplied", async () => {
    window.analytics = makeAnalytics();
    await expect(
      // @ts-expect-error exercising the runtime guard with a missing slug
      initConvorSegmentBridge({}),
    ).rejects.toThrow(/slug/);
  });

  it("rejects when window.Convor never becomes ready", async () => {
    window.analytics = makeAnalytics();
    await expect(
      initConvorSegmentBridge({ slug: "acme", widgetTimeoutMs: 60 }),
    ).rejects.toThrow(/window\.Convor/);
  });

  it("rejects when window.analytics is never available", async () => {
    // Convor is ready, but analytics.js never loads.
    simulateConvorReady();
    await expect(
      initConvorSegmentBridge({ slug: "acme", analyticsTimeoutMs: 60 }),
    ).rejects.toThrow(/window\.analytics/);
  });
});

describe("initConvorSegmentBridge — forwarding (classic analytics.js)", () => {
  beforeEach(resetDom);

  it("forwards analytics.identify → window.Convor.identify", async () => {
    const analytics = makeAnalytics();
    window.analytics = analytics;

    const spy: Array<Record<string, unknown>> = [];
    const ready = initConvorSegmentBridge({ slug: "acme" });
    setTimeout(() => simulateConvorReady({ identify: (a) => spy.push(a) }), 0);
    await ready;

    // Classic emit: (userId, traits, options).
    analytics.emit("identify", "user-1", { email: "x@y.com", name: "Sam" }, {});

    expect(spy).toHaveLength(1);
    expect(spy[0]).toEqual({
      userId: "user-1",
      email: "x@y.com",
      name: "Sam",
    });
  });

  it("forwards analytics.track → window.Convor.track", async () => {
    const analytics = makeAnalytics();
    window.analytics = analytics;

    const spy: Array<{ event: string; props?: Record<string, unknown> }> = [];
    const ready = initConvorSegmentBridge({ slug: "acme" });
    setTimeout(
      () =>
        simulateConvorReady({
          track: (event, props) => spy.push({ event, props }),
        }),
      0,
    );
    await ready;

    // Classic emit: (event, properties, options).
    analytics.emit("track", "added_to_cart", { sku: "abc", qty: 2 }, {});

    expect(spy).toEqual([
      { event: "added_to_cart", props: { sku: "abc", qty: 2 } },
    ]);
  });

  it("respects forwardIdentify: false", async () => {
    const analytics = makeAnalytics();
    window.analytics = analytics;

    let identifyCalls = 0;
    let trackCalls = 0;
    const ready = initConvorSegmentBridge({
      slug: "acme",
      forwardIdentify: false,
    });
    setTimeout(
      () =>
        simulateConvorReady({
          identify: () => identifyCalls++,
          track: () => trackCalls++,
        }),
      0,
    );
    await ready;

    analytics.emit("identify", "u", {});
    analytics.emit("track", "e", {});
    expect(identifyCalls).toBe(0);
    expect(trackCalls).toBe(1);
  });

  it("respects forwardTrack: false", async () => {
    const analytics = makeAnalytics();
    window.analytics = analytics;

    let identifyCalls = 0;
    let trackCalls = 0;
    const ready = initConvorSegmentBridge({
      slug: "acme",
      forwardTrack: false,
    });
    setTimeout(
      () =>
        simulateConvorReady({
          identify: () => identifyCalls++,
          track: () => trackCalls++,
        }),
      0,
    );
    await ready;

    analytics.emit("identify", "u", {});
    analytics.emit("track", "e", {});
    expect(identifyCalls).toBe(1);
    expect(trackCalls).toBe(0);
  });
});

describe("initConvorSegmentBridge — forwarding (analytics-next ctx)", () => {
  beforeEach(resetDom);

  it("forwards analytics-next identify ctx → window.Convor.identify", async () => {
    const analytics = makeAnalytics();
    window.analytics = analytics;

    const spy: Array<Record<string, unknown>> = [];
    const ready = initConvorSegmentBridge({ slug: "acme" });
    setTimeout(() => simulateConvorReady({ identify: (a) => spy.push(a) }), 0);
    await ready;

    // analytics-next emits a single context object.
    analytics.emit("identify", {
      type: "identify",
      event: { type: "identify", userId: "u-7", traits: { tier: "gold" } },
    });

    expect(spy).toEqual([{ userId: "u-7", tier: "gold" }]);
  });

  it("forwards analytics-next track ctx → window.Convor.track", async () => {
    const analytics = makeAnalytics();
    window.analytics = analytics;

    const spy: Array<{ event: string; props?: Record<string, unknown> }> = [];
    const ready = initConvorSegmentBridge({ slug: "acme" });
    setTimeout(
      () =>
        simulateConvorReady({
          track: (event, props) => spy.push({ event, props }),
        }),
      0,
    );
    await ready;

    analytics.emit("track", {
      type: "track",
      event: {
        type: "track",
        event: "purchase",
        properties: { revenue: 99.5 },
      },
    });

    expect(spy).toEqual([{ event: "purchase", props: { revenue: 99.5 } }]);
  });
});

describe("initConvorSegmentBridge — waits for late analytics.js", () => {
  beforeEach(resetDom);

  it("attaches listeners once window.analytics appears later", async () => {
    // Convor is ready immediately, analytics.js is not yet on the page.
    simulateConvorReady();

    const ready = initConvorSegmentBridge({ slug: "acme" });
    // analytics.js loads after a tick.
    setTimeout(() => {
      window.analytics = makeAnalytics();
    }, 0);
    await ready;

    const spy: string[] = [];
    window.Convor = {
      ...(window.Convor as ConvorVisitorSDK),
      track: (event) => spy.push(event),
    };

    const a = window.analytics as ReturnType<typeof makeAnalytics>;
    a.emit("track", "late_event", {});
    expect(spy).toEqual(["late_event"]);
  });
});

describe("initConvorSegmentBridge — idempotency", () => {
  beforeEach(resetDom);

  it("does not inject a second script when called twice", async () => {
    window.analytics = makeAnalytics();
    const first = initConvorSegmentBridge({ slug: "acme" });
    setTimeout(() => simulateConvorReady(), 0);
    await first;

    await initConvorSegmentBridge({ slug: "acme" });

    const scripts = document.head.querySelectorAll<HTMLScriptElement>(
      `script[src="${WIDGET_SRC}"]`,
    );
    expect(scripts.length).toBe(1);
  });

  it("reuses an existing snippet script tag", async () => {
    const pre = document.createElement("script");
    pre.src = WIDGET_SRC;
    pre.async = true;
    pre.setAttribute("data-key", "acme");
    document.head.appendChild(pre);

    window.analytics = makeAnalytics();
    setTimeout(() => simulateConvorReady(), 0);
    await initConvorSegmentBridge({ slug: "acme" });

    const scripts = document.head.querySelectorAll<HTMLScriptElement>(
      `script[src="${WIDGET_SRC}"]`,
    );
    expect(scripts.length).toBe(1);
  });
});

describe("teardownConvorSegmentBridge", () => {
  beforeEach(resetDom);

  it("detaches listeners so forwards stop", async () => {
    const analytics = makeAnalytics();
    window.analytics = analytics;

    let trackCalls = 0;
    const ready = initConvorSegmentBridge({ slug: "acme" });
    setTimeout(() => simulateConvorReady({ track: () => trackCalls++ }), 0);
    await ready;

    analytics.emit("track", "before", {});
    expect(trackCalls).toBe(1);

    teardownConvorSegmentBridge();
    analytics.emit("track", "after", {});
    expect(trackCalls).toBe(1);
  });

  it("is a no-op when nothing was initialized", () => {
    expect(() => teardownConvorSegmentBridge()).not.toThrow();
  });
});

describe("initConvorSegmentBridge — SSR guard", () => {
  beforeEach(resetDom);

  it("rejects with a clear error when window/document are unavailable", async () => {
    const savedWindow = globalThis.window;
    const savedDocument = globalThis.document;
    (globalThis as { window?: typeof savedWindow }).window = undefined;
    (globalThis as { document?: typeof savedDocument }).document = undefined;

    await expect(initConvorSegmentBridge({ slug: "acme" })).rejects.toThrow(
      /browser environment/,
    );

    globalThis.window = savedWindow;
    globalThis.document = savedDocument;
  });
});
