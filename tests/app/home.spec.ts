import { test, expect } from '@playwright/test';
import type { Route } from '@playwright/test';
import { countTests } from '../../shared/run-result.mjs';
import type { RunResult, RunStatus, TestStatus } from '../../shared/run-result.mjs';

function result(status: RunStatus, title = 'Fixture check', testStatus: TestStatus = 'passed'): RunResult {
  const tests = ['noTests', 'error'].includes(status) ? [] : [{ title, status: testStatus, durationMs: 10,
    error: testStatus === 'failed' ? 'Expected matching search result' : '', screenshot: null }];
  return { runId: 'fixture-run', status, tests, counts: countTests(tests),
    exitCode: status === 'passed' || status === 'skipped' ? 0 : 1, signal: null,
    errors: status === 'error' ? ['Runner could not start'] : [] };
}

const targetUrl = 'https://example.test/search';
const generatedCode = "import { test, expect } from '@playwright/test';\n// Controlled API fixture; never executed by these UI tests.\n";

async function stream(route: Route, entries: { type: string; data: unknown }[]) {
  await route.fulfill({
    contentType: 'text/event-stream',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: entries.map(entry => `data: ${JSON.stringify(entry)}\n\n`).join(''),
  });
}

test.beforeEach(async ({ page }) => {
  // Local browser UI suite: never contact the real backend or model provider.
  // Individual tests register their controlled API routes after this guard.
  await page.route('http://localhost:3001/**', route => route.abort('blockedbyclient'));
  await page.route('http://localhost:3001/api/session', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ token: 'a'.repeat(64), expiresAt: Date.now() + 60000 }),
  }));
  await page.goto('/');
});

test('preview sends browser boundary header and displays rejection', async ({ page }) => {
  await page.route('http://localhost:3001/api/inspect', async route => {
    expect(route.request().headers()['x-test-army']).toBe('1');
    expect(route.request().headers().authorization).toBe(`Bearer ${'a'.repeat(64)}`);
    await route.fulfill({ status: 403, contentType: 'application/json',
      body: JSON.stringify({ error: 'Open Test Army from an approved local UI origin.' }) });
  });
  await page.getByLabel('Target URL').fill(targetUrl);
  await page.getByRole('button', { name: /Preview page/ }).click();
  await expect(page.getByRole('alert')).toContainText('approved local UI origin');
  await expect(page.getByRole('button', { name: /Preview page/ })).toBeEnabled();
});

test('expired session reports the error and reconnects only on the next action', async ({ page }) => {
  let sessions = 0;
  let inspections = 0;
  await page.route('http://localhost:3001/api/session', route => {
    sessions++;
    return route.fulfill({ contentType: 'application/json',
      body: JSON.stringify({ token: String(sessions).repeat(64), expiresAt: Date.now() + 60000 }) });
  });
  await page.route('http://localhost:3001/api/inspect', route => {
    inspections++;
    expect(route.request().headers().authorization).toBe(`Bearer ${String(inspections).repeat(64)}`);
    return route.fulfill({ status: inspections === 1 ? 401 : 200, contentType: 'application/json',
      body: JSON.stringify(inspections === 1
        ? { error: 'Your local session expired or the server restarted. Try the action again to reconnect.' }
        : { title: 'Reconnected fixture', forms: 0, inputs: [], buttons: [], links: [] }) });
  });
  await page.getByLabel('Target URL').fill(targetUrl);
  await page.getByRole('button', { name: /Preview page/ }).click();
  await expect(page.getByRole('alert')).toContainText('session expired');
  expect(inspections).toBe(1);
  expect(sessions).toBe(1);
  await page.getByRole('button', { name: /Preview page/ }).click();
  await expect(page.getByText('Reconnected fixture')).toBeVisible();
  expect(inspections).toBe(2);
  expect(sessions).toBe(2);
});

test('failure screenshot is fetched with authorization and displayed as a blob', async ({ page }) => {
  const failed = result('failed', 'Screenshot fixture', 'failed');
  failed.tests[0].screenshot = '/screenshots/fixture-run/failure.png';
  await page.route('http://localhost:3001/api/generate', route => {
    expect(route.request().headers().authorization).toBe(`Bearer ${'a'.repeat(64)}`);
    return stream(route, [{ type: 'done', data: { kind: 'run', result: failed } }]);
  });
  await page.route('http://localhost:3001/screenshots/**', route => {
    expect(route.request().headers().authorization).toBe(`Bearer ${'a'.repeat(64)}`);
    expect(route.request().url()).not.toContain('token');
    return route.fulfill({ contentType: 'image/png', body: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
  });
  await page.getByLabel('Target URL').fill(targetUrl);
  await page.getByLabel('What to test').fill('Check fixture');
  await page.getByRole('button', { name: /Deploy Test Army/ }).click();
  await page.getByRole('button', { name: /Screenshot fixture/ }).click();
  const screenshot = page.getByAltText('failure screenshot');
  await expect(screenshot).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => screenshot.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBe(1);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })))
    .toEqual({ local: 0, session: 0 });
});

test('mobile setup fits viewport and login controls have keyboard-accessible labels', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole('heading', { name: 'Start with one workflow' })).toBeVisible();
  const login = page.getByRole('button', { name: /Requires login/ });
  await login.focus();
  await page.keyboard.press('Enter');
  await expect(login).toHaveAttribute('aria-expanded', 'true');
  await page.getByLabel('Login page URL').fill('https://example.test/login');
  await page.getByLabel('Username / email').fill('fixture-user');
  await page.getByLabel('Password', { exact: true }).fill('fixture-only');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('preview prevents a simultaneous generation request', async ({ page }) => {
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  await page.route('http://localhost:3001/api/inspect', async route => {
    await hold;
    await route.fulfill({ status: 500, headers: { 'Access-Control-Allow-Origin': '*' }, json: { error: 'Fixture unavailable' } });
  });
  await page.getByLabel('Target URL').fill(targetUrl);
  await page.getByLabel('What to test').fill('Check search');
  await page.getByRole('button', { name: /Preview page/ }).click();
  await expect(page.getByRole('button', { name: /Deploy Test Army/ })).toBeDisabled();
  release();
  await expect(page.getByRole('button', { name: /Deploy Test Army/ })).toBeEnabled();
});

test('cancel waits for server cleanup before enabling a new task', async ({ page }) => {
  // A held in-browser stream exercises UI timing; it does not prove OS process cleanup.
  await page.evaluate(() => {
    let controller: ReadableStreamDefaultController<Uint8Array>;
    const encoder = new TextEncoder();
    const original = window.fetch;
    window.fetch = async (input, init) => {
      if (String(input).endsWith('/api/generate')) {
        return new Response(new ReadableStream({ start(stream) {
          controller = stream;
          stream.enqueue(encoder.encode('data: {"type":"job","data":"fixture-job"}\n\n'));
        } }), { headers: { 'Content-Type': 'text/event-stream' } });
      }
      if (String(input).endsWith('/api/jobs/fixture-job/cancel')) {
        window.setTimeout(() => {
          controller.enqueue(encoder.encode('data: {"type":"error","data":"Task canceled."}\n\n'));
          controller.close();
        }, 1000);
        return new Response('{}', { status: 200 });
      }
      return original(input, init);
    };
  });
  await page.getByLabel('Target URL').fill(targetUrl);
  await page.getByLabel('What to test').fill('Check search');
  await page.getByRole('button', { name: /Deploy Test Army/ }).click();
  await page.getByRole('button', { name: 'Cancel task' }).click();
  await expect(page.getByRole('button', { name: 'Canceling…', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Working/ })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('Task canceled.');
  await expect(page.getByRole('button', { name: /Deploy Test Army/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Cancel task' })).toHaveCount(0);
});

test('busy server explains the conflict and restores controls', async ({ page }) => {
  await page.route('http://localhost:3001/api/generate', route => route.fulfill({
    status: 409, headers: { 'Access-Control-Allow-Origin': '*' },
    json: { error: 'Another task is running. Wait for it to finish or cancel it first.' },
  }));
  await page.getByLabel('Target URL').fill(targetUrl);
  await page.getByLabel('What to test').fill('Check search');
  await page.getByRole('button', { name: /Deploy Test Army/ }).click();
  await expect(page.getByRole('alert')).toContainText('Another task is running');
  await expect(page.getByRole('button', { name: /Deploy Test Army/ })).toBeEnabled();
});

test('requires inputs and preserves text when adding a scenario preset', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /Test Army/ })).toBeVisible();
  const deploy = page.getByRole('button', { name: /Deploy Test Army/ });
  await expect(deploy).toBeDisabled();
  await page.getByLabel('Target URL').fill(targetUrl);
  await expect(deploy).toBeDisabled();
  await page.getByLabel('What to test').fill('Check existing workflow.');
  await page.getByRole('button', { name: /Search/ }).click();
  await expect(page.getByLabel('What to test')).toHaveValue(/Check existing workflow\.\nTest search:/);
  await expect(deploy).toBeEnabled();
  await page.getByLabel('What to test').clear();
  await expect(deploy).toBeDisabled();
});

test('previews a page using a controlled inspection response', async ({ page }) => {
  let inspectedTarget: unknown;
  await page.route('http://localhost:3001/api/inspect', async route => {
    inspectedTarget = route.request().postDataJSON();
    await route.fulfill({ headers: { 'Access-Control-Allow-Origin': '*' }, json: {
      title: 'Fixture Search', headings: [], buttons: ['Find record'], links: [],
      inputs: [{ type: 'text', name: 'query', label: 'Query' }], forms: 1, images: [],
    } });
  });
  await page.getByLabel('Target URL').fill(targetUrl);
  await page.getByRole('button', { name: /Preview page/ }).click();
  await expect(page.getByText('Fixture Search', { exact: false })).toBeVisible();
  await expect(page.getByText('Find record', { exact: true })).toBeVisible();
  expect(inspectedTarget).toEqual({ url: targetUrl, login: null });
});

test('review mode waits for approval and submits edited code only on Run', async ({ page }) => {
  const runRequests: unknown[] = [];
  let generateRequest: unknown;
  await page.route('http://localhost:3001/api/generate', async route => {
    generateRequest = route.request().postDataJSON();
    await stream(route, [
      { type: 'testCode', data: generatedCode },
      { type: 'awaitReview', data: 'ready' },
      { type: 'done', data: { kind: 'generated' } },
    ]);
  });
  await page.route('http://localhost:3001/api/run', async route => {
    runRequests.push(route.request().postDataJSON());
    await stream(route, [
      { type: 'results', data: '1 passed' },
      { type: 'done', data: { kind: 'run', result: result('passed') } },
    ]);
  });
  await page.getByLabel('Target URL').fill(targetUrl);
  await page.getByLabel('What to test').fill('Check search');
  await page.getByRole('checkbox', { name: 'Review tests before running' }).check();
  await page.getByRole('button', { name: /Generate Tests/ }).click();
  await expect(page.getByRole('button', { name: '▶ Run Tests', exact: true })).toBeVisible();
  expect(generateRequest).toEqual({ url: targetUrl, description: 'Check search', autoRun: false, login: null });
  expect(runRequests).toHaveLength(0);
  const editedCode = `${generatedCode}// Reviewed edit\n`;
  await page.getByLabel('Generated test code').fill(editedCode);
  await page.getByRole('button', { name: '▶ Run Tests', exact: true }).click();
  await expect(page.getByText('Fixture check', { exact: true })).toBeVisible();
  expect(runRequests).toEqual([{ url: targetUrl, code: editedCode, login: null }]);
});

test('shows a supplied failed result and its diagnostic details', async ({ page }) => {
  await page.route('http://localhost:3001/api/generate', async route => {
    await stream(route, [
      { type: 'testCode', data: generatedCode },
      { type: 'results', data: '1 failed' },
      { type: 'done', data: { kind: 'run', result: result('failed', 'Fixture failure', 'failed') } },
    ]);
  });
  await page.getByLabel('Target URL').fill(targetUrl);
  await page.getByLabel('What to test').fill('Check search');
  await page.getByRole('button', { name: /Deploy Test Army/ }).click();
  await expect(page.getByText(/Some tests failed/)).toBeVisible();
  await page.getByRole('button', { name: /Fixture failure/ }).click();
  await expect(page.getByText('Expected matching search result', { exact: true })).toBeVisible();
});

for (const [status, testStatus, label] of [
  ['skipped', 'skipped', 'Completed with skipped tests'],
  ['timedOut', 'timedOut', 'Run timed out'],
  ['canceled', 'interrupted', 'Run interrupted or canceled'],
  ['noTests', 'passed', 'No tests ran'],
  ['error', 'passed', 'Run could not complete'],
] as const) {
  test(`shows ${status} without a success banner even when raw text says passed`, async ({ page }) => {
    await page.route('http://localhost:3001/api/generate', route => stream(route, [
      { type: 'results', data: '99 passed' },
      { type: 'done', data: { kind: 'run', result: result(status, 'Outcome fixture', testStatus) } },
    ]));
    await page.getByLabel('Target URL').fill(targetUrl);
    await page.getByLabel('What to test').fill('Check result');
    await page.getByRole('button', { name: /Deploy Test Army/ }).click();
    await expect(page.getByRole('status')).toContainText(label);
    await expect(page.getByText(/All tests passed/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Deploy Test Army/ })).toBeEnabled();
  });
}

for (const scenario of [
  { name: 'HTTP 400', status: 400, contentType: 'application/json', body: '{"error":"Invalid request"}' },
  { name: 'HTTP 500', status: 500, contentType: 'application/json', body: '{"error":"Runner unavailable"}' },
  { name: 'wrong content type', status: 200, contentType: 'application/json', body: '{}' },
  { name: 'malformed JSON event', status: 200, contentType: 'text/event-stream', body: 'data: {bad}\n\n' },
  { name: 'invalid success result', status: 200, contentType: 'text/event-stream', body: 'data: {"type":"done","data":{"kind":"run","result":{"status":"passed"}}}\n\n' },
  { name: 'truncated stream', status: 200, contentType: 'text/event-stream', body: 'data: {"type":"done"' },
  { name: 'stream without completion', status: 200, contentType: 'text/event-stream', body: 'data: {"type":"results","data":"1 passed"}\n\n' },
]) {
  test(`recovers controls after ${scenario.name}`, async ({ page }) => {
    await page.route('http://localhost:3001/api/generate', route => route.fulfill({
      status: scenario.status, contentType: scenario.contentType,
      headers: { 'Access-Control-Allow-Origin': '*' }, body: scenario.body,
    }));
    await page.getByLabel('Target URL').fill(targetUrl);
    await page.getByLabel('What to test').fill('Check result');
    await page.getByRole('button', { name: /Deploy Test Army/ }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: /Deploy Test Army/ })).toBeEnabled();
    await expect(page.getByText(/All tests passed/)).toHaveCount(0);
  });
}

test('a failed rerun cannot retain a previous success', async ({ page }) => {
  await page.route('http://localhost:3001/api/generate', route => stream(route, [
    { type: 'testCode', data: generatedCode },
    { type: 'done', data: { kind: 'run', result: result('passed') } },
  ]));
  await page.route('http://localhost:3001/api/run', route => stream(route, [
    { type: 'done', data: { kind: 'run', result: result('error') } },
  ]));
  await page.getByLabel('Target URL').fill(targetUrl);
  await page.getByLabel('What to test').fill('Check result');
  await page.getByRole('button', { name: /Deploy Test Army/ }).click();
  await expect(page.getByRole('status')).toContainText('All tests passed');
  await page.getByRole('button', { name: 'Generated Tests', exact: true }).click();
  await page.getByRole('button', { name: /Re-run/ }).click();
  await expect(page.getByRole('status')).toContainText('Run could not complete');
  await expect(page.getByText(/All tests passed/)).toHaveCount(0);
});
