import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { countTests, testStatuses } from '../shared/run-result.mjs';

export function summarizeRun({ runId, report, reportError, exitCode = null, signal = null,
  timedOut = false, executionError = null, resultsRoot = path.resolve('test-results'), screenshotPrefix = '/screenshots' }) {
  let tests = [];
  const errors = [];
  let validReport = false;
  try {
    if (reportError) throw new Error(reportError);
    if (!report || report.config?.metadata?.testArmyRunId !== runId)
      throw new Error('Missing report or report belongs to another run.');
    if (!Array.isArray(report.suites) || !Array.isArray(report.errors))
      throw new Error('Malformed test report.');
    const walk = (suite, parents = []) => {
      if (!suite || !Array.isArray(suite.specs)) throw new Error('Malformed report suite.');
      const titles = [...parents, suite.title].filter(Boolean);
      for (const spec of suite.specs) {
        if (!Array.isArray(spec.tests)) throw new Error('Malformed report tests.');
        for (const test of spec.tests) {
          if (!Array.isArray(test.results)) throw new Error('Missing test attempts.');
          const attempt = test.results.at(-1);
          const status = attempt?.status ?? (test.status === 'skipped' ? 'skipped' : 'interrupted');
          if (!testStatuses.includes(status)) throw new Error('Unknown test status.');
          const shot = attempt?.attachments?.find(attachment => attachment.name === 'screenshot' && attachment.path);
          let screenshot = null;
          if (shot) {
            const relative = path.relative(resultsRoot, shot.path);
            if (relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
              screenshot = `${screenshotPrefix}/${relative.split(path.sep).map(encodeURIComponent).join('/')}`;
          }
          tests.push({
            title: [...titles, spec.title, test.projectName].filter(Boolean).join(' › '),
            status, durationMs: Math.max(0, attempt?.duration || 0),
            error: stripVTControlCharacters(attempt?.error?.message || '').trim(), screenshot,
          });
          if (test.status === 'flaky') errors.push(`Flaky test: ${spec.title}`);
        }
      }
      for (const child of suite.suites || []) walk(child, titles);
    };
    for (const suite of report.suites) walk(suite);
    const totals = ['expected', 'unexpected', 'flaky', 'skipped'].map(key => report.stats?.[key]);
    if (totals.some(total => !Number.isInteger(total) || total < 0)
      || totals.reduce((sum, total) => sum + total, 0) !== tests.length)
      throw new Error('Report totals are missing or inconsistent.');
    errors.push(...report.errors.map(error => stripVTControlCharacters(error.message || error.value || 'Report error')));
    validReport = true;
  } catch (error) {
    tests = [];
    errors.push(error.message);
  }
  const counts = countTests(tests);
  let status;
  const onlyNoTestsError = errors.every(error => /^Error: No tests found\b/.test(error));
  if (timedOut) status = 'timedOut';
  else if (signal || counts.interrupted) status = 'canceled';
  else if (!validReport || exitCode === null) status = 'error';
  else if (!counts.total && onlyNoTestsError && (exitCode === 0 || exitCode === 1)) status = 'noTests';
  else if (errors.length || ![0, 1].includes(exitCode)) status = 'error';
  else if (counts.timedOut) status = 'timedOut';
  else if (counts.failed) status = 'failed';
  else if (exitCode !== 0) status = 'error';
  else if (counts.skipped) status = 'skipped';
  else status = 'passed';
  if (executionError && ['error', 'timedOut', 'canceled'].includes(status))
    errors.push(stripVTControlCharacters(executionError));
  if (status === 'error' && errors.length === 0) errors.push(`Runner exited with code ${exitCode}.`);
  return { runId, status, tests, counts, exitCode, signal, errors };
}
