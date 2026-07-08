import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateApiKey, generateKeyId, getSessionFromRequest } from '../lib/auth.js';
import { json, parseJsonBody } from '../lib/http.js';
import { listApiKeys, saveApiKeys } from '../lib/store.js';
import type { ApiKeyRecord } from '../lib/types.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return json(res, 401, { error: 'Not authenticated' });
  }

  if (req.method === 'GET') {
    const keys = await listApiKeys(session.sub);
    return json(res, 200, {
      keys: keys.map((key) => ({
        id: key.id,
        name: key.name,
        prefix: key.prefix,
        createdAt: key.createdAt,
        lastUsedAt: key.lastUsedAt,
      })),
    });
  }

  if (req.method === 'POST') {
    const body = parseJsonBody<{ name?: string }>(req);
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Default';

    const keys = await listApiKeys(session.sub);
    if (keys.length >= 5) {
      return json(res, 400, { error: 'Maximum of 5 API keys per account.' });
    }

    const { raw, prefix, hash } = generateApiKey();
    const record: ApiKeyRecord = {
      id: generateKeyId(),
      userId: session.sub,
      name,
      prefix,
      hash,
      createdAt: new Date().toISOString(),
    };

    await saveApiKeys(session.sub, [record, ...keys]);

    return json(res, 201, {
      key: {
        id: record.id,
        name: record.name,
        prefix: record.prefix,
        createdAt: record.createdAt,
        secret: raw,
      },
    });
  }

  return json(res, 405, { error: 'Method not allowed' });
}
