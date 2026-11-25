import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    headless: true,
    // Match the SaaS real-backend browser harness for disposable local QA.
    // The normal tracking tests still verify that automated visitors are blocked.
    launchOptions:
      process.env.CONVOR_WORDPRESS_LOCAL_QA === "1"
        ? { args: ["--disable-blink-features=AutomationControlled"] }
        : {},
    // The widget dev server runs at :5173 (saas/apps/widget). Plugins
    // configure it as the apiBase so the chat bubble actually loads.
    baseURL: "http://localhost:8080",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
