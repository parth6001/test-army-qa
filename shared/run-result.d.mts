export type TestStatus = 'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted';
export type RunStatus = 'passed' | 'failed' | 'skipped' | 'timedOut' | 'canceled' | 'noTests' | 'error';
export interface TestRow {
  title: string;
  status: TestStatus;
  durationMs: number;
  error: string;
  screenshot: string | null;
}
export interface RunResult {
  runId: string;
  status: RunStatus;
  tests: TestRow[];
  counts: Record<TestStatus | 'total', number>;
  exitCode: number | null;
  signal: string | null;
  errors: string[];
}
export const testStatuses: TestStatus[];
export const runStatuses: RunStatus[];
export const statusLabels: Record<RunStatus | 'interrupted', string>;
export function countTests(tests: TestRow[]): RunResult['counts'];
export function isRunResult(value: unknown): value is RunResult;
