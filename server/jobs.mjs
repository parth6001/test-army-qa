import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function createJobManager(root = path.resolve('.test-army/runs')) {
  let active = null;
  return {
    get active() { return active; },
    start(timeoutMs = 240000) {
      if (active?.cleanupFailed) throw new Error('Previous task cleanup failed. Restart the server before retrying.');
      if (active) throw new Error('Another task is running. Wait for it to finish or cancel it first.');
      fs.mkdirSync(root, { recursive: true });
      // Only expire owned UUID directories; never follow links or touch the active job.
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!/^[a-f0-9-]{36}$/.test(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) continue;
        const candidate = path.join(root, entry.name);
        if (Date.now() - fs.statSync(candidate).mtimeMs > 7 * 86400000)
          fs.rmSync(candidate, { recursive: true, force: true });
      }
      const id = randomUUID();
      const dir = path.join(root, id);
      fs.mkdirSync(dir);
      const controller = new AbortController();
      const job = { id, dir, controller, signal: controller.signal,
        auth: path.join(dir, 'auth.json'), artifacts: path.join(dir, 'artifacts'),
        cancel(reason = 'Task canceled.') { controller.abort(new Error(reason)); },
        check() { controller.signal.throwIfAborted(); },
      };
      const timer = setTimeout(() => job.cancel('Task timed out.'), timeoutMs);
      job.finish = () => {
        clearTimeout(timer);
        fs.rmSync(job.auth, { force: true });
        if (!job.cleanupFailed && active === job) active = null;
      };
      active = job;
      return job;
    },
  };
}

export async function withBrowser(job, launch, action) {
  job.check();
  const browser = await launch();
  let closing;
  const close = () => (closing ??= Promise.resolve().then(() => browser.close()).catch(error => {
    job.cleanupFailed = true;
    throw error;
  }));
  const abort = () => { close().catch(() => {}); };
  job.signal.addEventListener('abort', abort, { once: true });
  try {
    job.check();
    return await action(browser);
  } finally {
    job.signal.removeEventListener('abort', abort);
    await close();
  }
}
