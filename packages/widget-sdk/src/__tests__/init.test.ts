import {beforeEach, describe, expect, it, vi} from "vitest";
import {DEFAULT_API_BASE, initConvor} from "../index.js";
import {buildDataAttrs, buildScriptUrl} from "../loader.js";
import {__resetSingleton} from "../sdk.js";

const WIDGET_SRC = `${DEFAULT_API_BASE}/widget.js`;

function resetDom(): void {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  window.ConvorWidget = undefined;
  window.Convor = undefined;
  __resetSingleton();
}

/** Pretend the embed loader has booted, then resolve the next ready-poll. */
function simulateReady(): void {
  // Define ConvorWidget as a truthy marker; provide a Convor visitor SDK stub.
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

describe("buildScriptUrl", () => {
  it("appends /widget.js and trims a trailing slash", () => {
    expect(buildScriptUrl("https://cdn.convor.io")).toBe(
      "https://cdn.convor.io/widget.js"
    );
    expect(buildScriptUrl("https://cdn.convor.io/")).toBe(WIDGET_SRC);
    expect(buildScriptUrl("https://cdn.convor.io///")).toBe(WIDGET_SRC);
  });
});

describe("buildDataAttrs", () => {
  it("always includes data-key", () => {
    expect(buildDataAttrs({slug: "acme"})).toEqual({"data-key": "acme"});
  });

  it("includes appearance overrides only when set", () => {
    expect(
      buildDataAttrs({
        slug: "acme",
        primaryColor: "#3b82f6",
        position: "bottom-right",
        theme: "dark",
      })
    ).toEqual({
      "data-key": "acme",
      "data-primary-color": "#3b82f6",
      "data-position": "bottom-right",
      "data-theme": "dark",
    });
  });
});

describe("initConvor — injection", () => {
  beforeEach(resetDom);

  it("injects a script tag into document.head with the right attrs", async () => {
    const ready = initConvor({slug: "acme"});
    // Resolve the loader's readiness poll.
    setTimeout(simulateReady, 0);
    await ready;

    const scripts = Array.from(
      document.head.querySelectorAll<HTMLScriptElement>("script")
    );
    expect(scripts.length).toBe(1);
    const script = scripts[0];
    expect(script?.src).toBe(WIDGET_SRC);
    expect(script?.async).toBe(true);
    expect(script?.getAttribute("data-key")).toBe("acme");
  });

  it("builds the injected script URL from a custom apiBase", async () => {
    const apiBase = "http://localhost:5173";
    const ready = initConvor({apiBase, slug: "acme"});
    setTimeout(simulateReady, 0);

    await ready;

    const script = document.head.querySelector<HTMLScriptElement>("script");
    expect(script?.src).toBe(`${apiBase}/widget.js`);
    expect(script?.dataset.key).toBe("acme");
    expect(script?.parentNode).toBe(document.head);
  });

  it("rejects when no slug is supplied", async () => {
    await expect(
      // @ts-expect-error exercising the runtime guard with a missing slug
      initConvor({})
    ).rejects.toThrow(/slug/);
  });

  it("forwards pass-through calls to window.Convor once ready", async () => {
    const ready = initConvor({slug: "acme"});
    setTimeout(simulateReady, 0);
    const sdk = await ready;

    const spy: string[] = [];
    const base = window.Convor;
    window.Convor = {
      ...base,
      openChat: () => spy.push("open"),
      track: (event) => spy.push(`track:${event}`),
    } as typeof base;
    sdk.openChat();
    sdk.track("signup", {plan: "pro"});
    expect(spy).toEqual(["open", "track:signup"]);
  });
});

describe("initConvor — idempotency", () => {
  beforeEach(resetDom);

  it("does not inject a second script when called twice with the same src", async () => {
    const first = initConvor({slug: "acme"});
    setTimeout(simulateReady, 0);
    const sdk1 = await first;

    // Second call should reuse the existing script tag.
    const sdk2 = await initConvor({slug: "acme"});
    expect(sdk2).toBe(sdk1);

    const scripts = document.head.querySelectorAll<HTMLScriptElement>(
      `script[src="${WIDGET_SRC}"]`
    );
    expect(scripts.length).toBe(1);
  });

  it("reuses an existing snippet script tag even if SDK did not inject it", async () => {
    // Host page already dropped in the canonical snippet.
    const pre = document.createElement("script");
    pre.src = WIDGET_SRC;
    pre.async = true;
    pre.setAttribute("data-key", "acme");
    document.head.appendChild(pre);

    setTimeout(simulateReady, 0);
    const sdk = await initConvor({slug: "acme"});
    expect(sdk).toBeDefined();

    const scripts = document.head.querySelectorAll<HTMLScriptElement>(
      `script[src="${WIDGET_SRC}"]`
    );
    expect(scripts.length).toBe(1);
  });
});

describe("initConvor — destroy", () => {
  beforeEach(resetDom);

  it("removes the injected script tag on destroy", async () => {
    const ready = initConvor({slug: "acme"});
    setTimeout(simulateReady, 0);
    const sdk = await ready;

    expect(
      document.head.querySelector(`script[src="${WIDGET_SRC}"]`)
    ).not.toBeNull();

    sdk.destroy();

    expect(
      document.head.querySelector(`script[src="${WIDGET_SRC}"]`)
    ).toBeNull();
  });

  it("destroys the visitor and script exactly once", async () => {
    const ready = initConvor({slug: "acme"});
    setTimeout(simulateReady, 0);
    const sdk = await ready;
    const visitorDestroy = vi.fn();
    if (!window.Convor) throw new Error("visitor SDK was not initialized");
    window.Convor.destroy = visitorDestroy;

    sdk.destroy();
    sdk.destroy();

    expect(visitorDestroy).toHaveBeenCalledOnce();
    expect(
      document.head.querySelector(`script[src="${WIDGET_SRC}"]`)
    ).toBeNull();
  });
});
