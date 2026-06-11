// dru_api.js — add this to the nsag-api Vercel project as api/dru.js
// Handles both POST (store survey response) and GET (dashboard data retrieval)
// Uses same Upstash Redis instance as nsag-api
// Dashboard key: set DRU_DASHBOARD_KEY env var before deploy. Never hardcode here.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const redisBase = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  // ── POST: store a survey response ──────────────────────────────────
  if (req.method === 'POST') {
    const { sessionCode, type, scores, timestamp, demographics } = req.body;
    if (!sessionCode || !type || !scores) {
      return res.status(200).json({ success: true }); // silent fail
    }

    const redisKey = `drew:${type}:${sessionCode.toUpperCase()}`;
    const entry = JSON.stringify({ sessionCode: sessionCode.toUpperCase(), type, scores, timestamp, demographics: demographics || null });

    try {
      // Store response in list for this session + type
      await fetch(`${redisBase}/rpush/${redisKey}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([entry])
      });

      // Track session code in master set
      await fetch(`${redisBase}/sadd/drew:sessions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([sessionCode.toUpperCase()])
      });

      // Slack alert (optional — fires on every response)
      if (process.env.SLACK_WEBHOOK_URL) {
        await fetch(process.env.SLACK_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `🌿 Dru Assessment · ${type.toUpperCase()} · Session: ${sessionCode.toUpperCase()} · ${new Date().toLocaleString('en-US', { timeZone: 'Pacific/Honolulu' })} HST`
          })
        }).catch(() => {});
      }

      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(200).json({ success: true });
    }
  }

  // ── GET: retrieve dashboard data ───────────────────────────────────
  if (req.method === 'GET') {
    const dashKey       = process.env.DRU_DASHBOARD_KEY;
    const researcherKey = process.env.DRU_RESEARCHER_KEY;
    if (!dashKey) {
      return res.status(503).json({ error: 'Dashboard not configured' });
    }
    const providedKey  = req.query.key;
    const isResearcher = researcherKey && providedKey === researcherKey;
    if (providedKey !== dashKey && !isResearcher) {
      return res.status(403).json({ error: 'Invalid key' });
    }

    try {
      // Get all session codes
      const sessionsRes = await fetch(`${redisBase}/smembers/drew:sessions`, {
        headers: { Authorization: `Bearer ${redisToken}` }
      });
      const sessionsData = await sessionsRes.json();
      const sessions = sessionsData.result || [];

      // Get all pre and post responses across all sessions
      const allPre = [];
      const allPost = [];
      const allFollowup = [];

      for (const session of sessions) {
        const preRes = await fetch(`${redisBase}/lrange/drew:pre:${session}/0/-1`, {
          headers: { Authorization: `Bearer ${redisToken}` }
        });
        const preData = await preRes.json();
        if (preData.result) {
          preData.result.forEach(r => {
            try { allPre.push(typeof r === 'string' ? JSON.parse(r) : r); } catch (e) {}
          });
        }

        const postRes = await fetch(`${redisBase}/lrange/drew:post:${session}/0/-1`, {
          headers: { Authorization: `Bearer ${redisToken}` }
        });
        const postData = await postRes.json();
        if (postData.result) {
          postData.result.forEach(r => {
            try { allPost.push(typeof r === 'string' ? JSON.parse(r) : r); } catch (e) {}
          });
        }

        const followupRes = await fetch(`${redisBase}/lrange/drew:followup:${session}/0/-1`, {
          headers: { Authorization: `Bearer ${redisToken}` }
        });
        const followupData = await followupRes.json();
        if (followupData.result) {
          followupData.result.forEach(r => {
            try { allFollowup.push(typeof r === 'string' ? JSON.parse(r) : r); } catch (e) {}
          });
        }
      }

      return res.status(200).json({
        sessions: sessions.sort(),
        pre: allPre,
        post: allPost,
        followup: allFollowup,
        isResearcher
      });

    } catch (e) {
      return res.status(500).json({ error: 'Data retrieval failed' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
