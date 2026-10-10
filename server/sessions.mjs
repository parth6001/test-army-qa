import { createHash, randomBytes, randomUUID } from 'node:crypto';

const digest = token => createHash('sha256').update(token).digest('hex');

export function createSessionStore({ now = Date.now, lifetimeMs = 8 * 60 * 60 * 1000, capacity = 128 } = {}) {
  const sessions = new Map();
  function prune() {
    for (const [key, session] of sessions) {
      if (session.expiresAt <= now()) sessions.delete(key);
    }
  }
  return {
    create(origin) {
      prune();
      if (sessions.size >= capacity) return null;
      const token = randomBytes(32).toString('hex');
      const session = { id: randomUUID(), origin, expiresAt: now() + lifetimeMs, jobs: new Map() };
      sessions.set(digest(token), session);
      return { token, expiresAt: session.expiresAt };
    },
    authenticate(authorization, origin) {
      prune();
      const match = /^Bearer ([a-f0-9]{64})$/.exec(authorization || '');
      if (!match) return null;
      const session = sessions.get(digest(match[1]));
      return session?.origin === origin ? session : null;
    },
  };
}

// Install after the Host/Origin/header boundary and before all work/artifact routes.
export function installSessions(app, store = createSessionStore()) {
  app.post('/api/session', (req, res) => {
    if (!req.body || Array.isArray(req.body) || Object.keys(req.body).length)
      return res.status(400).json({ error: 'Session request must be an empty JSON object.' });
    const session = store.create(req.headers.origin);
    if (!session) return res.status(429).json({ error: 'Too many local sessions. Close unused tabs and restart the backend when no task is running.' });
    res.json(session);
  });
  app.use(['/api', '/screenshots'], (req, res, next) => {
    const session = store.authenticate(req.headers.authorization, req.headers.origin);
    if (!session) return res.status(401).json({ error: 'Your local session expired or the server restarted. Try the action again to reconnect.' });
    req.session = session;
    next();
  });
  return store;
}

export function registerSessionJob(session, job) {
  session.jobs.set(job.id, { artifacts: job.artifacts });
  job.ownerId = session.id;
}

export function installCancellation(app, jobs) {
  app.post('/api/jobs/:id/cancel', (req, res) => {
    if (jobs.active?.id !== req.params.id || jobs.active.ownerId !== req.session.id)
      return res.status(404).json({ error: 'Task is unavailable in this session.' });
    jobs.active.cancel();
    res.json({ canceling: true });
  });
}
