import { getSupabase, hasSupabase } from './supabase.js';
import type { ApiKeyRecord, UserRecord } from './types.js';

const memoryUsersByEmail = new Map<string, UserRecord>();
const memoryUsersById = new Map<string, UserRecord>();
const memoryApiKeys = new Map<string, ApiKeyRecord[]>();
const memoryWaitlist = new Map<string, { email: string; joined_at: string }>();

function useMemory(): boolean {
  return !hasSupabase();
}

function rowToUser(row: {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
  name: string | null;
}): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    name: row.name ?? undefined,
  };
}

function rowToApiKey(row: {
  id: string;
  user_id: string;
  name: string;
  prefix: string;
  hash: string;
  created_at: string;
  last_used_at: string | null;
}): ApiKeyRecord {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    prefix: row.prefix,
    hash: row.hash,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at ?? undefined,
  };
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  if (useMemory()) {
    return memoryUsersByEmail.get(email) ?? null;
  }

  const { data, error } = await getSupabase()
    .from('users')
    .select('id, email, password_hash, created_at, name')
    .eq('email', email)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToUser(data) : null;
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  if (useMemory()) {
    return memoryUsersById.get(id) ?? null;
  }

  const { data, error } = await getSupabase()
    .from('users')
    .select('id, email, password_hash, created_at, name')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToUser(data) : null;
}

export async function saveUser(user: UserRecord): Promise<void> {
  if (useMemory()) {
    memoryUsersByEmail.set(user.email, user);
    memoryUsersById.set(user.id, user);
    return;
  }

  const { error } = await getSupabase().from('users').insert({
    id: user.id,
    email: user.email,
    password_hash: user.passwordHash,
    created_at: user.createdAt,
    name: user.name ?? null,
  });

  if (error) throw error;
}

export async function isOnWaitlist(email: string): Promise<boolean> {
  if (useMemory()) {
    return memoryWaitlist.has(email);
  }

  const { data, error } = await getSupabase()
    .from('waitlist')
    .select('email')
    .eq('email', email)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

export async function markWaitlist(email: string): Promise<void> {
  const joinedAt = new Date().toISOString();

  if (useMemory()) {
    memoryWaitlist.set(email, { email, joined_at: joinedAt });
    return;
  }

  const { error } = await getSupabase().from('waitlist').upsert(
    { email, joined_at: joinedAt },
    { onConflict: 'email' },
  );

  if (error) throw error;
}

export async function listApiKeys(userId: string): Promise<ApiKeyRecord[]> {
  if (useMemory()) {
    return memoryApiKeys.get(userId) ?? [];
  }

  const { data, error } = await getSupabase()
    .from('api_keys')
    .select('id, user_id, name, prefix, hash, created_at, last_used_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(rowToApiKey);
}

export async function saveApiKeys(userId: string, keys: ApiKeyRecord[]): Promise<void> {
  if (useMemory()) {
    memoryApiKeys.set(userId, keys);
    return;
  }

  const supabase = getSupabase();
  const { error: deleteError } = await supabase.from('api_keys').delete().eq('user_id', userId);
  if (deleteError) throw deleteError;

  if (keys.length === 0) return;

  const { error: insertError } = await supabase.from('api_keys').insert(
    keys.map((key) => ({
      id: key.id,
      user_id: key.userId,
      name: key.name,
      prefix: key.prefix,
      hash: key.hash,
      created_at: key.createdAt,
      last_used_at: key.lastUsedAt ?? null,
    })),
  );

  if (insertError) throw insertError;
}

export function storageReady(): boolean {
  return hasSupabase() || process.env.NODE_ENV !== 'production';
}
