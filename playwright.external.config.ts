import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'generated_*.spec.ts',
  fullyParallel: false,
  retries: 0,
  timeout: 30000,
  reporter: 'list',
  use: {
    trace: 'off',
    screenshot: 'only-on-failure',
    ...(process.env.PW_STORAGE ? { storageState: process.env.PW_STORAGE } : {}),
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
