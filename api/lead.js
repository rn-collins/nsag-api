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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  setCors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = typeof req.body === 'object' && req.body ? req.body : {};
  const email = String(body.email || '').trim().toLowerCase();
  const name = String(body.name || '').trim().slice(0, 120);
  const organization = String(body.organization || body.org || '').trim().slice(0, 160);
  const message = String(body.message || '').trim().slice(0, 4000);
  const purpose = String(body.purpose || '').trim();
  const source = String(body.source || 'nsag-site').replace(/[^a-z0-9_-]/gi, '').slice(0, 80);

  if (body.consent !== true) {
    return res.status(400).json({ error: 'Explicit consent is required' });
  }
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Valid email required' });
  if (!['contact', 'ce-inquiry'].includes(purpose)) {
    return res.status(400).json({
      error: 'This endpoint accepts consented contact inquiries only; assessment answers, report delivery, and newsletter enrollment are not active'
    });
  }
  if (!message && purpose === 'contact') {
    return res.status(400).json({ error: 'Message is required for contact inquiries' });
  }

  const redisBase = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const toEmail = process.env.NSAG_INQUIRY_EMAIL;

  if (!redisBase || !redisToken || !resendKey || !fromEmail || !toEmail) {
    return res.status(503).json({ error: 'Inquiry delivery is not configured; email collins.ra@northeastern.edu directly' });
  }

  const inquiry = {
    id: crypto.randomUUID(),
    email, name, organization, message, purpose, source,
    consent: true,
    consentedAt: new Date().toISOString(),
    retention: '90-days-unless-continued-conversation'
  };

  try {
    const store = await fetch(`${redisBase}/setex/${encodeURIComponent(`nsag:inquiry:${inquiry.id}`)}/7776000`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(inquiry) })
    });
    if (!store.ok) throw new Error('storage unavailable');

    const delivery = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `NSAG Website <${fromEmail}>`,
        to: [toEmail],
        reply_to: email,
        subject: `NSAG ${purpose === 'ce-inquiry' ? 'CE inquiry' : 'contact inquiry'}`,
        text: [
          `Name: ${name || 'Not provided'}`,
          `Email: ${email}`,
          `Organization: ${organization || 'Not provided'}`,
          `Source: ${source}`,
          '',
          message || 'CE partnership inquiry'
        ].join('\n')
      })
    });
    if (!delivery.ok) throw new Error('email delivery unavailable');

    return res.status(202).json({
      accepted: true,
      message: 'Inquiry accepted for human review',
      delivery: 'human-supervised',
      retention: '90 days unless a continued conversation requires otherwise'
    });
  } catch (error) {
    console.error('NSAG inquiry failure');
    return res.status(503).json({ error: 'Inquiry could not be delivered; email collins.ra@northeastern.edu directly' });
  }
}
