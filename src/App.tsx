import { useState, useRef, useEffect } from 'react';
import './App.css';
import { requestEventStream } from '../shared/event-stream.mjs';
import { statusLabels, testStatuses } from '../shared/run-result.mjs';
import type { RunResult } from '../shared/run-result.mjs';
import { apiRequest, SERVER } from './api';
import { ProtectedScreenshot } from './ProtectedScreenshot';

type Tab = 'log' | 'code' | 'results';
type Status = 'idle' | 'running' | 'done' | 'error';


interface PageData {
  title: string;
  headings: string[];
  buttons: string[];
  links: { text: string; href: string | null }[];
  inputs: { type: string; name: string; label: string }[];
  forms: number;
  images: string[];
  comboboxes?: { placeholder: string; options: string[] }[];
  sampleRows?: string[];
}

const PRESETS: { label: string; text: string }[] = [
  { label: '🔐 Login flow', text: 'Test login: valid credentials succeed, wrong password shows error, empty fields are rejected.' },
  { label: '📝 Form validation', text: 'Test the form: submit with all valid fields, submit with required fields empty, invalid email format, over-long input.' },
  { label: '🧭 Navigation', text: 'Test navigation: every nav link loads its target page, page title is correct, no broken links.' },
  { label: '🔍 Search', text: 'Test search: valid query returns results, empty query handled, no-match query shows empty state, special characters do not break it.' },
  { label: '💉 Security', text: 'Test inputs against SQL injection strings, XSS payloads, 500-char input, and spaces-only input.' },
];

export default function App() {
  const [jobId, setJobId] = useState('');
  const [canceling, setCanceling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState<string[]>([]);
  const [testCode, setTestCode] = useState('');
  const [results, setResults] = useState('');
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [runError, setRunError] = useState('');
  const [autoRun, setAutoRun] = useState(true);
  const [awaitingReview, setAwaitingReview] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [openRows, setOpenRows] = useState<Record<number, boolean>>({});
  const [activeTab, setActiveTab] = useState<Tab>('log');
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspectError, setInspectError] = useState('');
  const [showLogin, setShowLogin] = useState(false);
  const [loginUrl, setLoginUrl] = useState('');
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const log = logEndRef.current?.parentElement;
    if (log && log.scrollHeight - log.scrollTop - log.clientHeight < 120) log.scrollTop = log.scrollHeight;
  }, [progress]);

  async function cancelTask() {
    setCanceling(true);
    setCancelError('');
    try {
      const response = await apiRequest(`${SERVER}/api/jobs/${jobId}/cancel`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Test-Army': '1' }, body: '{}',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Unable to request cancellation. Please try again.');
      }
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : 'Cancellation failed.');
      setCanceling(false);
    }
  }

  function addPreset(text: string) {
    if (status === 'running') return;
    setDescription(d => (d.trim() ? `${d.trim()}\n${text}` : text));
  }

  async function inspect() {
    if (!url || inspecting || status === 'running') return;
    setInspecting(true);
    setInspectError('');
    setPageData(null);
    try {
      const res = await apiRequest(`${SERVER}/api/inspect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Test-Army': '1' },
        body: JSON.stringify({ url, login: loginPayload() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setPageData(data);
    } catch (err: unknown) {
      setInspectError(err instanceof Error ? err.message : 'Inspect failed');
    } finally {
      setInspecting(false);
    }
  }

  async function consumeStream(endpoint: string, body: object, completion: 'run' | 'generated') {
    await requestEventStream(`${SERVER}${endpoint}`, body, event => {
      if (event.type === 'job') setJobId(event.data);
      if (event.type === 'progress') setProgress(p => [...p, event.data]);
      if (event.type === 'testCode') {
        setTestCode(event.data);
        setActiveTab('code');
      }
      if (event.type === 'results') {
        setResults(event.data);
        setActiveTab('results');
      }
      if (event.type === 'done') {
        if (event.data.kind === 'run') {
          setRunResult(event.data.result);
          setActiveTab('results');
        } else {
          setAwaitingReview(true);
        }
        setStatus('done');
      }
    }, completion, 300000, apiRequest);
  }

  function loginPayload() {
    return loginUrl && loginUser
      ? { url: loginUrl, username: loginUser, password: loginPass }
      : null;
  }

  function showRequestError(error: unknown) {
    const message = error instanceof Error ? error.message : 'Request failed. Please retry.';
    setRunError(message);
    setProgress(p => [...p, `❌ ERROR: ${message}`]);
    setAwaitingReview(false);
    setStatus('error');
  }

  async function run() {
    if (!url.trim() || !description.trim() || inspecting || status === 'running') return;
    setJobId('');
    setCanceling(false);
    setCancelError('');
    setStatus('running');
    setProgress([]);
    setTestCode('');
    setResults('');
    setRunResult(null);
    setRunError('');
    setShowRaw(false);
    setOpenRows({});
    setAwaitingReview(false);
    setActiveTab('log');
    try {
      await consumeStream('/api/generate', { url, description, autoRun, login: loginPayload() }, autoRun ? 'run' : 'generated');
    } catch (err: unknown) {
      showRequestError(err);
    }
  }

  async function runCode() {
    if (!url || !testCode || inspecting || status === 'running') return;
    setJobId('');
    setCanceling(false);
    setCancelError('');
    setProgress([]);
    setStatus('running');
    setResults('');
    setRunResult(null);
    setRunError('');
    setShowRaw(false);
    setOpenRows({});
    setAwaitingReview(false);
    setActiveTab('log');
    try {
      await consumeStream('/api/run', { url, code: testCode, login: loginPayload() }, 'run');
    } catch (err: unknown) {
      showRequestError(err);
    }
  }

  function downloadCode() {
    const safe = url.replace(/https?:\/\//, '').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
    const blob = new Blob([testCode], { type: 'text/typescript' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `generated_${safe}.spec.ts`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const report = runResult?.tests ?? [];
  const allPassed = status === 'done' && runResult?.status === 'passed';
  const resultTone = allPassed ? 'pass' : runResult && ['skipped', 'noTests', 'canceled'].includes(runResult.status) ? 'neutral' : 'fail';
  const hasOutput = progress.length > 0 || testCode || results;

  return (
    <div className="app">
      <header className="header">
        <h1>⚔ Test Army</h1>
        <p>Your workspace for generating, reviewing, and running browser tests.</p>
      </header>

      <div className="workspace">
        {/* LEFT: Input panel */}
        <section className="panel left-panel">
          <div className="section-heading"><span className="eyebrow">SET UP YOUR TEST</span><h2>What should we check?</h2><p>Choose a page, then describe the outcome you expect.</p></div>
          <div className="field">
            <label htmlFor="target-url">Target URL</label>
            <input
              id="target-url"
              type="url"
              placeholder="https://example.com/login"
              value={url}
              onChange={e => { setUrl(e.target.value); setPageData(null); setInspectError(''); }}
              disabled={status === 'running' || inspecting}
            />
            <button
              className="inspect-btn"
              onClick={inspect}
              disabled={!url || inspecting || status === 'running'}
            >
              {inspecting ? '🔍 Inspecting…' : '🔍 Preview page'}
            </button>
          </div>

          <div className="login-box">
            <button
              type="button"
              className="login-head"
              aria-expanded={showLogin}
              onClick={() => setShowLogin(s => !s)}
            >
              <span>🔐 Requires login? {loginUrl && loginUser ? '(on)' : '(off)'}</span>
              <span>{showLogin ? '▾' : '▸'}</span>
            </button>
            {showLogin && (
              <div className="login-fields">
                <input
                  type="url"
                  placeholder="Login page URL"
                  aria-label="Login page URL"
                  value={loginUrl}
                  onChange={e => setLoginUrl(e.target.value)}
                  disabled={status === 'running' || inspecting}
                />
                <input
                  type="text"
                  placeholder="Username / email"
                  aria-label="Username / email"
                  value={loginUser}
                  onChange={e => setLoginUser(e.target.value)}
                  disabled={status === 'running' || inspecting}
                  autoComplete="off"
                />
                <input
                  type="password"
                  placeholder="Password"
                  aria-label="Password"
                  value={loginPass}
                  onChange={e => setLoginPass(e.target.value)}
                  disabled={status === 'running' || inspecting}
                  autoComplete="off"
                />
                <span className="login-note">Logs in once, reuses session for crawl + tests. Auto-detects user/password/submit fields.</span>
              </div>
            )}
          </div>

          {inspectError && <div role="alert" className="status-badge fail">✗ {inspectError}</div>}

          {pageData && (
            <div className="preview">
              <div className="preview-title">📄 {pageData.title || '(no title)'}</div>
              <div className="preview-stats">
                <span>{pageData.forms} form</span>
                <span>{pageData.inputs.length} input</span>
                <span>{pageData.buttons.length} button</span>
                <span>{pageData.links.length} link</span>
              </div>
              {pageData.inputs.length > 0 && (
                <div className="preview-group">
                  <span className="preview-label">Inputs</span>
                  <div className="chips">
                    {pageData.inputs.map((i, k) => (
                      <span key={k} className="chip static">{i.name || i.label || i.type}</span>
                    ))}
                  </div>
                </div>
              )}
              {pageData.buttons.length > 0 && (
                <div className="preview-group">
                  <span className="preview-label">Buttons</span>
                  <div className="chips">
                    {pageData.buttons.map((b, k) => (
                      <span key={k} className="chip static">{b}</span>
                    ))}
                  </div>
                </div>
              )}
              {pageData.comboboxes && pageData.comboboxes.length > 0 && (
                <div className="preview-group">
                  <span className="preview-label">Filter fields (combobox)</span>
                  <div className="chips">
                    {pageData.comboboxes.flatMap(c => c.options).slice(0, 20).map((o, k) => (
                      <span key={k} className="chip static">{o}</span>
                    ))}
                  </div>
                </div>
              )}
              {pageData.sampleRows && pageData.sampleRows.length > 0 && (
                <div className="preview-group">
                  <span className="preview-label">Sample rows (real data)</span>
                  <div className="sample-rows">
                    {pageData.sampleRows.slice(0, 5).map((r, k) => (
                      <div key={k} className="sample-row">{r}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="field">
            <label htmlFor="test-description">What to test</label>
            <textarea
              id="test-description"
              placeholder="e.g. test login with valid creds, wrong password, empty fields, SQL injection, very long username, special characters"
              value={description}
              onChange={e => setDescription(e.target.value)}
              disabled={status === 'running' || inspecting}
              rows={5}
            />
            <div className="chips">
              {PRESETS.map(p => (
                <button
                  key={p.label}
                  type="button"
                  className="chip"
                  onClick={() => addPreset(p.text)}
                  disabled={status === 'running' || inspecting}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <label className="toggle">
            <input
              type="checkbox"
              checked={!autoRun}
              onChange={e => setAutoRun(!e.target.checked)}
              disabled={status === 'running' || inspecting}
            />
            Review tests before running
          </label>

          <button
            className={`run-btn ${status === 'running' ? 'running' : ''}`}
            onClick={run}
            disabled={status === 'running' || inspecting || !url.trim() || !description.trim()}
          >
            {status === 'running'
              ? '⏳ Working...'
              : autoRun ? '⚔ Deploy Test Army' : '✍ Generate Tests'}
          </button>

          {status === 'running' && (
            <div className="task-progress">
              <p role="status">{canceling ? 'Canceling — waiting for cleanup…' : 'Task in progress'}</p>
              <p className="progress-detail">{progress.at(-1) || 'Connecting to the server…'}</p>
              {jobId && <button className="cancel-btn" onClick={cancelTask} disabled={canceling}>{canceling ? 'Canceling…' : 'Cancel task'}</button>}
              {cancelError && <p role="alert">{cancelError}</p>}
            </div>
          )}

          {awaitingReview && status !== 'running' && (
            <div className="review-actions">
              <div className="review-note">✋ Review/edit in <b>Generated Tests</b> tab, then run.</div>
              <button className="run-btn" onClick={runCode} disabled={!testCode || inspecting}>
                ▶ Run Tests
              </button>
            </div>
          )}

          {status === 'done' && runResult && (
            <div role="status" className={`status-badge ${resultTone}`}>
              {statusLabels[runResult.status]} — {runResult.counts.total} tests
            </div>
          )}
          {status === 'error' && (
            <div role="alert" className="status-badge fail">✗ {runError}</div>
          )}
        </section>

        {/* RIGHT: Live output panel */}
        <section className="panel right-panel">
          <div className="tabs">
            <button
              className={activeTab === 'log' ? 'active' : ''}
              onClick={() => setActiveTab('log')}
            >
              Live Log
              {status === 'running' && <span className="pulse" />}
            </button>
            <button
              className={activeTab === 'code' ? 'active' : ''}
              onClick={() => setActiveTab('code')}
              disabled={!testCode}
            >
              Generated Tests
            </button>
            <button
              className={activeTab === 'results' ? 'active' : ''}
              onClick={() => setActiveTab('results')}
              disabled={!results && !runResult}
            >
              Results
              {runResult && (
                <span className={`badge ${resultTone}`}>
                  {allPassed ? '✓' : '!'}
                </span>
              )}
            </button>
          </div>

          <div className="panel-body">
            {activeTab === 'log' && (
              <div className="log">
                {!hasOutput && status === 'idle' && (
                  <div className="empty-state"><span className="eyebrow">READY WHEN YOU ARE</span><h2>Start with one workflow</h2><p>Enter your target URL and what should happen. Use a preset for ideas, or preview the page first.</p><div className="empty-steps"><span>1 · Describe</span><span>2 · Generate</span><span>3 · Review results</span></div></div>
                )}
                {progress.map((line, i) => (
                  <div key={i} className={`log-line ${line.startsWith('❌') ? 'err' : ''}`}>
                    <span className="arrow">▶</span> {line}
                  </div>
                ))}
                {status === 'running' && (
                  <div className="log-line">
                    <span className="arrow">▶</span> <span className="blink">_</span>
                  </div>
                )}
                {status === 'done' && (
                  <div className="log-line done">▶ Done.</div>
                )}
                <div ref={logEndRef} />
              </div>
            )}

            {activeTab === 'code' && (
              <div className="code-view">
                {testCode ? (
                  <>
                    <div className="code-toolbar">
                      <span className="code-hint">Editable — changes run as-is.</span>
                      <div className="code-actions">
                        <button
                          className="code-btn"
                          onClick={runCode}
                          disabled={status === 'running' || inspecting}
                        >
                          ▶ {awaitingReview ? 'Run' : 'Re-run'}
                        </button>
                        <button className="code-btn" onClick={downloadCode}>⬇ Download</button>
                      </div>
                    </div>
                    <textarea
                      className="code-editor"
                      aria-label="Generated test code"
                      value={testCode}
                      onChange={e => setTestCode(e.target.value)}
                      spellCheck={false}
                      disabled={status === 'running' || inspecting}
                    />
                  </>
                ) : (
                  <pre className="code-block">No tests generated yet.</pre>
                )}
              </div>
            )}

            {activeTab === 'results' && (
              <div className="results-view">
                {runResult && (
                  <div className="run-details">
                    <p>Run: {runResult.runId}</p>
                    <p>Exit code: {runResult.exitCode ?? 'unavailable'}{runResult.signal ? ` · Signal: ${runResult.signal}` : ''}</p>
                    {runResult.errors.map((error, i) => <pre className="test-error" key={i}>{error}</pre>)}
                  </div>
                )}
                {report.length > 0 && (
                  <div className="results-toolbar">
                    <span className="results-summary">
                      {testStatuses.map(testStatus => (
                        <span key={testStatus}>{runResult?.counts[testStatus] ?? 0} {testStatus === 'timedOut' ? 'timed out' : testStatus}</span>
                      ))}
                    </span>
                    <button className="raw-toggle" onClick={() => setShowRaw(s => !s)}>
                      {showRaw ? 'Show summary' : 'Show raw output'}
                    </button>
                  </div>
                )}

                {report.length > 0 && !showRaw && (
                  <div className="test-rows">
                    {report.map((r, i) => {
                      const pass = r.status === 'passed';
                      const tone = pass ? 'pass' : ['skipped', 'interrupted'].includes(r.status) ? 'neutral' : 'fail';
                      const open = !!openRows[i];
                      return (
                        <div key={i} className={`test-row ${tone}`}>
                          <button
                            className="test-row-head"
                            aria-expanded={!pass ? open : undefined}
                            onClick={() => setOpenRows(o => ({ ...o, [i]: !o[i] }))}
                            disabled={pass}
                          >
                            <span className="test-icon">{pass ? '✓' : '✗'}</span>
                            <span className="test-title">{r.title}</span>
                            <span>{r.status === 'timedOut' ? 'timed out' : r.status}</span>
                            <span className="test-dur">{Math.round(r.durationMs)}ms</span>
                            {!pass && <span className="test-caret">{open ? '▾' : '▸'}</span>}
                          </button>
                          {!pass && open && (
                            <div className="test-detail">
                              {r.error && <pre className="test-error">{r.error}</pre>}
                              {r.screenshot && (
                                <ProtectedScreenshot path={r.screenshot} />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {(showRaw || report.length === 0) && (
                  <pre className={`code-block results ${allPassed ? 'all-pass' : 'has-fail'}`}>
                    {results || 'No results yet.'}
                  </pre>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
