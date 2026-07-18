import {defineConfig} from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {timeout: 10_000},
  use: {
    headless: true,
    // The widget dev server runs at :5173 (saas/apps/widget). Plugins
    // configure it as the apiBase so the chat bubble actually loads.
    baseURL: "http://localhost:8080",
  },
  projects: [
    {
      name: "chromium",
      use: {browserName: "chromium"},
    },
  ],
});
