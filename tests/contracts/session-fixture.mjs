import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { installApiBoundary } from '../../server/api-boundary.mjs';
import { createSessionStore, installSessions, installCancellation, registerSessionJob } from '../../server/sessions.mjs';
import { installArtifacts } from '../../server/artifacts.mjs';
import { createJobManager } from '../../server/jobs.mjs';

export async function startSessionFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'test-army-session-'));
  const app = express();
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const port = server.address().port;
  let clock = Date.now();
  let calls = 0;
  const store = createSessionStore({ now: () => clock, lifetimeMs: 60000 });
  const jobs = createJobManager(root);
  installApiBoundary(app, port);
  installSessions(app, store);
  installArtifacts(app);
  installCancellation(app, jobs);
  app.get('/api/models', (_req, res) => res.json({ models: [] }));
  app.post('/api/inspect', (_req, res) => { calls++; res.json({ title: 'Controlled fixture' }); });
  app.post('/api/run', async (req, res) => {
    calls++;
    const job = jobs.start();
    registerSessionJob(req.session, job);
    await fs.mkdir(job.artifacts);
    await fs.writeFile(path.join(job.artifacts, 'failure.png'), Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'));
    await fs.writeFile(path.join(job.artifacts, 'private.json'), '{"fixture":true}');
    // No submitted code is executed. Exercise real ownership/cancellation/file routes.
    res.json({ id: job.id, screenshot: `/screenshots/${job.id}/failure.png` });
  });
  return {
    baseUrl: `http://127.0.0.1:${port}`, jobs,
    get calls() { return calls; },
    expire() { clock += 60001; },
    async close() {
      jobs.active?.finish();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      const resolved = path.resolve(root);
      if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(resolved).startsWith('test-army-session-'))
        throw new Error('Refusing unsafe fixture cleanup');
      await fs.rm(resolved, { recursive: true, force: true });
    },
  };
}
