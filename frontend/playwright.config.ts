import { defineConfig, devices } from '@playwright/test';

const playwrightPort = Number(process.env.PLAYWRIGHT_PORT || 3001);
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: './tests/browser',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: process.env.CI ? 4 : undefined,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${playwrightPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], ...(chromiumExecutablePath ? { launchOptions: { executablePath: chromiumExecutablePath } } : {}) } },
    {
      name: 'chromium-mobile-small',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, ...(chromiumExecutablePath ? { launchOptions: { executablePath: chromiumExecutablePath } } : {}) },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, ...(chromiumExecutablePath ? { launchOptions: { executablePath: chromiumExecutablePath } } : {}) },
    },
    {
      name: 'chromium-tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, ...(chromiumExecutablePath ? { launchOptions: { executablePath: chromiumExecutablePath } } : {}) },
    },
    {
      name: 'webkit-iphone',
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: {
    command: 'node scripts/start-playwright-server.mjs',
    port: playwrightPort,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
