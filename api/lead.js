// nsag-api/api/lead.js
// Vercel serverless function — handles all 6 NSAG readiness tool lead submissions
// Deploy as separate Vercel project: nsag-api.vercel.app
// Env vars required: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, SLACK_WEBHOOK_URL, HUBSPOT_ACCESS_TOKEN

export default async function handler(req, res) {
  // CORS — allow all NSAG tool origins
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, org, source, module: mod, tier, scores, timestamp } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  const lead = { email, org: org || '', source, module: mod, tier, scores, timestamp: timestamp || new Date().toISOString() };

  try {
    // 1. Store in Redis
    const redisBase = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    const leadKey = `leads:nsag:${source}`;
    const allKey = 'leads:all_emails';
    const id = Date.now();

    // Store full lead
    await fetch(`${redisBase}/rpush/${leadKey}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([JSON.stringify({ id, ...lead })])
    });

    // Add to product-specific subscribers set
    await fetch(`${redisBase}/sadd/subscribers:${source}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([email])
    });

    // Add to master dedup set
    await fetch(`${redisBase}/sadd/${allKey}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([email])
    });

    // 2. Slack alert
    const slackMsg = {
      text: `🧠 *New NSAG Lead*\n*Module:* ${mod} | *Tier:* ${tier?.toUpperCase()}\n*Email:* ${email}\n*Org:* ${org || '(not provided)'}\n*Source:* ${source}\n*Time:* ${new Date().toLocaleString('en-US', { timeZone: 'Pacific/Honolulu' })} HST`
    };

    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackMsg)
    });

    // 3. HubSpot contact creation
    if (process.env.HUBSPOT_ACCESS_TOKEN) {
      const hsRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: {
            email,
            company: org || '',
            hs_lead_status: 'NEW',
            lifecyclestage: 'lead',
            // Custom properties — set these up in HubSpot first
            nsag_module: mod,
            nsag_tier: tier,
            nsag_source: source,
          }
        })
      });

      if (!hsRes.ok) {
        // 409 = contact already exists — update instead
        if (hsRes.status === 409) {
          const existing = await hsRes.json();
          const contactId = existing.message?.match(/ID: (\d+)/)?.[1];
          if (contactId) {
            await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
              method: 'PATCH',
              headers: {
                Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                properties: { nsag_module: mod, nsag_tier: tier, nsag_source: source, company: org || '' }
              })
            });
          }
        }
      }
    }

    return res.status(200).json({ success: true, message: 'Lead captured successfully' });

  } catch (err) {
    console.error('NSAG lead capture error:', err);
    // Still return 200 — don't break the tool for the user
    return res.status(200).json({ success: true, message: 'Received' });
  }
}
