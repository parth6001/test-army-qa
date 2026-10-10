import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/site',
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5180', trace: 'retain-on-failure', ...devices['Desktop Chrome'] },
  webServer: { command: 'node tools/ServeSite.mjs', url: 'http://127.0.0.1:5180', reuseExistingServer: false },
});
