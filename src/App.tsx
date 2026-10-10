import { useState, useRef, useEffect } from 'react';
import './App.css';

type Tab = 'log' | 'code' | 'results';
type Status = 'idle' | 'running' | 'done' | 'error';

interface TestRow {
  title: string;
  status: string;
  durationMs: number;
  error: string;
  screenshot: string | null;
}

const SERVER = 'http://localhost:3001';

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
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState<string[]>([]);
  const [testCode, setTestCode] = useState('');
  const [results, setResults] = useState('');
  const [report, setReport] = useState<TestRow[]>([]);
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
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [progress]);

  const parseResults = (raw: string) => {
    const passed = (raw.match(/\d+ passed/g) || []).join(' ');
    const failed = (raw.match(/\d+ failed/g) || []).join(' ');
    return { passed, failed, hasFailed: raw.includes(' failed') };
  };

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
      const res = await fetch(`${SERVER}/api/inspect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  async function consumeStream(endpoint: string, body: object) {
    const res = await fetch(`${SERVER}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const event = JSON.parse(line.slice(5).trim());
        if (event.type === 'progress') setProgress(p => [...p, event.data]);
        if (event.type === 'testCode') {
          setTestCode(event.data);
          setActiveTab('code');
        }
        if (event.type === 'awaitReview') setAwaitingReview(true);
        if (event.type === 'results') {
          setResults(event.data);
          setActiveTab('results');
        }
        if (event.type === 'report') {
          setReport(event.data);
          setActiveTab('results');
        }
        if (event.type === 'done') setStatus('done');
        if (event.type === 'error') {
          setProgress(p => [...p, `❌ ERROR: ${event.data}`]);
          setStatus('error');
        }
      }
    }
  }

  function loginPayload() {
    return loginUrl && loginUser
      ? { url: loginUrl, username: loginUser, password: loginPass }
      : null;
  }

  async function run() {
    if (!url || !description || status === 'running') return;
    setStatus('running');
    setProgress([]);
    setTestCode('');
    setResults('');
    setReport([]);
    setOpenRows({});
    setAwaitingReview(false);
    setActiveTab('log');
    try {
      await consumeStream('/api/generate', { url, description, autoRun, login: loginPayload() });
    } catch (err: unknown) {
      if (err instanceof Error) setProgress(p => [...p, `❌ ERROR: ${err.message}`]);
      setStatus('error');
    }
  }

  async function runCode() {
    if (!url || !testCode || status === 'running') return;
    setStatus('running');
    setResults('');
    setReport([]);
    setOpenRows({});
    setAwaitingReview(false);
    setActiveTab('log');
    try {
      await consumeStream('/api/run', { url, code: testCode, login: loginPayload() });
    } catch (err: unknown) {
      if (err instanceof Error) setProgress(p => [...p, `❌ ERROR: ${err.message}`]);
      setStatus('error');
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

  const { passed, failed, hasFailed } = parseResults(results);
  const hasOutput = progress.length > 0 || testCode || results;

  return (
    <div className="app">
      <header className="header">
        <h1>⚔ Test Army</h1>
        <p>URL + description → AI generates &amp; runs E2E tests (happy path, negative, edge cases)</p>
      </header>

      <div className="workspace">
        {/* LEFT: Input panel */}
        <section className="panel left-panel">
          <div className="field">
            <label>Target URL</label>
            <input
              type="url"
              placeholder="https://example.com/login"
              value={url}
              onChange={e => { setUrl(e.target.value); setPageData(null); setInspectError(''); }}
              disabled={status === 'running'}
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
                  value={loginUrl}
                  onChange={e => setLoginUrl(e.target.value)}
                  disabled={status === 'running'}
                />
                <input
                  type="text"
                  placeholder="Username / email"
                  value={loginUser}
                  onChange={e => setLoginUser(e.target.value)}
                  disabled={status === 'running'}
                  autoComplete="off"
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={loginPass}
                  onChange={e => setLoginPass(e.target.value)}
                  disabled={status === 'running'}
                  autoComplete="off"
                />
                <span className="login-note">Logs in once, reuses session for crawl + tests. Auto-detects user/password/submit fields.</span>
              </div>
            )}
          </div>

          {inspectError && <div className="status-badge fail">✗ {inspectError}</div>}

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
            <label>What to test</label>
            <textarea
              placeholder="e.g. test login with valid creds, wrong password, empty fields, SQL injection, very long username, special characters"
              value={description}
              onChange={e => setDescription(e.target.value)}
              disabled={status === 'running'}
              rows={5}
            />
            <div className="chips">
              {PRESETS.map(p => (
                <button
                  key={p.label}
                  type="button"
                  className="chip"
                  onClick={() => addPreset(p.text)}
                  disabled={status === 'running'}
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
              disabled={status === 'running'}
            />
            Review tests before running
          </label>

          <button
            className={`run-btn ${status === 'running' ? 'running' : ''}`}
            onClick={run}
            disabled={status === 'running' || !url || !description}
          >
            {status === 'running'
              ? '⏳ Working...'
              : autoRun ? '⚔ Deploy Test Army' : '✍ Generate Tests'}
          </button>

          {awaitingReview && status !== 'running' && (
            <div className="review-actions">
              <div className="review-note">✋ Review/edit in <b>Generated Tests</b> tab, then run.</div>
              <button className="run-btn" onClick={runCode} disabled={!testCode}>
                ▶ Run Tests
              </button>
            </div>
          )}

          {status === 'done' && results && (
            <div className={`status-badge ${hasFailed ? 'fail' : 'pass'}`}>
              {hasFailed ? `✗ Some tests failed — ${failed}` : `✓ All tests passed — ${passed}`}
            </div>
          )}
          {status === 'error' && (
            <div className="status-badge fail">✗ Error — check live log</div>
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
              disabled={!results}
            >
              Results
              {results && (
                <span className={`badge ${hasFailed ? 'fail' : 'pass'}`}>
                  {hasFailed ? `✗` : `✓`}
                </span>
              )}
            </button>
          </div>

          <div className="panel-body">
            {activeTab === 'log' && (
              <div className="log">
                {!hasOutput && status === 'idle' && (
                  <div className="empty-state">Waiting for input...</div>
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
                          disabled={status === 'running'}
                        >
                          ▶ {awaitingReview ? 'Run' : 'Re-run'}
                        </button>
                        <button className="code-btn" onClick={downloadCode}>⬇ Download</button>
                      </div>
                    </div>
                    <textarea
                      className="code-editor"
                      value={testCode}
                      onChange={e => setTestCode(e.target.value)}
                      spellCheck={false}
                      disabled={status === 'running'}
                    />
                  </>
                ) : (
                  <pre className="code-block">No tests generated yet.</pre>
                )}
              </div>
            )}

            {activeTab === 'results' && (
              <div className="results-view">
                {report.length > 0 && (
                  <div className="results-toolbar">
                    <span className="results-summary">
                      <span className="ok">{report.filter(r => r.status === 'passed').length} passed</span>
                      {report.some(r => r.status !== 'passed') && (
                        <span className="bad">{report.filter(r => r.status !== 'passed').length} failed</span>
                      )}
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
                      const open = !!openRows[i];
                      return (
                        <div key={i} className={`test-row ${pass ? 'pass' : 'fail'}`}>
                          <button
                            className="test-row-head"
                            onClick={() => setOpenRows(o => ({ ...o, [i]: !o[i] }))}
                            disabled={pass}
                          >
                            <span className="test-icon">{pass ? '✓' : '✗'}</span>
                            <span className="test-title">{r.title}</span>
                            <span className="test-dur">{Math.round(r.durationMs)}ms</span>
                            {!pass && <span className="test-caret">{open ? '▾' : '▸'}</span>}
                          </button>
                          {!pass && open && (
                            <div className="test-detail">
                              {r.error && <pre className="test-error">{r.error}</pre>}
                              {r.screenshot && (
                                <a href={`${SERVER}${r.screenshot}`} target="_blank" rel="noreferrer">
                                  <img className="test-shot" src={`${SERVER}${r.screenshot}`} alt="failure screenshot" />
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {(showRaw || report.length === 0) && (
                  <pre className={`code-block results ${hasFailed ? 'has-fail' : 'all-pass'}`}>
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
