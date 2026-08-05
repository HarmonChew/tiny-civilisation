import { defineConfig, devices } from "@playwright/test";

import baseConfig from "./playwright.config.js";

export default defineConfig({
  ...baseConfig,
  grep: /@release/u,
  projects: [
    {
      name: "chromium-release",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox-release",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit-release",
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
