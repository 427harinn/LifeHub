import { defineConfig, devices } from "@playwright/test";

const artifactDir = process.env.PLAYWRIGHT_ARTIFACT_DIR ?? "artifacts/playwright/m3-single-scheduled-event";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  outputDir: `${artifactDir}/test-results`,
  reporter: [["list"], ["html", { outputFolder: `${artifactDir}/html-report`, open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: process.env.PLAYWRIGHT_VIDEO === "on" ? "on" : "off"
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run cf:dev:m7",
        url: "http://127.0.0.1:5173",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
