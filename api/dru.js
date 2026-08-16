const SITE_ORIGINS = new Set([
  'https://nsag-site.vercel.app',
  ...Array.from({ length: 15 }, (_, i) => `https://nsag-m${i + 1}.vercel.app`)
]);

function setCors(req, res, methods) {
  const origin = req.headers.origin;
  if (SITE_ORIGINS.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

import crypto from 'node:crypto';

function dashboardAuthorized(req) {
  const configured = process.env.DRU_DASHBOARD_KEY;
  const provided = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!configured || !provided) return false;
  const a = Buffer.from(configured);
  const b = Buffer.from(provided);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  setCors(req, res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'POST') {
    return res.status(503).json({
      error: 'DRU research/evaluation collection is paused pending protocol, consent, privacy, retention, and ethics review',
      status: 'paused'
    });
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.DRU_DASHBOARD_KEY || !process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return res.status(503).json({ error: 'Research dashboard is not configured' });
  }
  if (!dashboardAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  return res.status(503).json({
    error: 'Research dashboard access is paused pending governance review',
    status: 'paused'
  });
}
