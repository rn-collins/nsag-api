// api/digest.js — Daily digest for RN Collins
// Called by Vercel cron at 9am HST (19:00 UTC) daily
// Env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN,
//           RESEND_API_KEY, RESEND_FROM_EMAIL, DRU_DIGEST_EMAIL

export default async function handler(req, res) {
  // Allow manual trigger via GET with secret, or automatic cron call
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const redisBase  = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const resendKey  = process.env.RESEND_API_KEY;
  const fromEmail  = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  const toEmail    = process.env.DRU_DIGEST_EMAIL  || 'collins.ra@northeastern.edu';

  if (!redisBase || !resendKey) {
    return res.status(503).json({ error: 'Digest not configured' });
  }

  try {
    // Get all session codes
    const sessRes  = await fetch(`${redisBase}/smembers/drew:sessions`, {
      headers: { Authorization: `Bearer ${redisToken}` }
    });
    const sessData = await sessRes.json();
    const sessions = sessData.result || [];

    const now      = Date.now();
    const since24h = now - 24 * 60 * 60 * 1000;

    // Pull all data
    const allItems = { pre: [], post: [], followup: [] };
    const bySession = {};

    for (const session of sessions) {
      bySession[session] = { pre: 0, post: 0, followup: 0 };

      for (const type of ['pre', 'post', 'followup']) {
        const r = await fetch(`${redisBase}/lrange/drew:${type}:${session}/0/-1`, {
          headers: { Authorization: `Bearer ${redisToken}` }
        });
        const d = await r.json();
        if (d.result) {
          d.result.forEach(item => {
            try {
              const parsed = typeof item === 'string' ? JSON.parse(item) : item;
              const ts = parsed.timestamp ? new Date(parsed.timestamp).getTime() : 0;
              if (ts >= since24h) {
                allItems[type].push(parsed);
                bySession[session][type]++;
              }
            } catch (e) {}
          });
        }
      }
    }

    const totalYesterday = allItems.pre.length + allItems.post.length + allItems.followup.length;

    // Compute subscale averages for yesterday's submissions
    const SUBSCALE_KEYS = {
      knowledge: ['drug_interactions','documentation_awareness','nondisclosure_risk','product_literacy','polypharmacy','system_readiness'],
      attitude:  ['disclosure_comfort','provider_response','racial_cultural_factors','care_setting_context','provider_type_comfort'],
      behavior:  ['past_disclosure','caregiver_disclosure','documentation_concern']
    };
    function avg(items, keys) {
      const vals = items.flatMap(r =>
        keys.map(k => r.scores?.[k]).filter(v => v !== undefined && v !== null)
      );
      return vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length/3*100) : null;
    }

    const preK  = avg(allItems.pre,  SUBSCALE_KEYS.knowledge);
    const preA  = avg(allItems.pre,  SUBSCALE_KEYS.attitude);
    const preB  = avg(allItems.pre,  SUBSCALE_KEYS.behavior);
    const postK = avg(allItems.post, SUBSCALE_KEYS.knowledge);
    const postA = avg(allItems.post, SUBSCALE_KEYS.attitude);
    const postB = avg(allItems.post, SUBSCALE_KEYS.behavior);

    // Active sessions (had activity yesterday)
    const activeSessions = Object.entries(bySession)
      .filter(([s, counts]) => counts.pre + counts.post + counts.followup > 0)
      .sort((a, b) => (b[1].pre + b[1].post + b[1].followup) - (a[1].pre + a[1].post + a[1].followup));

    // Running totals (all time)
    const allTimeRes = await fetch(`${redisBase}/smembers/drew:sessions`, {
      headers: { Authorization: `Bearer ${redisToken}` }
    });
    const allTimeData = await allTimeRes.json();
    const allTimeSessions = allTimeData.result || [];
    let grandTotal = { pre: 0, post: 0, followup: 0 };
    for (const session of allTimeSessions) {
      for (const type of ['pre', 'post', 'followup']) {
        const r = await fetch(`${redisBase}/llen/drew:${type}:${session}`, {
          headers: { Authorization: `Bearer ${redisToken}` }
        });
        const d = await r.json();
        grandTotal[type] += d.result || 0;
      }
    }
    const grandTotalAll = grandTotal.pre + grandTotal.post + grandTotal.followup;

    const dateStr = new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
      timeZone: 'Pacific/Honolulu'
    });

    // Build session rows HTML
    const sessionRows = activeSessions.length > 0
      ? activeSessions.map(([code, counts]) => `
          <tr>
            <td style="padding:8px 12px;font-family:'Courier New',monospace;font-size:13px;color:#1A2B22;border-bottom:1px solid #f0f0f0;">${code}</td>
            <td style="padding:8px 12px;text-align:center;font-size:13px;color:#1B4D8A;border-bottom:1px solid #f0f0f0;">${counts.pre}</td>
            <td style="padding:8px 12px;text-align:center;font-size:13px;color:#2D6A4F;border-bottom:1px solid #f0f0f0;">${counts.post}</td>
            <td style="padding:8px 12px;text-align:center;font-size:13px;color:#B8842A;border-bottom:1px solid #f0f0f0;">${counts.followup}</td>
          </tr>`)
        .join('')
      : '<tr><td colspan="4" style="padding:16px 12px;color:#8A9983;text-align:center;font-size:13px;">No submissions in the last 24 hours</td></tr>';

    const subscaleRows = (allItems.pre.length > 0 || allItems.post.length > 0) ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px;">
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#666;width:100px;">Knowledge</td>
          <td style="padding:4px 8px;font-size:12px;color:#1B4D8A;">${preK !== null ? `Pre: ${preK}%` : '—'}</td>
          <td style="padding:4px 8px;font-size:12px;color:#2D6A4F;">${postK !== null ? `Post: ${postK}%` : '—'}</td>
          ${preK !== null && postK !== null ? `<td style="padding:4px 8px;font-size:12px;font-weight:700;color:${postK-preK>0?'#2D6A4F':'#C0392B'};">${postK-preK>0?'+':''}${postK-preK}%</td>` : '<td></td>'}
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#666;">Attitude</td>
          <td style="padding:4px 8px;font-size:12px;color:#1B4D8A;">${preA !== null ? `Pre: ${preA}%` : '—'}</td>
          <td style="padding:4px 8px;font-size:12px;color:#2D6A4F;">${postA !== null ? `Post: ${postA}%` : '—'}</td>
          ${preA !== null && postA !== null ? `<td style="padding:4px 8px;font-size:12px;font-weight:700;color:${postA-preA>0?'#2D6A4F':'#C0392B'};">${postA-preA>0?'+':''}${postA-preA}%</td>` : '<td></td>'}
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#666;">Behavior</td>
          <td style="padding:4px 8px;font-size:12px;color:#1B4D8A;">${preB !== null ? `Pre: ${preB}%` : '—'}</td>
          <td style="padding:4px 8px;font-size:12px;color:#2D6A4F;">${postB !== null ? `Post: ${postB}%` : '—'}</td>
          ${preB !== null && postB !== null ? `<td style="padding:4px 8px;font-size:12px;font-weight:700;color:${postB-preB>0?'#2D6A4F':'#C0392B'};">${postB-preB>0?'+':''}${postB-preB}%</td>` : '<td></td>'}
        </tr>
      </table>` : '<p style="font-size:12px;color:#8A9983;margin:4px 0;">No pre/post submissions yesterday</p>';

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F4F8F4;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F8F4;padding:32px 20px;">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

      <tr><td style="background:#1B4332;padding:22px 28px;border-radius:4px 4px 0 0;">
        <p style="margin:0;font-family:Arial,sans-serif;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.6);">Project Destigmatized Healthcare</p>
        <p style="margin:6px 0 0;font-size:20px;font-weight:400;color:#fff;">Daily Intelligence Digest</p>
        <p style="margin:4px 0 0;font-family:Arial,sans-serif;font-size:12px;color:rgba(255,255,255,.7);">${dateStr} · Honolulu</p>
      </td></tr>

      <tr><td style="background:#fff;padding:24px 28px;border-left:1px solid #e8f0ec;border-right:1px solid #e8f0ec;">

        <!-- Yesterday stats -->
        <p style="margin:0 0 14px;font-family:Arial,sans-serif;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#7A9983;">Yesterday</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
          <tr>
            <td style="text-align:center;padding:12px;background:#F0F7ED;border-radius:4px;margin-right:8px;">
              <div style="font-size:32px;font-weight:400;color:#1B4332;line-height:1;">${totalYesterday}</div>
              <div style="font-family:Arial,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#7A9983;margin-top:4px;">Total</div>
            </td>
            <td style="width:8px;"></td>
            <td style="text-align:center;padding:12px;background:#E4EEF9;border-radius:4px;">
              <div style="font-size:32px;font-weight:400;color:#1B4D8A;line-height:1;">${allItems.pre.length}</div>
              <div style="font-family:Arial,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#7A9983;margin-top:4px;">Pre</div>
            </td>
            <td style="width:8px;"></td>
            <td style="text-align:center;padding:12px;background:#F0F7ED;border-radius:4px;">
              <div style="font-size:32px;font-weight:400;color:#2D6A4F;line-height:1;">${allItems.post.length}</div>
              <div style="font-family:Arial,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#7A9983;margin-top:4px;">Post</div>
            </td>
            <td style="width:8px;"></td>
            <td style="text-align:center;padding:12px;background:#FBF3E4;border-radius:4px;">
              <div style="font-size:32px;font-weight:400;color:#B8842A;line-height:1;">${allItems.followup.length}</div>
              <div style="font-family:Arial,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#7A9983;margin-top:4px;">Follow-Up</div>
            </td>
          </tr>
        </table>

        <!-- Subscale averages -->
        <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#7A9983;">Yesterday's Subscale Averages</p>
        ${subscaleRows}

        <!-- Active sessions -->
        <p style="margin:20px 0 8px;font-family:Arial,sans-serif;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#7A9983;">Active Sessions Yesterday</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8f0ec;border-radius:4px;overflow:hidden;">
          <tr style="background:#F4F8F4;">
            <th style="padding:8px 12px;font-family:Arial,sans-serif;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#7A9983;text-align:left;">Session</th>
            <th style="padding:8px 12px;font-family:Arial,sans-serif;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#1B4D8A;text-align:center;">Pre</th>
            <th style="padding:8px 12px;font-family:Arial,sans-serif;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#2D6A4F;text-align:center;">Post</th>
            <th style="padding:8px 12px;font-family:Arial,sans-serif;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#B8842A;text-align:center;">F/U</th>
          </tr>
          ${sessionRows}
        </table>

      </td></tr>

      <!-- All-time totals -->
      <tr><td style="background:#F0F7ED;padding:16px 28px;border-left:1px solid #e8f0ec;border-right:1px solid #e8f0ec;">
        <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#7A9983;">Running Total — All Time</p>
        <p style="margin:0;font-size:22px;font-weight:400;color:#1B4332;">${grandTotalAll} responses across ${allTimeSessions.length} sessions</p>
        <p style="margin:4px 0 0;font-family:Arial,sans-serif;font-size:12px;color:#7A9983;">${grandTotal.pre} pre · ${grandTotal.post} post · ${grandTotal.followup} follow-up</p>
      </td></tr>

      <!-- CTA -->
      <tr><td style="background:#fff;padding:16px 28px 20px;border-left:1px solid #e8f0ec;border-right:1px solid #e8f0ec;border-bottom:1px solid #e8f0ec;text-align:center;border-radius:0 0 4px 4px;">
        <a href="https://dru-assessment.vercel.app?dashboard" style="display:inline-block;background:#1B4332;color:#fff;font-family:Arial,sans-serif;font-weight:700;font-size:12px;padding:10px 22px;border-radius:3px;text-decoration:none;">Open Researcher Dashboard →</a>
        <p style="margin:10px 0 0;font-family:Arial,sans-serif;font-size:10px;color:#8A9983;">Aloha AI Consulting · collins.ra@northeastern.edu</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;

    // Send via Resend
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `Project Destigmatized Healthcare <${fromEmail}>`,
        to: toEmail,
        subject: `Dru Tour Digest — ${totalYesterday} submission${totalYesterday !== 1 ? 's' : ''} · ${dateStr}`,
        html
      })
    });

    const emailData = await emailRes.json();
    return res.status(200).json({
      success: true,
      yesterday: totalYesterday,
      allTime: grandTotalAll,
      emailId: emailData.id || null
    });

  } catch (e) {
    console.error('Digest error:', e);
    return res.status(500).json({ error: 'Digest failed', detail: e.message });
  }
}
