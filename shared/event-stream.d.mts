import type { RunResult } from './run-result.mjs';
export type StreamEvent =
  | { type: 'job' | 'progress' | 'testCode' | 'results' | 'awaitReview'; data: string }
  | { type: 'done'; data: { kind: 'generated' } | { kind: 'run'; result: RunResult } };
export function readEventStream(response: Response, onEvent: (event: StreamEvent) => void, expectedCompletion: 'generated' | 'run'): Promise<void>;
export function requestEventStream(url: string, body: object, onEvent: (event: StreamEvent) => void, expectedCompletion: 'generated' | 'run', timeoutMs?: number, request?: (url: string, options?: RequestInit) => Promise<Response>): Promise<void>;
