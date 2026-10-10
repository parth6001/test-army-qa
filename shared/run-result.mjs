export const testStatuses = ['passed', 'failed', 'skipped', 'timedOut', 'interrupted'];
export const runStatuses = ['passed', 'failed', 'skipped', 'timedOut', 'canceled', 'noTests', 'error'];

export function countTests(tests) {
  const counts = Object.fromEntries(testStatuses.map(status => [status, 0]));
  for (const test of tests) counts[test.status]++;
  return { total: tests.length, ...counts };
}

export function isRunResult(value) {
  if (!value || typeof value !== 'object' || typeof value.runId !== 'string' || !value.runId
    || !runStatuses.includes(value.status) || !Array.isArray(value.tests)
    || !Array.isArray(value.errors) || !value.errors.every(error => typeof error === 'string')
    || !(value.exitCode === null || Number.isInteger(value.exitCode))
    || !(value.signal === null || typeof value.signal === 'string')
    || !value.counts) return false;
  if (!value.tests.every(test => test && typeof test.title === 'string'
    && testStatuses.includes(test.status) && Number.isFinite(test.durationMs) && test.durationMs >= 0
    && typeof test.error === 'string' && (test.screenshot === null
      || (typeof test.screenshot === 'string' && test.screenshot.startsWith('/screenshots/'))))) return false;
  const counts = countTests(value.tests);
  if (!Object.entries(counts).every(([key, count]) => value.counts[key] === count)) return false;
  // Green is reserved for a clean, nonempty run with every test actually passed.
  return value.status !== 'passed' || (value.exitCode === 0 && value.signal === null
    && value.errors.length === 0 && counts.total > 0 && counts.passed === counts.total);
}

export const statusLabels = {
  passed: 'All tests passed', failed: 'Some tests failed', skipped: 'Completed with skipped tests',
  timedOut: 'Run timed out', canceled: 'Run interrupted or canceled',
  noTests: 'No tests ran', error: 'Run could not complete', interrupted: 'Interrupted',
};
