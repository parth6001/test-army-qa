import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { chromium } from 'playwright';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { query } from '@anthropic-ai/claude-agent-sdk';

const execAsync = promisify(exec);
// LLM backend: 'claude' (Claude Code subscription, no API key) or 'openrouter'
const LLM_BACKEND = (process.env.LLM_BACKEND || 'openrouter').toLowerCase();
const app = express();
app.use(cors());
app.use(express.json());
// Serve Playwright artifacts (failure screenshots) to the UI
app.use('/screenshots', express.static('test-results'));

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

const AUTH_FILE = path.resolve('auth-state.json');

// Log in once, persist cookies/localStorage to AUTH_FILE for reuse by crawl + tests
async function loginAndSave(login, send = () => {}) {
  send('progress', `🔐 Logging in at ${login.url}...`);
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
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

    await context.storageState({ path: AUTH_FILE });
    send('progress', '✅ Login OK — session saved.');
  } finally {
    await browser.close();
  }
}

async function crawlPage(url, send = () => {}, useAuth = false) {
  send('progress', '🌐 Launching headless browser...');
  const browser = await chromium.launch();
  const context = await browser.newContext(
    useAuth && fs.existsSync(AUTH_FILE) ? { storageState: AUTH_FILE } : {}
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

  await browser.close();
  return data;
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

async function generateTests(pageData, targetUrl, userDescription, send, useAuth = false) {
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
    return await generateViaClaude(prompt, send);
  }

  const FALLBACK_MODELS = process.env.OPENROUTER_MODEL
    ? [process.env.OPENROUTER_MODEL, ...FREE_MODELS]
    : FREE_MODELS;

  let lastError;
  for (const model of FALLBACK_MODELS) {
    send('progress', `🤖 Trying model: ${model}...`);
    try {
      const result = await callOpenRouter(model, prompt, send);
      return result;
    } catch (err) {
      send('progress', `⚠️ ${model} failed: ${err.message} — trying next...`);
      lastError = err;
    }
  }
  throw lastError;
}

// Generate via Claude Code subscription (Agent SDK) — no ANTHROPIC_API_KEY needed
async function generateViaClaude(prompt, send) {
  send('progress', '🤖 Claude (subscription) generating tests...');
  let raw = '';
  let assistantText = '';   // fallback: accumulate text blocks across turns
  for await (const msg of query({
    prompt,
    options: {
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
      maxTurns: 8,
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

async function callOpenRouter(model, prompt, send) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
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

function sanitizeFilename(url) {
  return url.replace(/https?:\/\//, '').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
}

// Walk Playwright JSON report → flat list of test rows for the UI
function parseReport(reportPath) {
  const rows = [];
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch {
    return rows;
  }

  const resultsRoot = path.resolve('test-results');
  const walk = (suite) => {
    for (const spec of suite.specs || []) {
      for (const t of spec.tests || []) {
        const r = (t.results || [])[t.results.length - 1] || {};
        const shot = (r.attachments || []).find(a => a.name === 'screenshot' && a.path);
        let screenshot = null;
        if (shot) {
          const rel = path.relative(resultsRoot, shot.path).replace(/\\/g, '/');
          if (!rel.startsWith('..')) screenshot = `/screenshots/${rel}`;
        }
        rows.push({
          title: spec.title,
          status: r.status || (spec.ok ? 'passed' : 'failed'),
          durationMs: r.duration || 0,
          error: r.error ? (r.error.message || '').replace(/\[[0-9;]*m/g, '').trim() : '',
          screenshot,
        });
      }
    }
    for (const child of suite.suites || []) walk(child);
  };
  for (const s of raw.suites || []) walk(s);
  return rows;
}

app.get('/api/models', (_req, res) => res.json({ models: FREE_MODELS }));

// Crawl only — return scraped structure so UI can preview before generating
app.post('/api/inspect', async (req, res) => {
  const { url, login = null } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  const useAuth = !!(login && login.url && login.username);
  try {
    if (useAuth) await loginAndSave(login);
    const pageData = await crawlPage(url, () => {}, useAuth);
    res.json(pageData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Write test code to disk, run via Playwright, stream report
async function runTests(url, testCode, send, useAuth = false) {
  const filename = `generated_${sanitizeFilename(url)}.spec.ts`;
  const outPath = path.join('tests', filename);
  if (!fs.existsSync('tests')) fs.mkdirSync('tests');
  fs.writeFileSync(outPath, testCode);
  send('progress', `💾 Test file saved: ${outPath}`);

  send('progress', '🚀 Running tests with Playwright...');
  const normalizedPath = outPath.replace(/\\/g, '/');
  const reportPath = path.resolve('test-report.json');
  const runEnv = { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath };
  if (useAuth && fs.existsSync(AUTH_FILE)) runEnv.PW_STORAGE = AUTH_FILE;
  const finish = (stdout, stderr, failed) => {
    send('progress', failed ? '🏁 Test run complete (some failures).' : '🏁 Test run complete.');
    send('results', (stdout || '') + (stderr || ''));
    send('report', parseReport(reportPath));
    send('done', 'completed');
  };
  try {
    const { stdout, stderr } = await execAsync(
      `npx playwright test "${normalizedPath}" --reporter=list,json --config=playwright.external.config.ts`,
      { timeout: 120000, env: runEnv }
    );
    finish(stdout, stderr, false);
  } catch (runErr) {
    finish(runErr.stdout, runErr.stderr, true);
  }
}

app.post('/api/generate', async (req, res) => {
  const { url, description, autoRun = true, login = null } = req.body;
  if (!url || !description) {
    return res.status(400).json({ error: 'url and description required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (type, data) => res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
  const useAuth = !!(login && login.url && login.username);

  try {
    if (useAuth) await loginAndSave(login, send);
    const pageData = await crawlPage(url, send, useAuth);
    send('progress', `📋 Found: ${pageData.forms} form(s), ${pageData.buttons.length} button(s), ${pageData.inputs.length} input(s), ${pageData.links.length} link(s)`);
    send('progress', `📄 Page title: "${pageData.title}"`);
    if (pageData.inputs.length > 0) {
      send('progress', `🔤 Inputs detected: ${pageData.inputs.map(i => i.name || i.type).join(', ')}`);
    }
    if (pageData.buttons.length > 0) {
      send('progress', `🔘 Buttons detected: ${pageData.buttons.join(', ')}`);
    }

    const testCode = await generateTests(pageData, url, description, send, useAuth);
    send('testCode', testCode);

    if (autoRun) {
      await runTests(url, testCode, send, useAuth);
    } else {
      send('progress', '✋ Review mode — edit tests, then click Run.');
      send('awaitReview', 'ready');
      send('done', 'generated');
    }
  } catch (err) {
    send('error', err.message);
  } finally {
    res.end();
  }
});

// Run user-supplied (possibly edited) test code without re-generating
app.post('/api/run', async (req, res) => {
  const { url, code, login = null } = req.body;
  if (!url || !code) {
    return res.status(400).json({ error: 'url and code required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (type, data) => res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
  const useAuth = !!(login && login.url && login.username);

  try {
    if (useAuth) await loginAndSave(login, send);
    await runTests(url, code, send, useAuth);
  } catch (err) {
    send('error', err.message);
  } finally {
    res.end();
  }
});

fetchFreeModels().then(() => {
  app.listen(3001, () => {
    console.log('Test Army server → http://localhost:3001');
    console.log(`LLM backend: ${LLM_BACKEND}${LLM_BACKEND === 'claude' ? ` (model: ${process.env.CLAUDE_MODEL || 'claude-sonnet-4-6'})` : ''}`);
  });
});
