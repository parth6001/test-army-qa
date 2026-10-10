import { test, expect } from '@playwright/test';
import { startSessionFixture } from '../contracts/session-fixture.mjs';

test('real browser CORS, sessions, ownership, screenshot and cancellation', async ({ page }) => {
  const fixture = await startSessionFixture();
  try {
    await page.goto('/');
    const result = await page.evaluate(async baseUrl => {
      const modulePath = '/shared/api-client.mjs';
      const { createApiClient } = await import(modulePath);
      const alice = createApiClient(baseUrl);
      const bob = createApiClient(baseUrl);
      const run = await alice('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'http://fixture.test', code: '// fixture only; never executed' }) });
      const job = await run.json();
      const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' };
      const deniedCancel = await bob(`/api/jobs/${job.id}/cancel`, options);
      const deniedImage = await bob(job.screenshot);
      const image = await alice(job.screenshot);
      const blobUrl = URL.createObjectURL(await image.blob());
      const img = document.createElement('img');
      img.alt = 'Authorized fixture screenshot';
      img.src = blobUrl;
      document.body.append(img);
      await img.decode();
      URL.revokeObjectURL(blobUrl);
      const canceled = await alice(`/api/jobs/${job.id}/cancel`, options);
      return { run: run.status, deniedCancel: deniedCancel.status, deniedImage: deniedImage.status,
        image: image.status, width: img.naturalWidth, canceled: canceled.status };
    }, fixture.baseUrl);
    expect(result).toEqual({ run: 200, deniedCancel: 404, deniedImage: 404, image: 200, width: 1, canceled: 200 });
    await expect(page.getByAltText('Authorized fixture screenshot')).toBeVisible();
  } finally {
    await fixture.close();
  }
});
