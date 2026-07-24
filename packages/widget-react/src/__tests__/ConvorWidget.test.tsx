import { DEFAULT_API_BASE } from "@convor/widget-sdk";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConvorWidget } from "../ConvorWidget.js";
import { __resetHandle } from "../handle.js";
import { useConvor } from "../useConvor.js";

const WIDGET_SRC = `${DEFAULT_API_BASE}/widget.js`;

function resetDom(): void {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  window.Convor = undefined;
  __resetHandle();
}

/** Pretend the embed loader has booted. */
function simulateReady(): void {
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
  // Two timer rounds to be safe across scheduler orderings.
  await new Promise((r) => setTimeout(r, 80));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("ConvorWidget — mount", () => {
  beforeEach(resetDom);
  afterEach(cleanup);

  it("injects the embed script tag on mount", async () => {
    render(<ConvorWidget slug="acme" />);
    setTimeout(simulateReady, 0);
    await flushReady();

    const script = document.head.querySelector<HTMLScriptElement>(
      `script[src="${WIDGET_SRC}"]`,
    );
    expect(script).not.toBeNull();
    expect(script?.getAttribute("data-key")).toBe("acme");
  });

  it("passes appearance overrides as data-* attrs", async () => {
    render(
      <ConvorWidget
        slug="acme"
        primaryColor="#3b82f6"
        position="bottom-right"
        theme="dark"
      />,
    );
    setTimeout(simulateReady, 0);
    await flushReady();

    const script = document.head.querySelector<HTMLScriptElement>(
      `script[src="${WIDGET_SRC}"]`,
    );
    expect(script?.getAttribute("data-primary-color")).toBe("#3b82f6");
    expect(script?.getAttribute("data-position")).toBe("bottom-right");
    expect(script?.getAttribute("data-theme")).toBe("dark");
  });
});

describe("ConvorWidget — unmount cleanup", () => {
  beforeEach(resetDom);
  afterEach(cleanup);

  it("removes the embed script on unmount", async () => {
    const { unmount } = render(<ConvorWidget slug="acme" />);
    setTimeout(simulateReady, 0);
    await flushReady();

    expect(
      document.head.querySelector(`script[src="${WIDGET_SRC}"]`),
    ).not.toBeNull();

    unmount();

    expect(
      document.head.querySelector(`script[src="${WIDGET_SRC}"]`),
    ).toBeNull();
  });

  it("destroys the visitor SDK on unmount", async () => {
    const destroy = vi.fn();
    const { unmount } = render(<ConvorWidget slug="acme" />);
    setTimeout(() => {
      simulateReady();
    }, 0);
    await flushReady();
    // Replace the visitor SDK with a copy whose destroy is spied. The widget
    // reads window.Convor at teardown time, so this lands before unmount.
    const current = window.Convor;
    if (!current) throw new Error("visitor SDK not ready");
    window.Convor = { ...current, destroy };

    unmount();
    expect(destroy).toHaveBeenCalled();
  });
});

describe("ConvorWidget — idempotency & slug change", () => {
  beforeEach(resetDom);
  afterEach(cleanup);

  it("does not inject a second script on re-render", async () => {
    const view = render(<ConvorWidget slug="acme" />);
    setTimeout(simulateReady, 0);
    await flushReady();

    view.rerender(<ConvorWidget slug="acme" primaryColor="#111111" />);
    await flushReady();

    const scripts = document.head.querySelectorAll<HTMLScriptElement>(
      `script[src="${WIDGET_SRC}"]`,
    );
    expect(scripts.length).toBe(1);
  });

  it("exposes the SDK handle to useConvor after mount", async () => {
    function Consumer() {
      const convor = useConvor();
      return (
        <button type="button" onClick={() => convor?.openChat()}>
          {convor ? "ready" : "idle"}
        </button>
      );
    }

    render(
      <ConvorWidget slug="acme">
        <Consumer />
      </ConvorWidget>,
    );
    expect(screen.getByText("idle")).toBeDefined();

    setTimeout(simulateReady, 0);
    await flushReady();

    expect(screen.getByText("ready")).toBeDefined();
  });
});
