import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// Spawn the local runner directly so the tracked PID owns the complete runner tree.
export function executeRunner(job, env, { spawnProcess = spawn, platform = process.platform,
  killProcess = process.kill, timeoutMs = 120000, cleanupMs = 10000 } = {}) {
  job.check();
  return new Promise((resolve, reject) => {
    const child = spawnProcess(process.execPath, [require.resolve('@playwright/test/cli'), 'test',
      '--reporter=list,json', '--config=playwright.external.config.ts'],
    { env, windowsHide: true, detached: platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let stopError = null;
    let stopping = Promise.resolve();
    let cleanupTimer;
    const capture = chunk => { output = (output + chunk.toString()).slice(-1000000); };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    const stop = () => {
      if (!child.pid) return;
      cleanupTimer = setTimeout(() => {
        job.cleanupFailed = true;
        reject(new Error('Runner cleanup timed out. Restart the server before retrying.'));
      }, cleanupMs);
      stopping = new Promise(done => {
        if (platform === 'win32') {
          const killer = spawnProcess('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
          killer.on('error', error => { stopError = error; done(); });
          killer.on('close', code => {
            if (code !== 0) stopError = new Error('Could not confirm runner process cleanup. Restart the server before retrying.');
            done();
          });
        } else {
          try { killProcess(-child.pid, 'SIGKILL'); }
          catch (error) { if (error.code !== 'ESRCH') stopError = error; }
          done();
        }
      });
      stopping.then(() => {
        if (stopError) { clearTimeout(cleanupTimer); job.cleanupFailed = true; reject(stopError); }
      });
    };
    job.signal.addEventListener('abort', stop, { once: true });
    const timer = setTimeout(() => job.cancel('Run timed out.'), timeoutMs);
    child.on('error', error => {
      clearTimeout(timer);
      job.signal.removeEventListener('abort', stop);
      reject(error);
    });
    child.on('close', async (exitCode, signal) => {
      clearTimeout(timer);
      job.signal.removeEventListener('abort', stop);
      await stopping;
      clearTimeout(cleanupTimer);
      if (stopError) { job.cleanupFailed = true; reject(stopError); return; }
      resolve({ output, exitCode, signal });
    });
    if (job.signal.aborted) stop();
  });
}
