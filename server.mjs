import 'dotenv/config';
import express from 'express';
import { installApiBoundary } from './server/api-boundary.mjs';
import { installSessions, installCancellation, registerSessionJob } from './server/sessions.mjs';
import { installArtifacts } from './server/artifacts.mjs';
import { chromium } from 'playwright';
import { createJobManager, withBrowser } from './server/jobs.mjs';
import { executeRunner } from './server/runner.mjs';
import { summarizeRun } from './server/run-report.mjs';
import fs from 'fs';
import path from 'path';
import { query } from '@anthropic-ai/claude-agent-sdk';

const jobs = createJobManager();
// LLM backend: 'claude' (Claude Code subscription, no API key) or 'openrouter'
const LLM_BACKEND = (process.env.LLM_BACKEND || 'openrouter').toLowerCase();
const app = express();
installApiBoundary(app);
installSessions(app);
installArtifacts(app);
installCancellation(app, jobs);

let FREE_MODELS = [];

async function fetchFreeModels() {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` },
    });
    const data = await res.json();
    FREE_MODELS = (data.data || [])
      .filter(m => m.id.endsWith(':free'))
      .map(m => m.id)
      .slice(0, 5);
    console.log('Available free models:', FREE_MODELS);
  } catch (err) {
    console.warn('Could not fetch models, using hardcoded fallback:', err.message);
    FREE_MODELS = [
      'google/gemma-2-9b-it:free',
      'deepseek/deepseek-r1:free',
      'microsoft/phi-3-mini-128k-instruct:free',
    ];
  }
}



// Capture cookies/localStorage only in the current job for crawl + tests.
async function loginAndSave(login, send, job) {
  send('progress', `🔐 Logging in at ${login.url}...`);
  return withBrowser(job, () => chromium.launch(), async browser => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(login.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);

    const userField = login.userSelector
      ? page.locator(login.userSelector)
      : page.locator('input[type="email"], input[name*="user" i], input[name*="email" i], input[id*="user" i], input[type="text"]').first();
    await userField.fill(login.username);

    const passField = login.passSelector
      ? page.locator(login.passSelector)
      : page.locator('input[type="password"]').first();
    await passField.fill(login.password);

    const submit = page.locator('button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Log in"), button:has-text("Sign in")').first();
    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}),
      submit.click({ timeout: 5000 }).catch(() => passField.press('Enter')),
    ]);
    await page.waitForTimeout(2000);

    await context.storageState({ path: job.auth });
    send('progress', 'Session captured for this task.');
  });
}

async function crawlPage(url, send, useAuth, job) {
  send('progress', '🌐 Launching headless browser...');
  return withBrowser(job, () => chromium.launch(), async browser => {
  const context = await browser.newContext(
    useAuth && fs.existsSync(job.auth) ? { storageState: job.auth } : {}
  );
  const page = await context.newPage();

  send('progress', `📡 Navigating to ${url}...`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  send('progress', '⏳ Waiting for page JS to render...');
  await page.waitForSelector('input, button, [role=button]', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);

  send('progress', '🔍 Scraping page structure...');
  const data = await page.evaluate(() => {
    const text = (el) => el?.textContent?.trim().slice(0, 100) || '';
    return {
      title: document.title,
      url: location.href,
      headings: [...document.querySelectorAll('h1,h2,h3')].map(text).filter(Boolean).slice(0, 10),
      buttons: [...document.querySelectorAll('button,[role=button],[type=submit]')].map(text).filter(Boolean).slice(0, 15),
      links: [...document.querySelectorAll('a[href]')].map(a => ({ text: text(a), href: a.getAttribute('href') })).filter(l => l.text).slice(0, 15),
      inputs: [...document.querySelectorAll('input,textarea,select,[role=combobox]')].map(el => ({
        type: el.type || el.tagName.toLowerCase(),
        name: el.name || el.id || el.placeholder || el.getAttribute('aria-label') || '',
        placeholder: el.placeholder || el.getAttribute('placeholder') || '',
        role: el.getAttribute('role') || '',
        label: document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim() || el.getAttribute('aria-label') || '',
      })).slice(0, 20),
      forms: document.querySelectorAll('form').length,
      images: [...document.querySelectorAll('img[alt]')].map(i => i.alt).filter(Boolean).slice(0, 8),
    };
  });

  // Interactive probe: open combobox/search widgets, scrape revealed options + real rows
  send('progress', '🖱️ Probing search/filter widgets (click to reveal options)...');
  data.comboboxes = await probeComboboxes(page);
  data.sampleRows = await scrapeSampleRows(page);
  if (data.comboboxes.length) {
    send('progress', `🎛️ Filter fields found: ${data.comboboxes.flatMap(c => c.options).slice(0, 12).join(', ')}…`);
  }
  if (data.sampleRows.length) {
    send('progress', `📑 Sample rows: ${data.sampleRows.slice(0, 3).join(' | ')}`);
  }

  return data;
  });
}

// Click combobox-style inputs, scrape the dropdown options they reveal
async function probeComboboxes(page) {
  const results = [];
  const candidates = await page
    .locator('input[role="combobox"], [role="combobox"], input[aria-haspopup], input[placeholder*="search" i], input[placeholder*="keyword" i], input[placeholder*="filter" i]')
    .all()
    .catch(() => []);

  for (const el of candidates.slice(0, 3)) {
    try {
      const placeholder = (await el.getAttribute('placeholder').catch(() => '')) || '';
      await el.click({ timeout: 3000 });
      await page.waitForTimeout(700);
      const options = await page.evaluate(() => {
        const sel = '[role="option"], [role="listbox"] li, [role="menu"] [role="menuitem"], .dropdown-item, ul[class*="dropdown" i] li, [class*="option" i], [class*="suggestion" i] li';
        const seen = new Set();
        const out = [];
        document.querySelectorAll(sel).forEach(n => {
          const t = n.textContent?.replace(/\s+/g, ' ').trim();
          const r = n.getBoundingClientRect();
          if (t && r.width > 0 && r.height > 0 && t.length > 0 && t.length < 40 && !seen.has(t)) {
            seen.add(t);
            out.push(t);
          }
        });
        return out.slice(0, 40);
      });
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(200);
      if (options.length) results.push({ placeholder, options });
    } catch {
      // widget not clickable / no dropdown — skip
    }
  }
  return results;
}

// Grab a few real data rows so the model uses real values (e.g. real IDs)
async function scrapeSampleRows(page) {
  return await page.evaluate(() => {
    const sel = 'tbody tr, [role="row"], [class*="list-item" i], [class*="grid-row" i], [class*="table-row" i]';
    const seen = new Set();
    const out = [];
    document.querySelectorAll(sel).forEach(n => {
      const t = n.textContent?.replace(/\s+/g, ' ').trim();
      const r = n.getBoundingClientRect();
      if (t && r.height > 0 && t.length > 3 && t.length < 200 && !seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    });
    return out.slice(0, 8);
  }).catch(() => []);
}

async function generateTests(pageData, targetUrl, userDescription, send, useAuth, job) {
  const authNote = useAuth
    ? `\nAUTH: User is ALREADY LOGGED IN (session restored via storageState). Do NOT write any login steps. Each test goes straight to "${targetUrl}" already authenticated.\n`
    : '';

  const comboNote = (pageData.comboboxes && pageData.comboboxes.length)
    ? `\nINTERACTIVE FILTER/SEARCH WIDGETS (these are COMBOBOXES, not native <select>):
${pageData.comboboxes.map(c => `- input placeholder "${c.placeholder}" → click it to open a dropdown, then click one of these field options by text: ${JSON.stringify(c.options)}`).join('\n')}
To use a combobox: click the input (page.getByPlaceholder(/.../)), then click the desired option with page.getByText('OptionName', { exact: true }).click(), then type the value and press Enter. NEVER use page.selectOption() on these — they are not <select>.\n`
    : '';

  const rowsNote = (pageData.sampleRows && pageData.sampleRows.length)
    ? `\nREAL DATA ROWS currently in the list (use these REAL values — do NOT invent IDs like INC-1 that may not exist):
${pageData.sampleRows.map(r => `- ${r}`).join('\n')}
Locate rows by their visible text via page.getByText('<real value>'). Do NOT assume a <table>/tbody/tr structure unless the rows above came from one.\n`
    : '';

  const prompt = `You are a senior Playwright test engineer. Generate comprehensive TypeScript Playwright tests for this page.

TARGET URL: ${targetUrl}
USER WANTS TO TEST: ${userDescription}
${authNote}${comboNote}${rowsNote}
PAGE STRUCTURE:
- Title: "${pageData.title}"
- Headings: ${JSON.stringify(pageData.headings)}
- Buttons: ${JSON.stringify(pageData.buttons)}
- Links (sample): ${JSON.stringify(pageData.links.slice(0, 8))}
- Input fields: ${JSON.stringify(pageData.inputs)}
- Forms: ${pageData.forms}
- Images: ${JSON.stringify(pageData.images)}

STRICT PLAYWRIGHT RULES (violations will cause test failures):
1. ALWAYS use full URL "${targetUrl}" in every page.goto() call
2. NEVER use expect(page.url()) — use await expect(page).toHaveURL(/pattern/) instead
3. After clicking submit/login button, ALWAYS add: await page.waitForTimeout(2000) before assertions
4. For error messages you cannot know exact text of: use await expect(page.locator('text=/error|invalid|required/i')).toBeVisible() with regex
5. Use page.locator('input[name="x"]') for inputs with known name attributes
6. Use page.getByRole('button', { name: 'X' }) for buttons
7. Each test must call page.goto() at start — never share state between tests
8. Do NOT assert exact error message text — app text unknown, use regex: /error|invalid|required/i
9. For filter/search use the COMBOBOX pattern above (click input → click option → type → Enter). Never page.selectOption() on a combobox.
10. Use ONLY the real data values listed above for happy-path matches; reserve fake IDs for negative "no results" tests.

TEST GROUPS — generate all three using test.describe():
- "Happy Path": valid flows that succeed (page loads, fields fill, login works with real-looking creds)
- "Negative Cases": invalid/wrong inputs that trigger errors
- "Edge Cases": empty fields, 500-char strings, SQL injection strings, XSS strings, spaces-only input

OUTPUT: ONLY valid TypeScript. No markdown. No explanation. No comments except where logic is non-obvious.
First line must be exactly: import { test, expect } from '@playwright/test';
Aim for 15-25 tests — one test per case in the user's description. Do not under-generate.`;

  if (LLM_BACKEND === 'claude') {
    return await generateViaClaude(prompt, send, job);
  }

  const FALLBACK_MODELS = process.env.OPENROUTER_MODEL
    ? [process.env.OPENROUTER_MODEL, ...FREE_MODELS]
    : FREE_MODELS;

  let lastError;
  for (const model of FALLBACK_MODELS) {
    job.check();
    send('progress', `🤖 Trying model: ${model}...`);
    try {
      const result = await callOpenRouter(model, prompt, send, job);
      return result;
    } catch (err) {
      job.check();
      send('progress', `⚠️ ${model} failed: ${err.message} — trying next...`);
      lastError = err;
    }
  }
  throw lastError || new Error('No models available. Configure a provider model and retry.');
}

// Generate via Claude Code subscription (Agent SDK) — no ANTHROPIC_API_KEY needed
async function generateViaClaude(prompt, send, job) {
  send('progress', '🤖 Claude (subscription) generating tests...');
  let raw = '';
  let assistantText = '';   // fallback: accumulate text blocks across turns
  for await (const msg of query({
    prompt,
    options: {
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
      maxTurns: 8,
      abortController: job.controller,
      allowedTools: [],          // text-only, no tool use / file access
      permissionMode: 'bypassPermissions',
      settingSources: [],        // ignore project CLAUDE.md, hooks, MCP
    },
  })) {
    if (msg.type === 'assistant') {
      for (const block of msg.message?.content || []) {
        if (block.type === 'text') assistantText += block.text;
      }
    }
    if (msg.type === 'result') {
      if (msg.subtype === 'success') raw = msg.result;
      else if (assistantText.trim()) raw = assistantText;   // turns capped but we have output
      else throw new Error(`Claude SDK ${msg.subtype}`);
    }
  }
  if (!raw || !raw.trim()) raw = assistantText;
  if (!raw || !raw.trim()) throw new Error('Claude returned empty content');
  send('progress', '✅ AI finished generating tests...');
  return cleanCode(raw);
}

// Strip markdown fences, validate output is non-truncated TS
function cleanCode(raw) {
  let code = raw.replace(/^```(?:typescript|ts)?\n?/i, '').replace(/\n?```$/i, '').trim();
  if (!code.startsWith('import')) {
    throw new Error(`Output missing import statement — likely truncated or wrong format`);
  }
  const opens = (code.match(/\{/g) || []).length;
  const closes = (code.match(/\}/g) || []).length;
  if (opens !== closes) {
    throw new Error(`Truncated output — unbalanced braces (${opens} open vs ${closes} close). Model hit token limit.`);
  }
  return code;
}

async function callOpenRouter(model, prompt, send, job) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    signal: job.signal,
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:5173',
      'X-Title': 'Test Army',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      messages: [
        { role: 'system', content: 'You are a Playwright test engineer. Output only valid TypeScript test code. No markdown fences, no explanations.' },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${err}`);
  }

  const data = await res.json();

  // Log full response shape to server console for debugging
  console.log('OpenRouter response keys:', Object.keys(data));
  if (data.error) throw new Error(`OpenRouter error: ${JSON.stringify(data.error)}`);
  if (!data.choices || data.choices.length === 0) {
    console.error('Full response:', JSON.stringify(data, null, 2));
    throw new Error(`No choices in response. Model returned: ${JSON.stringify(data)}`);
  }

  const raw = data.choices[0].message?.content;
  if (!raw || raw.trim().length === 0) {
    throw new Error(`Model returned empty content`);
  }

  send('progress', '✅ AI finished generating tests...');
  return cleanCode(raw);
}

app.get('/api/models', (_req, res) => res.json({ models: FREE_MODELS }));
function begin(req, res) {
  if (req.session.jobs.size >= 512) {
    res.status(429).json({ error: 'Session task limit reached. Reload the UI to start a new session.' });
    return null;
  }
  let job;
  try { job = jobs.start(); }
  catch (error) { res.status(409).json({ error: error.message }); return null; }
  registerSessionJob(req.session, job);
  res.on('close', () => { if (!res.writableEnded) job.cancel('Connection closed. Task canceled.'); });
  return job;
}
function finish(job) {
  // Keep the admission gate closed when cleanup cannot be confirmed.
  job.finish();
}

app.post('/api/inspect', async (req, res) => {
  const { url, login = null } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  const job = begin(req, res);
  if (!job) return;
  const useAuth = !!(login && login.url && login.username);
  try {
    if (useAuth) await loginAndSave(login, () => {}, job);
    const data = await crawlPage(url, () => {}, useAuth, job);
    job.check();
    finish(job);
    res.json(data);
  } catch (error) {
    finish(job);
    res.status(500).json({ error: job.signal.reason?.message || error.message });
  }
});

async function runTests(testCode, send, useAuth, job) {
  job.check();
  fs.writeFileSync(path.join(job.dir, 'generated_run.spec.ts'), testCode);
  const reportPath = path.join(job.dir, 'report.json');
  const env = { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath,
    TEST_ARMY_RUN_ID: job.id, TEST_ARMY_TEST_DIR: job.dir, TEST_ARMY_OUTPUT_DIR: job.artifacts };
  delete env.PW_STORAGE;
  if (useAuth) env.PW_STORAGE = job.auth;
  send('progress', 'Running tests with Playwright…');
  const execution = await executeRunner(job, env);
  let report;
  let reportError;
  try { report = JSON.parse(fs.readFileSync(reportPath, 'utf8')); }
  catch { reportError = 'Current run report is missing or unreadable.'; }
  const reason = job.signal.reason?.message;
  const result = summarizeRun({ runId: job.id, report, reportError,
    resultsRoot: job.artifacts, screenshotPrefix: `/screenshots/${job.id}`,
    exitCode: execution.exitCode, signal: job.signal.aborted ? 'SIGTERM' : execution.signal,
    timedOut: Boolean(reason?.includes('timed out')), executionError: reason });
  send('results', execution.output);
  return { kind: 'run', result };
}

for (const operation of ['generate', 'run']) {
  app.post(`/api/${operation}`, async (req, res) => {
    const { url, description, code, autoRun = true, login = null } = req.body;
    if (!url || (operation === 'generate' ? !description : !code))
      return res.status(400).json({ error: 'Target URL and test description or code are required.' });
    const job = begin(req, res);
    if (!job) return;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    const send = (type, data) => {
      if (!res.destroyed) res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
    };
    send('job', job.id);
    const heartbeat = setInterval(() => { if (!res.destroyed) res.write(': heartbeat\n\n'); }, 15000);
    const useAuth = !!(login && login.url && login.username);
    let terminal;
    let failure;
    try {
      if (useAuth) await loginAndSave(login, send, job);
      let testCode = code;
      if (operation === 'generate') {
        const pageData = await crawlPage(url, send, useAuth, job);
        job.check();
        testCode = await generateTests(pageData, url, description, send, useAuth, job);
        job.check();
        send('testCode', testCode);
      }
      terminal = operation === 'run' || autoRun
        ? await runTests(testCode, send, useAuth, job) : { kind: 'generated' };
    } catch (error) {
      failure = job.cleanupFailed ? error.message : job.signal.reason?.message || error.message;
    } finally {
      clearInterval(heartbeat);
      try { finish(job); } catch (error) { failure = `Cleanup failed: ${error.message}`; }
      if (failure) send('error', failure);
      else send('done', terminal);
      res.end();
    }
  });
}

fetchFreeModels().then(() => {
  app.listen(3001, '127.0.0.1', () => {
    console.log('Test Army server → http://localhost:3001');
    console.log(`LLM backend: ${LLM_BACKEND}${LLM_BACKEND === 'claude' ? ` (model: ${process.env.CLAUDE_MODEL || 'claude-sonnet-4-6'})` : ''}`);
  });
});
