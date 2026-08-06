import { defineConfig, devices } from "@playwright/test";

import baseConfig from "./playwright.config.js";

export default defineConfig({
  ...baseConfig,
  grep: /@release/u,
  workers: 1,
  projects: [
    {
      name: "chromium-release",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox-release",
      use: {
        ...devices["Desktop Firefox"],
        ...(process.platform === "win32"
          ? {
              // Managed Windows hosts may block Firefox's sandbox broker; this is
              // harness compatibility only, not equivalent sandbox/security coverage.
              launchOptions: {
                env: {
                  ...process.env,
                  MOZ_DISABLE_CONTENT_SANDBOX: "1",
                },
              },
            }
          : {}),
      },
    },
    {
      name: "webkit-release",
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
