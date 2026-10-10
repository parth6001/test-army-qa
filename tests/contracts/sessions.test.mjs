import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSessionFixture } from './session-fixture.mjs';
import { createSessionStore } from '../../server/sessions.mjs';
import { createApiClient } from '../../shared/api-client.mjs';

test('HTTP sessions protect work, cancellation and screenshot files', async t => {
  const fixture = await startSessionFixture();
  t.after(() => fixture.close());
  const origin = 'http://localhost:5173';
  async function request(route, token, body, extra = {}) {
    return fetch(fixture.baseUrl + route, { method: body === undefined ? 'GET' : 'POST',
      headers: { Origin: origin, 'X-Test-Army': '1', 'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra },
      body: body === undefined ? undefined : JSON.stringify(body) });
  }
  const alice = await (await request('/api/session', null, {})).json();
  const bob = await (await request('/api/session', null, {})).json();
  assert.notEqual(alice.token, bob.token);
  await t.test('missing and forged sessions cannot reach work or models', async () => {
    for (const token of [null, '0'.repeat(64), 'invalid']) {
      assert.equal((await request('/api/inspect', token, { url: 'http://fixture.test' })).status, 401);
      assert.equal((await request('/api/models', token)).status, 401);
    }
    assert.equal(fixture.calls, 0);
  });
  await t.test('session is bound to its approved origin', async () => {
    assert.equal((await request('/api/models', alice.token, undefined, { Origin: 'http://127.0.0.1:5173' })).status, 401);
    assert.equal((await request('/api/models', alice.token)).status, 200);
  });
  const response = await request('/api/run', alice.token, { url: 'http://fixture.test', code: '// fixture only' });
  assert.equal(response.status, 200);
  const job = await response.json();
  await t.test('another session cannot cancel a known run ID', async () => {
    assert.equal((await request(`/api/jobs/${job.id}/cancel`, bob.token, {})).status, 404);
    assert.equal(fixture.jobs.active.signal.aborted, false);
  });
  await t.test('only owner can read screenshot; response cannot be cached', async () => {
    assert.equal((await request(job.screenshot)).status, 401);
    assert.equal((await request(job.screenshot, bob.token)).status, 404);
    const image = await request(job.screenshot, alice.token);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.equal(image.headers.get('cache-control'), 'no-store');
    assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
    assert.ok((await image.arrayBuffer()).byteLength > 0);
  });
  await t.test('rejects non-images, encoded traversal, backslashes and linked directories', async () => {
    const prefix = `/screenshots/${job.id}/`;
    for (const file of ['private.json', '%2e%2e%2fauth.png', 'sub%5c..%5cfailure.png', '.hidden.png'])
      assert.equal((await request(prefix + file, alice.token)).status, 404);
    // Windows junctions do not require symlink developer mode.
    const linked = path.join(fixture.jobs.active.artifacts, 'linked');
    await fs.symlink(fixture.jobs.active.dir, linked, process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal((await request(prefix + 'linked/artifacts/failure.png', alice.token)).status, 404);
    await fs.unlink(linked);
  });
  await t.test('owner cancellation works; screenshots survive task completion', async () => {
    assert.equal((await request(`/api/jobs/${job.id}/cancel`, alice.token, {})).status, 200);
    assert.equal(fixture.jobs.active.signal.aborted, true);
    fixture.jobs.active.finish();
    assert.equal((await request(job.screenshot, alice.token)).status, 200);
  });
  await t.test('expired session cannot read artifacts or perform work', async () => {
    fixture.expire();
    assert.equal((await request(job.screenshot, alice.token)).status, 401);
    assert.equal((await request('/api/inspect', alice.token, { url: 'http://fixture.test' })).status, 401);
    assert.equal(fixture.calls, 1);
    assert.equal((await request('/api/session', null, {})).status, 200);
  });
});

test('session store is bounded, expires credentials and forgets them on restart', () => {
  let now = 10;
  const store = createSessionStore({ now: () => now, lifetimeMs: 10, capacity: 1 });
  const session = store.create('origin');
  assert.equal(store.create('origin'), null);
  assert.equal(createSessionStore().authenticate(`Bearer ${session.token}`, 'origin'), null);
  now = 20;
  assert.equal(store.authenticate(`Bearer ${session.token}`, 'origin'), null);
  assert.ok(store.create('origin'));
});

test('client coalesces bootstrap, sends no token in URL, and never replays a 401', async () => {
  const calls = [];
  let sessions = 0;
  let expired = false;
  const client = createApiClient('http://fixture.test', async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/api/session')) {
      sessions++;
      return Response.json({ token: String(sessions).repeat(64), expiresAt: Date.now() + 60000 });
    }
    return Response.json({}, { status: expired ? 401 : 200 });
  });
  await Promise.all([client('/api/models'), client('/api/models')]);
  assert.equal(sessions, 1);
  assert.equal(calls.length, 3);
  assert.equal(calls[1].options.headers.get('Authorization'), `Bearer ${'1'.repeat(64)}`);
  expired = true;
  assert.equal((await client('/api/run', { method: 'POST', body: '{}' })).status, 401);
  assert.equal(calls.length, 4);
  expired = false;
  await client('/api/models');
  assert.equal(sessions, 2);
  for (const call of calls) {
    assert.equal(call.options.redirect, 'error');
    assert.equal(call.options.credentials, 'omit');
    assert.ok(!call.url.includes('token') && !call.url.includes('Bearer'));
  }
  await assert.rejects(client('https://unrelated.test/screenshots/image.png'), /unrelated/);
  assert.equal(calls.length, 6);
});

test('invalid bootstrap cannot submit work', async () => {
  let calls = 0;
  const client = createApiClient('http://fixture.test', async () => { calls++; return Response.json({}); });
  await assert.rejects(client('/api/run', { method: 'POST', body: '{}' }), /Invalid local session/);
  assert.equal(calls, 1);
});
