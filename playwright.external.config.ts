import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: process.env.TEST_ARMY_TEST_DIR || './tests',
  outputDir: process.env.TEST_ARMY_OUTPUT_DIR || './test-results',
  testMatch: 'generated_*.spec.ts',
  metadata: { testArmyRunId: process.env.TEST_ARMY_RUN_ID || null },
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
