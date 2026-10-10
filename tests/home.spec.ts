import { test, expect } from '@playwright/test';

test('homepage loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/phase-2/);
});

test('Vite and React logos visible', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('img[alt="Vite logo"]')).toBeVisible();
  await expect(page.locator('img[alt="React logo"]')).toBeVisible();
});
