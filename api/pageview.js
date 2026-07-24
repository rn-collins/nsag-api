// nsag-api/api/pageview.js
// Self-hosted, cookie-less pageview counter. Increments Upstash Redis counters.
// Keys: pv:total (all-time), pv:day:<YYYY-MM-DD> (daily), pv:paths (hash: path -> count)
// Env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    let path = (body && body.path ? String(body.path) : '/').slice(0, 120);
    // sanitize to a safe key segment
    path = path.replace(/[^a-zA-Z0-9/_#.-]/g, '') || '/';

    const base = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!base || !token) return res.status(204).end();
    const H = { Authorization: `Bearer ${token}` };
    const day = new Date().toISOString().slice(0, 10);

    await Promise.all([
      fetch(`${base}/incr/pv:total`, { headers: H }),
      fetch(`${base}/incr/pv:day:${day}`, { headers: H }),
      fetch(`${base}/hincrby/pv:paths/${encodeURIComponent(path)}/1`, { headers: H }),
    ]);
    return res.status(204).end();
  } catch (err) {
    console.error('pageview error:', err);
    return res.status(204).end();
  }
}
