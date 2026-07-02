import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.NEXT_PUBLIC_BASE_URL || 'http://127.0.0.1:3333';
const managedWebServer = process.env.PLAYWRIGHT_NO_WEBSERVER === '1'
  ? undefined
  : {
      command: 'PORT=3333 NODE_ENV=development VERCEL_ENV=preview NEXT_PUBLIC_BASE_URL=http://127.0.0.1:3333 NEXT_PUBLIC_APP_URL=http://127.0.0.1:3333 NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=playwright-local-anon npm run dev',
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe' as const,
      stderr: 'pipe' as const,
    };

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  webServer: managedWebServer,
  use: {
    baseURL,
    trace: 'on-first-retry',
    // 沙盒/CI 若預裝的 Chromium build 與 @playwright/test pin 的版本不符，
    // 可用 PW_EXECUTABLE_PATH 指向現成二進位，免去 `playwright install` 下載。
    // 未設時為 no-op（Playwright 走預設解析）。
    ...(process.env.PW_EXECUTABLE_PATH
      ? { launchOptions: { executablePath: process.env.PW_EXECUTABLE_PATH } }
      : {}),
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
