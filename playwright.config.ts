import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "site.spec.ts",
  fullyParallel: true,
  workers: 2,
  use: {
    baseURL: process.env.SITE_URL || "http://127.0.0.1:5173",
    headless: true,
  },
  webServer: process.env.SITE_URL
    ? undefined
    : {
        command: "npm run dev -- --host 127.0.0.1",
        url: "http://127.0.0.1:5173",
        reuseExistingServer: !process.env.CI,
      },
  reporter: "list",
  outputDir: "test-results",
});
