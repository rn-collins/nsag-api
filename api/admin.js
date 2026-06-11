// api/admin.js — NSAG lead intelligence admin endpoint
// Add to nsag-api Vercel project alongside lead.js and dru.js
// Env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, NSAG_ADMIN_KEY

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const adminKey = process.env.NSAG_ADMIN_KEY;
  if (!adminKey) return res.status(503).json({ error: 'Admin not configured' });

  const providedKey = req.query.key;
  if (providedKey !== adminKey) return res.status(403).json({ error: 'Invalid key' });

  const redisBase = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  try {
    const sources = ['nsag-m3','nsag-m4','nsag-m5','nsag-m6','nsag-m7','nsag-m8','nsag-m9','nsag-contact'];
    const allLeads = [];

    for (const source of sources) {
      const res2 = await fetch(`${redisBase}/lrange/leads:nsag:${source}/0/-1`, {
        headers: { Authorization: `Bearer ${redisToken}` }
      });
      const data = await res2.json();
      if (data.result) {
        data.result.forEach(r => {
          try {
            const lead = typeof r === 'string' ? JSON.parse(r) : r;
            allLeads.push({ ...lead, source });
          } catch(e) {}
        });
      }
    }

    // Sort by timestamp descending
    allLeads.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

    return res.status(200).json({
      leads: allLeads,
      total: allLeads.length,
      sources: sources.reduce((acc, s) => {
        acc[s] = allLeads.filter(l => l.source === s).length;
        return acc;
      }, {})
    });

  } catch(e) {
    return res.status(500).json({ error: 'Data retrieval failed' });
  }
}
