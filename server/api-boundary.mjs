import express from 'express';

const origins = new Set(['http://localhost:5173', 'http://127.0.0.1:5173',
  'http://localhost:5174', 'http://127.0.0.1:5174']);

// Browser caller boundary only: local programs can forge these headers.
export function installApiBoundary(app, port = 3001) {
  const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
  app.use((req, res, next) => {
    if (!hosts.has(req.headers.host)) return res.status(403).json({ error: 'Unapproved API host.' });
    next();
  });
  app.use(['/api', '/screenshots'], (req, res, next) => {
    const origin = req.headers.origin;
    if (!origins.has(origin)) return res.status(403).json({ error: 'Open Test Army from an approved local UI origin.' });
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') {
      const headers = (req.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(x => x.trim());
      if (!['GET', 'POST'].includes(req.headers['access-control-request-method']) ||
          headers.some(x => !['content-type', 'x-test-army', 'authorization'].includes(x)))
        return res.status(403).json({ error: 'Unapproved API preflight.' });
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Test-Army, Authorization');
      return res.sendStatus(204);
    }
    if (req.headers['x-test-army'] !== '1') return res.status(403).json({ error: 'Missing Test Army request header. Reload the UI.' });
    if (req.method === 'POST' && !req.is('application/json'))
      return res.status(415).json({ error: 'API requests must use application/json.' });
    next();
  });
  app.use(express.json({ limit: '256kb', strict: true }));
  app.use((error, _req, res, next) => {
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request exceeds the 256 KB limit.' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request must contain valid JSON.' });
    next(error);
  });
  app.use('/api', (req, res, next) => {
    const operation = req.path.slice(1);
    if (req.method === 'POST' && ['inspect', 'generate', 'run'].includes(operation)) {
      const error = validateTaskRequest(operation, req.body);
      if (error) return res.status(400).json({ error });
    }
    next();
  });
}

function text(value, max) { return typeof value === 'string' && value.trim().length > 0 && value.length <= max; }
function webUrl(value) {
  if (!text(value, 2048)) return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

export function validateTaskRequest(operation, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Request must be an object.';
  const fields = new Set(['url', 'login', ...(operation === 'generate' ? ['description', 'autoRun'] : operation === 'run' ? ['code'] : [])]);
  if (Object.keys(body).some(key => !fields.has(key))) return 'Request contains unsupported fields.';
  if (!webUrl(body.url)) return 'Target URL must be HTTP(S), without embedded credentials, and at most 2048 characters.';
  if (operation === 'generate' && !text(body.description, 10000)) return 'Description must contain 1–10000 characters.';
  if (operation === 'run' && !text(body.code, 200000)) return 'Test code must contain 1–200000 characters.';
  if (body.autoRun !== undefined && typeof body.autoRun !== 'boolean') return 'autoRun must be a boolean.';
  if (body.login != null) {
    const login = body.login;
    if (typeof login !== 'object' || Array.isArray(login) ||
        Object.keys(login).some(key => !['url', 'username', 'password', 'userSelector', 'passSelector'].includes(key)) ||
        !webUrl(login.url) || !text(login.username, 1024) || typeof login.password !== 'string' || login.password.length > 4096 ||
        ['userSelector', 'passSelector'].some(key => login[key] !== undefined && !text(login[key], 1024)))
      return 'Login requires an HTTP(S) URL, username and password with valid field lengths.';
  }
  return null;
}
