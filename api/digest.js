import crypto from 'node:crypto';

function authorized(req) {
  const configured = process.env.CRON_SECRET;
  const provided = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!configured || !provided) return false;
  const a = Buffer.from(configured);
  const b = Buffer.from(provided);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.CRON_SECRET) return res.status(503).json({ error: 'Digest is not configured' });
  if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  return res.status(503).json({
    error: 'DRU digest is paused while research collection and governance review are paused',
    status: 'paused'
  });
}
