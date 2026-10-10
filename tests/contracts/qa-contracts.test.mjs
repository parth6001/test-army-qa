import test from 'node:test';
import './api-boundary.test.mjs';
import './sessions.test.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { summarizeRun } from '../../server/run-report.mjs';
import { isRunResult } from '../../shared/run-result.mjs';
import { readEventStream, requestEventStream } from '../../shared/event-stream.mjs';

// Pure contract tests use Node's test API in one process; no browser/provider is needed.
function report(statuses = ['passed'], runId = 'current') {
  return {
    config: { metadata: { testArmyRunId: runId } }, errors: [],
    stats: { expected: statuses.filter(s => s === 'passed').length,
      skipped: statuses.filter(s => s === 'skipped').length, flaky: 0,
      unexpected: statuses.filter(s => !['passed', 'skipped'].includes(s)).length },
    suites: [{ title: 'Search', specs: [{ title: 'find record', tests: statuses.map(status => ({
      projectName: 'chromium', status: status === 'skipped' ? 'skipped' : 'expected',
      results: [{ status, duration: 12, error: status === 'failed' ? { message: 'Expected record' } : undefined }],
    })) }] }],
  };
}
function summarize(overrides = {}) {
  return summarizeRun({ runId: 'current', report: report(), exitCode: 0, ...overrides });
}

test('screenshots are scoped to the current artifact root and URL', () => {
  const raw = report(['failed']);
  const resultsRoot = path.resolve('.test-army/runs/current/artifacts');
  const attempt = raw.suites[0].specs[0].tests[0].results[0];
  attempt.attachments = [{ name: 'screenshot', path: path.join(resultsRoot, 'case', 'failed.png') }];
  const options = { report: raw, resultsRoot, screenshotPrefix: '/screenshots/current', exitCode: 1 };
  assert.equal(summarize(options).tests[0].screenshot, '/screenshots/current/case/failed.png');
  attempt.attachments[0].path = path.resolve('.test-army/runs/previous/artifacts/failed.png');
  assert.equal(summarize(options).tests[0].screenshot, null);
  attempt.attachments[0].path = path.resolve('.test-army/runs/current/auth.json');
  assert.equal(summarize(options).tests[0].screenshot, null);
});

test('job identity reaches client before work completes', async () => {
  const events = [];
  const body = [{ type: 'job', data: 'current' }, { type: 'done', data: { kind: 'run', result: summarize() } }]
    .map(event => `data: ${JSON.stringify(event)}\n\n`).join('');
  await readEventStream(new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }),
    event => events.push(event), 'run');
  assert.equal(events[0].type, 'job');
  assert.equal(events[0].data, 'current');
});

for (const [name, options, expected] of [
  ['clean run', {}, 'passed'],
  ['assertion failure', { report: report(['failed']), exitCode: 1 }, 'failed'],
  ['all skipped', { report: report(['skipped']) }, 'skipped'],
  ['mixed skip/pass', { report: report(['passed', 'skipped']) }, 'skipped'],
  ['test timeout', { report: report(['timedOut']), exitCode: 1 }, 'timedOut'],
  ['interrupted test', { report: report(['interrupted']), exitCode: 1 }, 'canceled'],
  ['runner timeout without report', { report: null, exitCode: null, timedOut: true }, 'timedOut'],
  ['runner signal', { signal: 'SIGTERM', exitCode: null }, 'canceled'],
  ['no tests', { report: report([]), exitCode: 1 }, 'noTests'],
  ['missing report despite exit zero', { report: undefined }, 'error'],
  ['unreadable report', { reportError: 'Unreadable JSON' }, 'error'],
  ['stale report', { report: report(['passed'], 'previous') }, 'error'],
  ['spawn failure', { exitCode: null, executionError: 'spawn EPERM' }, 'error'],
  ['passing rows with nonzero exit', { exitCode: 1 }, 'error'],
  ['unknown runner exit', { exitCode: 9 }, 'error'],
  ['malformed report', { report: { config: { metadata: { testArmyRunId: 'current' } } } }, 'error'],
  ['unknown test status', { report: report(['unknown']) }, 'error'],
]) {
  test(`result: ${name}`, () => {
    const result = summarize(options);
    assert.equal(result.status, expected);
    assert.equal(isRunResult(result), true);
  });
}

test('report totals cannot hide a missing test', () => {
  const raw = report();
  raw.stats.expected = 2;
  assert.equal(summarize({ report: raw }).status, 'error');
});
test('report-level syntax error is distinct from no tests', () => {
  const raw = report([]);
  raw.errors.push({ message: 'SyntaxError: Unexpected token' });
  assert.equal(summarize({ report: raw, exitCode: 1 }).status, 'error');
  raw.errors = [{ message: 'Error: No tests found.' }];
  assert.equal(summarize({ report: raw, exitCode: 1 }).status, 'noTests');
});
test('flaky passing attempt never becomes clean success', () => {
  const raw = report();
  raw.suites[0].specs[0].tests[0].status = 'flaky';
  raw.stats.expected = 0;
  raw.stats.flaky = 1;
  assert.equal(summarize({ report: raw }).status, 'error');
});
test('missing attempts are interrupted, never inferred passed from spec.ok', () => {
  const raw = report();
  raw.suites[0].specs[0].ok = true;
  raw.suites[0].specs[0].tests[0].results = [];
  assert.equal(summarize({ report: raw }).status, 'canceled');
});
test('UI contract rejects false success and inconsistent counts', () => {
  assert.equal(isRunResult({ ...summarize({ exitCode: 1 }), status: 'passed' }), false);
  assert.equal(isRunResult({ ...summarize({ report: report([]) }), status: 'passed' }), false);
  const result = summarize();
  result.counts.total = 99;
  assert.equal(isRunResult(result), false);
});

const encode = event => `data: ${JSON.stringify(event)}\n\n`;
const complete = () => ({ type: 'done', data: { kind: 'run', result: summarize() } });
const response = (body, contentType = 'text/event-stream', status = 200) => new Response(body, {
  status, headers: { 'Content-Type': contentType },
});

test('stream handles byte-split UTF-8, CRLF, comments and a validated terminal result', async () => {
  const bytes = new TextEncoder().encode(`: heartbeat\r\n\r\n${encode({ type: 'progress', data: 'Searching 🔍' })}${encode(complete())}`.replace(/(?<!\r)\n/g, '\r\n'));
  let position = 0;
  const stream = new ReadableStream({ pull(controller) {
    if (position < bytes.length) controller.enqueue(bytes.slice(position, ++position));
    else controller.close();
  } });
  const events = [];
  await readEventStream(response(stream), event => events.push(event), 'run');
  assert.equal(events[0].data, 'Searching 🔍');
  assert.equal(events.at(-1).data.result.status, 'passed');
});

for (const [name, body, contentType, status, message] of [
  ['HTTP JSON error', '{"error":"Invalid target"}', 'application/json', 400, /Invalid target/],
  ['HTTP HTML error', '<h1>Oops</h1>', 'text/html', 500, /HTTP 500/],
  ['unexpected content type', '{}', 'application/json', 200, /event stream/],
  ['bad JSON', 'data: {bad}\n\n', 'text/event-stream', 200, /malformed/],
  ['unknown event', encode({ type: 'unknown', data: '' }), 'text/event-stream', 200, /unsupported/],
  ['null event', 'data: null\n\n', 'text/event-stream', 200, /Invalid/],
  ['bad result', encode({ type: 'done', data: { kind: 'run', result: { status: 'passed' } } }), 'text/event-stream', 200, /invalid run result/],
  ['wrong completion', encode({ type: 'done', data: { kind: 'generated' } }), 'text/event-stream', 200, /Unexpected completion/],
  ['truncated JSON', 'data: {"type":"done"', 'text/event-stream', 200, /ended before/],
  ['missing terminal event', encode({ type: 'results', data: '99 passed' }), 'text/event-stream', 200, /ended before/],
  ['server error', encode({ type: 'error', data: 'Provider unavailable' }), 'text/event-stream', 200, /Provider unavailable/],
]) {
  test(`stream rejects ${name}`, async () => {
    await assert.rejects(readEventStream(response(body, contentType, status), () => {}, 'run'), message);
  });
}
test('review-only generation requires code before completion', async () => {
  const terminal = encode({ type: 'done', data: { kind: 'generated' } });
  await assert.rejects(readEventStream(response(terminal), () => {}, 'generated'), /without test code/);
  await readEventStream(response(encode({ type: 'testCode', data: 'example code' }) + terminal), () => {}, 'generated');
});
test('broken network stream rejects and releases its reader', async () => {
  const stream = new ReadableStream({ start(controller) { controller.error(new Error('Disconnected')); } });
  await assert.rejects(readEventStream(response(stream), () => {}, 'run'), /Disconnected/);
  assert.equal(stream.locked, false);
});
test('request timeout aborts a stalled connection', async t => {
  t.mock.method(globalThis, 'fetch', (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
  }));
  await assert.rejects(requestEventStream('http://fixture.test', {}, () => {}, 'run', 10), /Request timed out/);
});
import './jobs.test.mjs';
