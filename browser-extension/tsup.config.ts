import { defineConfig } from "tsup";

/**
 * Bundle the four extension entry points to self-contained scripts under
 * `dist/`.
 *
 * - `format: ["iife"]` so each file is a runnable script the browser loads
 *   directly (MV3 service workers, popups, options pages, and
 *   `chrome.scripting.executeScript` targets all expect a runnable script,
 *   not a module that needs an import map). The entry points run purely via
 *   side effects (registering listeners, wiring up the DOM), so no global
 *   name is exposed.
 * - `outExtension` strips tsup's default `.global` infix so output filenames
 *   (`background.js`, …) match the paths referenced in the manifest and HTML.
 * - No code-splitting: each entry is independent and loaded in isolation.
 * - `webextension-polyfill` is type-only at build time; we rely on the native
 *   `chrome.*` API being present at runtime, so the bundle stays
 *   dependency-free.
 */
export default defineConfig({
  entry: {
    background: "src/background.ts",
    "content-script": "src/content-script.ts",
    options: "src/options.ts",
    popup: "src/popup.ts",
  },
  format: ["iife"],
  outDir: "dist",
  outExtension: () => ({ js: ".js" }),
  clean: true,
  splitting: false,
  sourcemap: false,
  treeshake: true,
  target: "es2022",
  platform: "browser",
});
