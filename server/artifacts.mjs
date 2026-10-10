import fs from 'node:fs/promises';
import path from 'node:path';

const imageTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

export function installArtifacts(app) {
  app.get('/screenshots/:id/*file', async (req, res) => {
    const job = req.session.jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Screenshot is unavailable in this session.' });
    const parts = req.params.file;
    if (!Array.isArray(parts) || parts.some(part => !part || part.startsWith('.') || /[\\/:\0]/.test(part)))
      return res.status(404).json({ error: 'Screenshot is unavailable.' });
    const type = imageTypes[path.extname(parts.at(-1)).toLowerCase()];
    if (!type) return res.status(404).json({ error: 'Screenshot is unavailable.' });
    try {
      let file = job.artifacts;
      // Refuse links at every component, including the artifact directory.
      for (const part of ['', ...parts]) {
        file = path.join(file, part);
        if ((await fs.lstat(file)).isSymbolicLink()) throw new Error('Link');
      }
      const [root, resolved] = await Promise.all([fs.realpath(job.artifacts), fs.realpath(file)]);
      const relative = path.relative(root, resolved);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Scope');
      const stat = await fs.stat(resolved);
      if (!stat.isFile() || stat.size > 10 * 1024 * 1024) throw new Error('Size');
      res.setHeader('Content-Type', type);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.send(await fs.readFile(resolved));
    } catch {
      res.status(404).json({ error: 'Screenshot is unavailable.' });
    }
  });
}
