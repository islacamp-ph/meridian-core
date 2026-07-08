import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionFromRequest } from '../lib/auth.js';
import { json } from '../lib/http.js';
import { getUserById } from '../lib/store.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const session = await getSessionFromRequest(req);
  if (!session) {
    return json(res, 401, { authenticated: false });
  }

  const user = await getUserById(session.sub);
  if (!user) {
    return json(res, 401, { authenticated: false });
  }

  return json(res, 200, {
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    },
  });
}
