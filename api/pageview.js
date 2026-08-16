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

export default async function handler(req, res) {
  setCors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const base = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!base || !token) return res.status(204).end();

  let path = String(req.body?.path || '/').slice(0, 120).replace(/[^a-zA-Z0-9/_#.-]/g, '') || '/';
  const day = new Date().toISOString().slice(0, 10);
  try {
    const headers = { Authorization: `Bearer ${token}` };
    const responses = await Promise.all([
      fetch(`${base}/incr/nsag:pv:total`, { headers }),
      fetch(`${base}/incr/nsag:pv:day:${day}`, { headers }),
      fetch(`${base}/hincrby/nsag:pv:paths/${encodeURIComponent(path)}/1`, { headers })
    ]);
    if (responses.some(r => !r.ok)) console.error('NSAG pageview storage unavailable');
  } catch {
    console.error('NSAG pageview storage unavailable');
  }
  return res.status(204).end();
}
