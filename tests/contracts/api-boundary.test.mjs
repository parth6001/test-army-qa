import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { installApiBoundary } from '../../server/api-boundary.mjs';

test('local HTTP API boundary rejects invalid callers and input before admission', async t => {
  const app = express();
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  installApiBoundary(app, port);
  let admitted = 0;
  app.post('/api/:operation', (_req, res) => { admitted++; res.json({ accepted: true }); });
  const headers = { Origin: 'http://localhost:5173', 'X-Test-Army': '1', 'Content-Type': 'application/json' };
  const body = { url: 'http://fixture.test/page', description: 'Check local fixture' };
  async function request({ patch = {}, payload = body, raw, method = 'POST' } = {}) {
    const merged = { ...headers, ...patch };
    for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key];
    return new Promise((resolve, reject) => {
      const req = http.request(`http://127.0.0.1:${port}/api/generate`, { method, headers: merged }, res => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve({ status: res.statusCode,
          headers: new Headers(res.headers), json: async () => JSON.parse(data) }));
      });
      req.on('error', reject);
      req.end(method === 'OPTIONS' ? undefined : raw ?? JSON.stringify(payload));
    });
  }
  for (const [name, options, status] of [
    ['unknown origin', { patch: { Origin: 'https://unrelated.test' } }, 403],
    ['missing origin', { patch: { Origin: undefined } }, 403],
    ['opaque origin', { patch: { Origin: 'null' } }, 403],
    ['origin suffix', { patch: { Origin: 'http://localhost:5173.evil.test' } }, 403],
    ['rebound host', { patch: { Host: `unrelated.test:${port}` } }, 403],
    ['missing header', { patch: { 'X-Test-Army': undefined } }, 403],
    ['simple form', { patch: { 'Content-Type': 'text/plain' } }, 415],
    ['broken JSON', { raw: '{' }, 400],
    ['oversized JSON', { payload: { ...body, description: 'a'.repeat(270000) } }, 413],
    ['array body', { payload: [] }, 400],
    ['missing URL', { payload: { description: 'Check' } }, 400],
    ['nonstring URL', { payload: { ...body, url: {} } }, 400],
    ['file URL', { payload: { ...body, url: 'file:///example' } }, 400],
    ['embedded credential', { payload: { ...body, url: 'https://name:password@fixture.test' } }, 400],
    ['blank description', { payload: { ...body, description: ' ' } }, 400],
    ['oversized description', { payload: { ...body, description: 'a'.repeat(10001) } }, 400],
    ['mistyped flag', { payload: { ...body, autoRun: 'false' } }, 400],
    ['incomplete login', { payload: { ...body, login: {} } }, 400],
    ['extra field', { payload: { ...body, environment: {} } }, 400],
    ['unapproved preflight', { method: 'OPTIONS', patch: { 'Access-Control-Request-Method': 'DELETE' } }, 403],
  ]) {
    await t.test(name, async () => {
      const response = await request(options);
      assert.equal(response.status, status);
      assert.equal(typeof (await response.json()).error, 'string');
      assert.equal(admitted, 0);
    });
  }
  await t.test('approved preflight', async () => {
    const response = await request({ method: 'OPTIONS', patch: {
      'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-test-army',
    } });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), headers.Origin);
    assert.equal(admitted, 0);
  });
  await t.test('approved request and intranet-style URL', async () => {
    const response = await request();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), headers.Origin);
    assert.deepEqual(await response.json(), { accepted: true });
    assert.equal(admitted, 1);
  });
});
