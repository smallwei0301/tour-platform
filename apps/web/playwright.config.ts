import { defineConfig, devices } from '@playwright/test';

const midaoLocal = process.env.MIDAO_E2E_LOCAL === '1';
const noWebServer = process.env.PLAYWRIGHT_NO_WEBSERVER === '1';

function requireEnv(name: string): string {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`MIDAO_E2E_ENV_REQUIRED:${name}`);
  return value;
}

function resolveMidaoPort(): string {
  const value = String(process.env.MIDAO_E2E_PORT || '43127');
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
    throw new Error('MIDAO_E2E_PORT_INVALID');
  }
  return value;
}

const midaoPort = midaoLocal ? resolveMidaoPort() : '';
const baseURL = midaoLocal
  ? `http://127.0.0.1:${midaoPort}`
  : (process.env.NEXT_PUBLIC_BASE_URL || 'http://127.0.0.1:3333');

const managedWebServer = noWebServer
  ? undefined
  : midaoLocal
    ? {
        command: 'npm run dev',
        cwd: '.',
        url: `${baseURL}/images/placeholder-avatar.svg`,
        reuseExistingServer: false,
        timeout: 120_000,
        stdout: 'pipe' as const,
        stderr: 'pipe' as const,
        env: {
          ...process.env,
          PORT: midaoPort,
          NODE_ENV: 'development',
          VERCEL_ENV: 'preview',
          MIDAO_E2E_LOCAL: '1',
          NEXT_PUBLIC_BASE_URL: baseURL,
          NEXT_PUBLIC_APP_URL: baseURL,
          NODE_OPTIONS: '--max-old-space-size=1024',
          CHOKIDAR_USEPOLLING: '1',
          WATCHPACK_POLLING: 'true',
          CHOKIDAR_INTERVAL: '1000',
          NEXT_TELEMETRY_DISABLED: '1',
          SUPABASE_URL: requireEnv('SUPABASE_URL'),
          NEXT_PUBLIC_SUPABASE_URL: requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
          SUPABASE_ANON_KEY: requireEnv('SUPABASE_ANON_KEY'),
          NEXT_PUBLIC_SUPABASE_ANON_KEY: requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
          SUPABASE_SERVICE_ROLE_KEY: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
          GUIDE_SESSION_SECRET: requireEnv('GUIDE_SESSION_SECRET'),
          ADMIN_ACCESS_TOKEN: requireEnv('ADMIN_ACCESS_TOKEN'),
          ADMIN_EMAIL_ALLOWLIST: requireEnv('ADMIN_EMAIL_ALLOWLIST'),
          ADMIN_EMAIL: requireEnv('ADMIN_EMAIL'),
        },
      }
    : {
        command: 'PORT=3333 NODE_ENV=development VERCEL_ENV=preview NEXT_PUBLIC_BASE_URL=http://127.0.0.1:3333 NEXT_PUBLIC_APP_URL=http://127.0.0.1:3333 NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=playwright-local-anon npm run dev',
        url: `${baseURL}/images/placeholder-avatar.svg`,
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
