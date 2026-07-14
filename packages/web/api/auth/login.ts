import bcrypt from 'bcryptjs';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setSessionCookie, signSession } from '../lib/auth.js';
import { json, parseJsonBody, validateEmail } from '../lib/http.js';
import { getUserByEmail, storageReady } from '../lib/store.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  if (!storageReady()) {
    return json(res, 503, { error: 'Account storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' });
  }

  if (!process.env.AUTH_SECRET) {
    return json(res, 503, { error: 'AUTH_SECRET is not configured on the server.' });
  }

  const body = parseJsonBody<{ email?: string; password?: string }>(req);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!validateEmail(email) || !password) {
    return json(res, 400, { error: 'Email and password are required.' });
  }

  const user = await getUserByEmail(email);
  if (!user) {
    return json(res, 401, { error: 'Invalid email or password.' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return json(res, 401, { error: 'Invalid email or password.' });
  }

  const token = await signSession({ sub: user.id, email: user.email });
  setSessionCookie(res, token);

  return json(res, 200, {
    user: { id: user.id, email: user.email, name: user.name },
  });
}
