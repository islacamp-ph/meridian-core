export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  name?: string;
}

export interface ApiKeyRecord {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  hash: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface SessionPayload {
  sub: string;
  email: string;
}
