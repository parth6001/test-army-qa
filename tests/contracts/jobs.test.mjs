import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createJobManager, withBrowser } from '../../server/jobs.mjs';
import { executeRunner } from '../../server/runner.mjs';
import { EventEmitter } from 'node:events';

function fixture(t) {
  const parent = path.resolve('.test-army/contract-fixtures');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'jobs-'));
  const manager = createJobManager(root);
  t.after(() => {
    manager.active?.finish();
    assert.equal(path.dirname(root), parent);
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, manager };
}

test('rejects overlapping jobs; reruns own distinct code/auth/artifacts', t => {
  const { manager } = fixture(t);
  const first = manager.start();
  fs.writeFileSync(first.auth, 'fixture-session');
  assert.throws(() => manager.start(), /Another task/);
  first.finish();
  assert.equal(fs.existsSync(first.auth), false);
  const second = manager.start();
  assert.notEqual(first.dir, second.dir);
  assert.notEqual(first.artifacts, second.artifacts);
  assert.equal(fs.existsSync(second.auth), false);
  first.finish(); // A stale cleanup cannot release a newer job.
  assert.equal(manager.active, second);
});

test('cancel holds admission gate until cleanup and remains idempotent', t => {
  const { manager } = fixture(t);
  const job = manager.start();
  job.cancel(); job.cancel();
  assert.throws(() => job.check(), /canceled/);
  assert.throws(() => manager.start(), /Another task/);
  job.finish();
  assert.equal(manager.active, null);
});

test('deadline aborts work', async t => {
  const { manager } = fixture(t);
  const job = manager.start(5);
  await new Promise(resolve => job.signal.addEventListener('abort', resolve, { once: true }));
  assert.match(job.signal.reason.message, /timed out/);
});

test('navigation or context failure always closes browser', async t => {
  const { manager } = fixture(t);
  let closed = 0;
  await assert.rejects(withBrowser(manager.start(), async () => ({ close: async () => { closed++; } }),
    async () => { throw new Error('navigation failed'); }), /navigation failed/);
  assert.equal(closed, 1);
});

test('cancellation during launch closes newly acquired browser without using it', async t => {
  const { manager } = fixture(t);
  const job = manager.start();
  let closed = 0;
  await assert.rejects(withBrowser(job, async () => {
    job.cancel(); return { close: async () => { closed++; } };
  }, async () => assert.fail('Canceled browser must not be used')), /canceled/);
  assert.equal(closed, 1);
});

test('browser cleanup failure keeps gate closed but removes authentication', async t => {
  const { manager } = fixture(t);
  const job = manager.start();
  fs.writeFileSync(job.auth, 'fixture');
  await assert.rejects(withBrowser(job, async () => ({ close: async () => { throw new Error('close failed'); } }),
    async () => {}), /close failed/);
  job.finish();
  assert.equal(fs.existsSync(job.auth), false);
  assert.throws(() => manager.start(), /Restart the server/);
});

test('retention expires only old owned folders', t => {
  const { root, manager } = fixture(t);
  const old = path.join(root, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  const unrelated = path.join(root, 'keep-me');
  fs.mkdirSync(old); fs.mkdirSync(unrelated);
  const past = new Date(Date.now() - 8 * 86400000);
  fs.utimesSync(old, past, past); fs.utimesSync(unrelated, past, past);
  manager.start();
  assert.equal(fs.existsSync(old), false);
  assert.equal(fs.existsSync(unrelated), true);
});

function fakeProcess(pid = 123) {
  const child = new EventEmitter();
  child.pid = pid;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

test('Windows cancellation targets owned process tree and waits for runner close', async t => {
  const { manager } = fixture(t);
  const job = manager.start();
  const child = fakeProcess();
  const killer = fakeProcess(456);
  const calls = [];
  const pending = executeRunner(job, {}, { platform: 'win32', spawnProcess: (...args) => {
    calls.push(args); return calls.length === 1 ? child : killer;
  } });
  job.cancel();
  assert.equal(calls[0][2].windowsHide, true);
  assert.deepEqual(calls[1].slice(0, 2), ['taskkill.exe', ['/PID', '123', '/T', '/F']]);
  let settled = false;
  pending.then(() => { settled = true; });
  killer.emit('close', 0);
  await Promise.resolve();
  assert.equal(settled, false);
  child.emit('close', null, 'SIGTERM');
  assert.equal((await pending).signal, 'SIGTERM');
});

test('failed process termination keeps admission closed', async t => {
  const { manager } = fixture(t);
  const job = manager.start();
  const child = fakeProcess();
  const killer = fakeProcess(456);
  const pending = executeRunner(job, {}, { platform: 'win32', spawnProcess: command =>
    command === 'taskkill.exe' ? killer : child });
  job.cancel();
  killer.emit('error', new Error('Access denied'));
  await assert.rejects(pending, /Access denied/);
  job.finish();
  assert.throws(() => manager.start(), /Restart the server/);
  child.emit('close', null, null);
});

test('runner deadline kills owned POSIX process group', async t => {
  const { manager } = fixture(t);
  const job = manager.start();
  const child = fakeProcess();
  const killed = [];
  const pending = executeRunner(job, {}, { platform: 'linux', timeoutMs: 5,
    spawnProcess: () => child, killProcess: (...args) => {
      killed.push(args); queueMicrotask(() => child.emit('close', null, 'SIGKILL'));
    } });
  await pending;
  assert.deepEqual(killed, [[-123, 'SIGKILL']]);
  assert.match(job.signal.reason.message, /timed out/);
});

test('runner spawn failure is an error, never success', async t => {
  const { manager } = fixture(t);
  const child = fakeProcess(undefined);
  const pending = executeRunner(manager.start(), {}, { spawnProcess: () => child });
  child.emit('error', new Error('spawn EPERM'));
  await assert.rejects(pending, /spawn EPERM/);
  child.emit('close', null, null);
});
