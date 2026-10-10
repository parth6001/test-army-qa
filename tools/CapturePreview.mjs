import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = 5179;
const url = `http://127.0.0.1:${port}`;
const output = path.join(root, 'docs', 'assets', 'test-army-workspace.png');
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: root, stdio: 'ignore', windowsHide: true,
});
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error(`Vite stopped before startup (exit ${server.exitCode}).`);
    try { ready = (await fetch(url)).ok; } catch { /* Wait for the local server. */ }
    if (ready) break;
    await delay(250);
  }
  if (!ready) throw new Error('Timed out waiting for the local Vite preview.');
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await page.route('http://localhost:3001/**', route => route.abort());
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: '⚔ Test Army' }).waitFor();
  await mkdir(path.dirname(output), { recursive: true });
  await page.screenshot({ path: output, fullPage: true, animations: 'disabled' });
  process.stdout.write(`Captured ${path.relative(root, output)}\n`);
} finally {
  await browser?.close();
  server.kill();
}
