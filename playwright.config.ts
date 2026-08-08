import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './apps/web/e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    ...devices['Desktop Chrome']
  },
  webServer: [
    {
      command: 'pnpm --filter @tadpods/api start',
      url: 'http://localhost:4000/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        API_PORT: '4000',
        CORS_ORIGIN: 'http://localhost:3000'
      }
    },
    {
      // NEXT_PUBLIC_API_URL is inlined at `pnpm build` time, not read by `next start` —
      // it must match whatever the already-built .next output was compiled with (see .env).
      command: 'pnpm --filter @tadpods/web start',
      url: 'http://localhost:3000/login',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        API_URL: 'http://localhost:4000'
      }
    }
  ]
});
