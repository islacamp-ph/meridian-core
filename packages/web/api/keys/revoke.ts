import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionFromRequest } from '../lib/auth.js';
import { json } from '../lib/http.js';
import { listApiKeys, saveApiKeys } from '../lib/store.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const session = await getSessionFromRequest(req);
  if (!session) {
    return json(res, 401, { error: 'Not authenticated' });
  }

  const keyId = typeof req.query.id === 'string' ? req.query.id : '';
  if (!keyId) {
    return json(res, 400, { error: 'Key id is required' });
  }

  const keys = await listApiKeys(session.sub);
  const next = keys.filter((key) => key.id !== keyId);

  if (next.length === keys.length) {
    return json(res, 404, { error: 'API key not found' });
  }

  await saveApiKeys(session.sub, next);
  return json(res, 200, { success: true });
}
