const SITE_ORIGINS = new Set([
  'https://nsag-site.vercel.app',
  // The admin dashboard is the only client of /api/admin and was not on this
  // list, so its preflight came back without Access-Control-Allow-Origin and
  // the browser discarded every response. Only this file needs it: the other
  // handlers serve the public modules, not the dashboard.
  'https://nsag-admin.vercel.app',
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

function authorized(req) {
  const configured = process.env.NSAG_ADMIN_KEY;
  const provided = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!configured || !provided) return false;
  const a = Buffer.from(configured);
  const b = Buffer.from(provided);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  setCors(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.NSAG_ADMIN_KEY || !process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return res.status(503).json({ error: 'Operator access is not configured' });
  }
  if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const base = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    const keysResponse = await fetch(`${base}/keys/${encodeURIComponent('nsag:inquiry:*')}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!keysResponse.ok) throw new Error('storage unavailable');
    const keys = (await keysResponse.json()).result || [];
    const inquiries = [];
    for (const key of keys.slice(0, 200)) {
      const response = await fetch(`${base}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) continue;
      const value = (await response.json()).result;
      try { if (value) inquiries.push(JSON.parse(value)); } catch {}
    }
    inquiries.sort((a, b) => String(b.consentedAt).localeCompare(String(a.consentedAt)));
    return res.status(200).json({ inquiries, total: inquiries.length, retention: '90 days' });
  } catch {
    return res.status(503).json({ error: 'Operator data is unavailable' });
  }
}
