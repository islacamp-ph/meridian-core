import type { VercelRequest, VercelResponse } from '@vercel/node';
import { markWaitlist } from './lib/store.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const source = typeof req.body?.source === 'string' ? req.body.source : 'docs-waitlist';

  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const payload = {
    email,
    source,
    joined_at: new Date().toISOString(),
  };

  try {
    await markWaitlist(email);
  } catch (err) {
    console.error('waitlist:store_failed', err);
  }

  const webhook = process.env.WAITLIST_WEBHOOK_URL;
  if (webhook) {
    try {
      const webhookRes = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!webhookRes.ok) {
        console.error('waitlist:webhook_failed', webhookRes.status, await webhookRes.text());
      }
    } catch (err) {
      console.error('waitlist:webhook_error', err);
    }
  } else {
    console.log('waitlist:signup', JSON.stringify(payload));
  }

  return res.status(200).json({ success: true });
}
