import type { VercelRequest, VercelResponse } from '@vercel/node';
import { clearSessionCookie } from '../lib/auth.js';
import { json } from '../lib/http.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  clearSessionCookie(res);
  return json(res, 200, { success: true });
}
