import { kv } from '@vercel/kv';
import type { ApiKeyRecord, UserRecord } from './types.js';

const memory = new Map<string, unknown>();

function hasKv(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function get<T>(key: string): Promise<T | null> {
  if (hasKv()) {
    return (await kv.get<T>(key)) ?? null;
  }
  return (memory.get(key) as T) ?? null;
}

async function set(key: string, value: unknown): Promise<void> {
  if (hasKv()) {
    await kv.set(key, value);
    return;
  }
  memory.set(key, value);
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  return get<UserRecord>(`user:email:${email}`);
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  return get<UserRecord>(`user:id:${id}`);
}

export async function saveUser(user: UserRecord): Promise<void> {
  await set(`user:email:${user.email}`, user);
  await set(`user:id:${user.id}`, user);
}

export async function isOnWaitlist(email: string): Promise<boolean> {
  const entry = await get<{ email: string }>(`waitlist:${email}`);
  return Boolean(entry);
}

export async function markWaitlist(email: string): Promise<void> {
  await set(`waitlist:${email}`, { email, joined_at: new Date().toISOString() });
}

export async function listApiKeys(userId: string): Promise<ApiKeyRecord[]> {
  return (await get<ApiKeyRecord[]>(`apikeys:${userId}`)) ?? [];
}

export async function saveApiKeys(userId: string, keys: ApiKeyRecord[]): Promise<void> {
  await set(`apikeys:${userId}`, keys);
}

export function storageReady(): boolean {
  return hasKv() || process.env.NODE_ENV !== 'production';
}
