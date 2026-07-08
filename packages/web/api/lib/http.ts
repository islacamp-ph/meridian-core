import type { VercelRequest, VercelResponse } from '@vercel/node';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseJsonBody<T extends Record<string, unknown>>(req: VercelRequest): T {
  return (req.body ?? {}) as T;
}

export function validateEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

export function json(res: VercelResponse, status: number, body: unknown): void {
  res.status(status).json(body);
}
