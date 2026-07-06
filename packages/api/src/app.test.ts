import { describe, it, expect } from 'vitest';
import { app } from './app.js';

describe('GET /v1/health', () => {
  it('returns ok status', async () => {
    const res = await app.request('/v1/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.product).toBe('MERIDIAN');
  });
});

describe('GET /v1/version', () => {
  it('returns version info', async () => {
    const res = await app.request('/v1/version');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.product).toBe('MERIDIAN');
    expect(body.version).toBeDefined();
  });
});

describe('POST /v1/analyze', () => {
  it('returns 400 for missing fields', async () => {
    const res = await app.request('/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('INVALID_REQUEST');
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await app.request('/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /v1/analyze/batch', () => {
  it('returns 400 for invalid JSON', async () => {
    const res = await app.request('/v1/analyze/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing items', async () => {
    const res = await app.request('/v1/analyze/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('INVALID_REQUEST');
  });

  it('returns 400 when a batch item has no network and no default network', async () => {
    const res = await app.request('/v1/analyze/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ tx: 'AAAA' }] }),
    });
    expect(res.status).toBe(400);
  });
});
