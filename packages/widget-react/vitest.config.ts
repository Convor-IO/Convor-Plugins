import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Tests exercise the workspace SDK source directly. Package exports point
    // at dist/ for consumers, but a clean checkout must not require generated
    // artifacts just to run unit tests.
    alias: {
      "@convor/widget-sdk": fileURLToPath(
        new URL("../widget-sdk/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "happy-dom",
    environmentOptions: {
      happyDOM: {
        settings: {
          disableJavaScriptFileLoading: true,
          handleDisabledFileLoadingAsSuccess: true,
        },
      },
    },
    include: ["src/**/__tests__/**/*.test.tsx"],
    globals: true,
  },
});
