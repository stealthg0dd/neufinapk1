import { defineConfig, devices } from '@playwright/test'

const useSystemChrome = process.env.PW_USE_SYSTEM_CHROME === '1'

export default defineConfig({
  testDir: './qa',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [['list']],
  use: {
    // Fresh context per test is default; we also disable shared state.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    baseURL: 'https://neufin-web.vercel.app',
    browserName: 'chromium',
    // Default to bundled Chromium for runner stability.
    // Set PW_USE_SYSTEM_CHROME=1 to opt-in to system Chrome.
    channel: useSystemChrome ? 'chrome' : undefined,
    launchOptions: {
      // Critical for macOS + sandboxed runners stability.
      args: ['--no-sandbox', '--no-crashpad', '--disable-crash-reporter'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})

