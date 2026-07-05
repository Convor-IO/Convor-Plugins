import { beforeEach, describe, expect, it } from "vitest";
import { initConvor } from "../index.js";
import { __resetSingleton } from "../sdk.js";

/**
 * SSR guard: with window/document gone, initConvor must reject (not touch
 * globals) regardless of what the host environment looks like.
 *
 * happy-dom defines window/document at the top level. We emulate an SSR call
 * by stubbing the globals to undefined for the duration of each test, which
 * makes the inline `typeof window !== "undefined"` guard fire.
 */
function withNoDOM<T>(fn: () => Promise<T>): Promise<T> {
  const savedWindow = globalThis.window;
  const savedDocument = globalThis.document;
  // Temporarily blank the globals to emulate an SSR call.
  (globalThis as { window?: typeof savedWindow }).window = undefined;
  (globalThis as { document?: typeof savedDocument }).document = undefined;
  return fn().finally(() => {
    globalThis.window = savedWindow;
    globalThis.document = savedDocument;
  });
}

describe("initConvor — SSR guard", () => {
  beforeEach(() => {
    __resetSingleton();
  });

  it("rejects with a clear error when window/document are unavailable", async () => {
    await expect(withNoDOM(() => initConvor({ slug: "acme" }))).rejects.toThrow(
      /browser environment/,
    );
  });

  it("does not reject for missing slug before checking SSR — slug error wins", async () => {
    await expect(
      // @ts-expect-error exercising the runtime guard with a missing slug
      withNoDOM(() => initConvor({})),
    ).rejects.toThrow(/slug/);
  });
});
