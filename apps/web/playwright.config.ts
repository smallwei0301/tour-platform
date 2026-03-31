import { defineConfig, devices } from '@playwright/test';

/**
 * Tour Platform Admin E2E Tests
 * 
 * Usage:
 *   npx playwright test                     # run all
 *   npx playwright test e2e/admin.spec.ts   # run admin tests
 *   npx playwright test --headed            # show browser
 *   npx playwright test --ui                # interactive UI mode
 * 
 * Prerequisites:
 *   - Set ADMIN_ACCESS_TOKEN env var (default: 'test-token-123')
 *   - Start dev server: npm run dev
 *   - Or set BASE_URL to point to Vercel preview URL
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { outputFolder: 'e2e-report' }], ['line']],

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3333',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  // Auto-start dev server if not already running
  webServer: process.env.BASE_URL ? undefined : {
    command: 'npm run dev -- -p 3333',
    url: 'http://localhost:3333',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
