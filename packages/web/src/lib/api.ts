export interface User {
  id: string;
  email: string;
  name?: string;
  createdAt?: string;
}

export interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
}

export async function fetchSession(): Promise<{ authenticated: boolean; user?: User }> {
  const response = await fetch('/api/auth/session', { credentials: 'include' });
  if (!response.ok) {
    return { authenticated: false };
  }
  return response.json();
}

export async function login(email: string, password: string): Promise<User> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? 'Login failed');
  }
  return data.user;
}

export async function register(
  email: string,
  password: string,
  name?: string,
): Promise<User> {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password, name }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? 'Registration failed');
  }
  return data.user;
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
}

export async function listApiKeys(): Promise<ApiKeySummary[]> {
  const response = await fetch('/api/keys', { credentials: 'include' });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? 'Failed to load API keys');
  }
  return data.keys;
}

export async function createApiKey(name: string): Promise<ApiKeySummary & { secret: string }> {
  const response = await fetch('/api/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ name }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? 'Failed to create API key');
  }
  return data.key;
}

export async function revokeApiKey(id: string): Promise<void> {
  const response = await fetch(`/api/keys/revoke?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? 'Failed to revoke API key');
  }
}
