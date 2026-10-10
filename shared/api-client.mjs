// Tokens stay in this closure; never put them in URLs or persistent browser storage.
export function createApiClient(baseUrl, fetcher = (...args) => fetch(...args)) {
  const base = new URL(baseUrl);
  let token = null;
  let connecting = null;
  async function connect() {
    const response = await fetcher(`${base.origin}/api/session`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Test-Army': '1' },
      body: '{}', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || `Unable to connect to the local server (HTTP ${response.status}).`);
    if (!/^[a-f0-9]{64}$/.test(data?.token) || !Number.isFinite(data?.expiresAt) || data.expiresAt <= Date.now())
      throw new Error('Invalid local session response. Restart the backend and reload the UI.');
    token = data.token;
  }
  return async function request(url, options = {}) {
    const target = new URL(url, base);
    if (target.origin !== base.origin || target.username || target.password ||
        !['/api/', '/screenshots/'].some(prefix => target.pathname.startsWith(prefix)))
      throw new Error('Refusing to send session credentials to an unrelated address.');
    options.signal?.throwIfAborted();
    if (!token) {
      connecting ??= connect().finally(() => { connecting = null; });
      await connecting;
    }
    options.signal?.throwIfAborted();
    const usedToken = token;
    const headers = new Headers(options.headers);
    headers.set('X-Test-Army', '1');
    headers.set('Authorization', `Bearer ${usedToken}`);
    const response = await fetcher(target.href, {
      ...options, headers, credentials: 'omit', redirect: 'error',
    });
    // Never replay a work request. The next explicit action can reconnect.
    if (response.status === 401 && token === usedToken) token = null;
    return response;
  };
}
