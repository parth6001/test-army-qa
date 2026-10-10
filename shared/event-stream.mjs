import { isRunResult } from './run-result.mjs';

// Parse only the application's protocol; stale servers or malformed payloads fail closed.
export async function readEventStream(response, onEvent, expectedCompletion) {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.error === 'string' ? body.error : `Request failed (HTTP ${response.status}).`);
  }
  if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'text/event-stream' || !response.body)
    throw new Error('Expected a live event stream from the server.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let hasCode = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) throw new Error('Connection ended before a complete result arrived. Please retry.');
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:'))
          .map(line => line.slice(5).trimStart()).join('\n');
        if (!data) continue; // SSE comments/heartbeats
        let event;
        try { event = JSON.parse(data); } catch { throw new Error('Server sent a malformed event.'); }
        if (!event || typeof event.type !== 'string') throw new Error('Invalid server event.');
        if (event.type === 'error') throw new Error(typeof event.data === 'string' ? event.data : 'Server request failed.');
        if (event.type === 'done') {
          if (event.data?.kind !== expectedCompletion) throw new Error('Unexpected completion from server.');
          if (expectedCompletion === 'run' && !isRunResult(event.data.result))
            throw new Error('Server returned an invalid run result.');
          if (expectedCompletion === 'generated' && !hasCode) throw new Error('Generation completed without test code.');
          onEvent(event);
          return;
        }
        if (!['job', 'progress', 'testCode', 'results', 'awaitReview'].includes(event.type) || typeof event.data !== 'string')
          throw new Error('Server sent an unsupported event. Please refresh after updating the server.');
        if (event.type === 'testCode') hasCode = Boolean(event.data.trim());
        onEvent(event);
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function requestEventStream(url, body, onEvent, expectedCompletion, timeoutMs = 300000, request = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await request(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Test-Army': '1' },
      body: JSON.stringify(body), signal: controller.signal,
    });
    await readEventStream(response, onEvent, expectedCompletion);
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Request timed out. The server may still be running; no completed result was received.', { cause: error });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
