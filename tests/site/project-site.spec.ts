import { test, expect } from '@playwright/test';

test('project site presents the app, local screenshot, workflow, privacy and roadmap', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page).toHaveTitle(/Test Army/);
  await expect(page.getByRole('heading', { name: /Browser checks you can see and review/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'From first look to useful evidence.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Know what stays local and what gets shared.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Built step by step.' })).toBeVisible();
  const screenshot = page.getByRole('img', { name: /Screenshot of the Test Army workspace/ });
  await expect(screenshot).toBeVisible();
  await expect(screenshot).toHaveJSProperty('naturalWidth', 1440);
  const tracker = await request.get('/TASKS.md');
  expect(tracker.ok()).toBe(true);
  const stylesheet = await request.get('/styles.css');
  expect(stylesheet.ok()).toBe(true);
  await page.setViewportSize({ width: 375, height: 812 });
  const layout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    overflow: [...document.querySelectorAll('body *')].map(element => ({
      tag: element.tagName, className: typeof element.className === 'string' ? element.className : '',
      left: Math.round(element.getBoundingClientRect().left), right: Math.round(element.getBoundingClientRect().right),
    })).filter(element => element.left < -1 || element.right > window.innerWidth + 1).slice(0, 12),
  }));
  expect(layout.width, JSON.stringify(layout)).toBeLessThanOrEqual(layout.viewport);
  expect(errors).toEqual([]);
});
