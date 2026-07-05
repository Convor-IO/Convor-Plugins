import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["src/**/__tests__/**/*.test.tsx"],
    globals: true,
  },
});
