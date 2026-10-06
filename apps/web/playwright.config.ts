import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL,
    trace: "retain-on-failure",
  },
});