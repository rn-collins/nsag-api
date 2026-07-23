// nsag-api/api/lead.js
// Handles all NSAG readiness tool (M3–M9) lead submissions
// Env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN,
//           SLACK_WEBHOOK_URL, HUBSPOT_ACCESS_TOKEN,
//           RESEND_API_KEY, RESEND_FROM_EMAIL (optional, defaults to onboarding@resend.dev)

// ─── DIMENSION LABELS PER MODULE ────────────────────────────────────
const DIM_LABELS = {
  'nsag-m3': { policy:'Policy Clarity', practitioners:'Practitioner Accountability', emergency:'Emergency Response', community:'Community Engagement', integration:'Integration Support', legal:'Legal Compliance' },
  'nsag-m4': { documentation:'Documentation Infrastructure', training:'Workforce Training', community:'Community Education', integration:'Healthcare Integration', policy:'Policy Alignment', data:'Data Collection' },
  'nsag-m5': { light:'Natural Light', biophilic:'Biophilic Elements', air:'Air Quality', acoustic:'Acoustic Environment', sensory:'Sensory Variation', outdoor:'Outdoor Access' },
  'nsag-m6': { disclosure:'Disclosure Practices', conflict:'Conflict of Interest Policy', community:'Community Benefit', criteria:'Sponsor Selection Criteria', accountability:'Accountability Mechanisms', independence:'Staff Independence' },
  'nsag-m7': { green:'Green Space Access', air:'Air & Acoustic Quality', civic:'Cognitive Accessibility', policy:'Policy Legibility', participation:'Participation Infrastructure', trauma:'Trauma-Informed Planning' },
  'nsag-m8': { workload:'Workload Distribution', recovery:'Recovery Time Infrastructure', safety:'Psychological Safety', leadership:'Leadership Support', systemic:'Systemic Change Capacity', trauma:'Secondary Trauma Support' },
  'nsag-m9': { disclosure:'Patient Disclosure Infrastructure', training:'Provider Training & Competency', documentation:'Documentation Systems', behavioral:'Behavioral Risk Intelligence', equity:'Health Equity Integration', adverse:'Adverse Event Capture' },
};

const TIER_COLORS = { pioneering:'#2E5A28', emerging:'#1B7A68', developing:'#B8842A', early:'#C24A2E' };
const TIER_LABELS = { pioneering:'Pioneering', emerging:'Emerging', developing:'Developing', early:'Early Stage' };

const MODULE_NAMES = {
  'nsag-m3':'M3 — Psychedelic Harm Reduction Governance',
  'nsag-m4':'M4 — Cannabis Public Health Infrastructure',
  'nsag-m5':'M5 — Biophilic Civic Infrastructure',
  'nsag-m6':'M6 — Ethical Civic Sponsorship',
  'nsag-m7':'M7 — Conscious Cities',
  'nsag-m8':'M8 — Burnout Recovery Infrastructure',
  'nsag-m9':'M9 — Cannabis Healthcare Visibility Infrastructure',
};

function getTier(score) {
  return score >= 80 ? 'pioneering' : score >= 60 ? 'emerging' : score >= 40 ? 'developing' : 'early';
}

// ─── EMAIL HTML GENERATOR ────────────────────────────────────────────
function buildEmailHTML({ email, org, source, mod, tier, scores }) {
  const dimLabels = DIM_LABELS[source] || {};
  const tierColor = TIER_COLORS[tier] || '#4D45A8';
  const tierLabel = TIER_LABELS[tier] || tier;
  const moduleName = MODULE_NAMES[source] || mod;

  const tierDescriptions = {
    pioneering: 'Your organization has built strong, multi-dimensional governance infrastructure in this area. The work now is maintaining these systems under pressure and closing the remaining gaps.',
    emerging: 'Your organization is building in the right direction. Meaningful structures exist, and the remaining gaps are specific and addressable — this is the tier where targeted interventions produce the most measurable improvement.',
    developing: 'Your organization has early-stage infrastructure. Some awareness and individual supports exist, but the structural conditions have not yet been addressed systematically. The risk of incidents, liability, and trust erosion is real.',
    early: 'Governance infrastructure for this domain does not yet meaningfully exist in your organization. The path forward starts with a leadership conversation and a formal assessment of what needs to be built first.',
  };

  const dimRows = Object.entries(scores || {}).map(([key, score]) => {
    const label = dimLabels[key] || key.replace(/_/g, ' ');
    const dimTier = getTier(Number(score));
    const dimColor = TIER_COLORS[dimTier];
    const pct = Math.round(Number(score));
    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #f0f0f0;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span style="font-family:'DM Mono',monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#666;">${label}</span>
            <span style="font-family:'DM Mono',monospace;font-size:11px;color:${dimColor};font-weight:600;">${TIER_LABELS[dimTier]}</span>
          </div>
          <div style="background:#f0f0f0;height:6px;border-radius:3px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${dimColor};border-radius:3px;"></div>
          </div>
        </td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F6F3EC;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F6F3EC;padding:40px 20px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

      <!-- HEADER -->
      <tr><td style="background:#4D45A8;padding:28px 36px;border-radius:4px 4px 0 0;">
        <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.7);">Neurocognitive Systems Advisory Group</p>
        <p style="margin:6px 0 0;font-family:Arial,sans-serif;font-size:13px;color:rgba(255,255,255,0.85);">${moduleName}</p>
      </td></tr>

      <!-- TIER REVEAL -->
      <tr><td style="background:#ffffff;padding:36px 36px 28px;border-left:1px solid #e8e5f5;border-right:1px solid #e8e5f5;">
        <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#8A8497;">Your organization is</p>
        <h1 style="margin:0 0 16px;font-size:48px;font-weight:400;line-height:1;color:${tierColor};">${tierLabel}</h1>
        <p style="margin:0;font-size:15px;line-height:1.7;color:#4A4656;">${tierDescriptions[tier] || ''}</p>
      </td></tr>

      <!-- DIMENSION BREAKDOWN -->
      <tr><td style="background:#ffffff;padding:0 36px 28px;border-left:1px solid #e8e5f5;border-right:1px solid #e8e5f5;">
        <p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#4D45A8;border-top:1px solid #f0f0f0;padding-top:20px;">Dimension Breakdown</p>
        <table width="100%" cellpadding="0" cellspacing="0">
          ${dimRows}
        </table>
      </td></tr>

      <!-- CTA -->
      <tr><td style="background:#4D45A8;padding:28px 36px;text-align:center;">
        <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:#ffffff;">Ready to move up a tier?</p>
        <p style="margin:0 0 20px;font-family:Arial,sans-serif;font-size:13px;color:rgba(255,255,255,0.8);">NSAG advisory — 90-day engagement from $8,500.</p>
        <a href="mailto:collins.ra@northeastern.edu?subject=NSAG Advisory Inquiry — ${mod}" style="display:inline-block;background:#ffffff;color:#4D45A8;font-family:Arial,sans-serif;font-weight:700;font-size:13px;padding:12px 28px;border-radius:3px;text-decoration:none;">Talk to an Advisor →</a>
      </td></tr>

      <!-- FOOTER -->
      <tr><td style="padding:20px 36px;text-align:center;background:#f6f3ec;border-radius:0 0 4px 4px;">
        <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#8A8497;">© 2026 Rayven-Nikkita Collins LLC · Honolulu, Hawai&#699;i · <a href="mailto:collins.ra@northeastern.edu" style="color:#4D45A8;text-decoration:none;">collins.ra@northeastern.edu</a></p>
        ${org ? `<p style="margin:6px 0 0;font-family:Arial,sans-serif;font-size:11px;color:#8A8497;">Sent to ${email} · ${org}</p>` : ''}
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ─── MAIN HANDLER ────────────────────────────────────────────────────
export default async function handler(req, res) {
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
    const redisBase = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    const leadKey = `leads:nsag:${source}`;
    const id = Date.now();

    // 1. Store in Redis
    await fetch(`${redisBase}/rpush/${leadKey}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([JSON.stringify({ id, ...lead })])
    });
    await fetch(`${redisBase}/sadd/subscribers:${source}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([email])
    });
    await fetch(`${redisBase}/sadd/leads:all_emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([email])
    });

    // 2. Send dimension report email via Resend (with delivery-status capture)
    let emailStatus = 'skipped (no RESEND_API_KEY or no scores)';
    if (process.env.RESEND_API_KEY && scores) {
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
      const fromName = 'NSAG — Neurocognitive Systems Advisory Group';
      try {
        const rr = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: `${fromName} <${fromEmail}>`,
            to: email,
            subject: `Your NSAG Readiness Report — ${TIER_LABELS[tier] || tier}`,
            html: buildEmailHTML({ email, org: org || '', source, mod, tier, scores })
          })
        });
        const rbody = await rr.json().catch(() => ({}));
        emailStatus = rr.ok
          ? `sent ✓ (id ${rbody.id || 'n/a'}, from ${fromEmail})`
          : `FAILED ${rr.status}: ${rbody.message || JSON.stringify(rbody)} — sender ${fromEmail}`;
      } catch (e) {
        emailStatus = `ERROR: ${e.message}`;
      }
      if (!emailStatus.startsWith('sent')) console.error('NSAG report email problem:', emailStatus);
    }

    // 3. Slack alert
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🧠 *New NSAG Lead*\n*Module:* ${mod} | *Tier:* ${tier?.toUpperCase()}\n*Email:* ${email}\n*Org:* ${org || '(not provided)'}\n*Source:* ${source}\n*Report email:* ${emailStatus}\n*Time:* ${new Date().toLocaleString('en-US', { timeZone: 'Pacific/Honolulu' })} HST`
      })
    });

    // 4. HubSpot
    if (process.env.HUBSPOT_ACCESS_TOKEN) {
      const hsRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties: { email, company: org || '', hs_lead_status: 'NEW', lifecyclestage: 'lead', nsag_module: mod, nsag_tier: tier, nsag_source: source } })
      });
      if (!hsRes.ok && hsRes.status === 409) {
        const existing = await hsRes.json();
        const contactId = existing.message?.match(/ID: (\d+)/)?.[1];
        if (contactId) {
          await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ properties: { nsag_module: mod, nsag_tier: tier, nsag_source: source, company: org || '' } })
          });
        }
      }
    }

    return res.status(200).json({ success: true, message: 'Lead captured successfully' });
  } catch (err) {
    console.error('NSAG lead capture error:', err);
    return res.status(200).json({ success: true, message: 'Received' });
  }
}
