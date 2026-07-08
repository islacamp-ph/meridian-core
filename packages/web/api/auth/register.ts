import bcrypt from 'bcryptjs';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateUserId, setSessionCookie, signSession } from '../lib/auth.js';
import { json, parseJsonBody, validateEmail } from '../lib/http.js';
import { getUserByEmail, saveUser, storageReady } from '../lib/store.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  if (!storageReady()) {
    return json(res, 503, { error: 'Account storage is not configured. Add Vercel KV to this project.' });
  }

  if (!process.env.AUTH_SECRET) {
    return json(res, 503, { error: 'AUTH_SECRET is not configured on the server.' });
  }

  const body = parseJsonBody<{ email?: string; password?: string; name?: string }>(req);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const name = typeof body.name === 'string' ? body.name.trim() : undefined;

  if (!validateEmail(email)) {
    return json(res, 400, { error: 'Please enter a valid email address.' });
  }
  if (password.length < 8) {
    return json(res, 400, { error: 'Password must be at least 8 characters.' });
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    return json(res, 409, { error: 'An account with this email already exists.' });
  }

  const user = {
    id: generateUserId(),
    email,
    passwordHash: await bcrypt.hash(password, 12),
    createdAt: new Date().toISOString(),
    name: name || undefined,
  };

  await saveUser(user);

  const token = await signSession({ sub: user.id, email: user.email });
  setSessionCookie(res, token);

  return json(res, 201, {
    user: { id: user.id, email: user.email, name: user.name },
  });
}
