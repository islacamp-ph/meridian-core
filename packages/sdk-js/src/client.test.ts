import { describe, expect, it, vi } from 'vitest';
import { MeridianClient, MeridianClientError } from './client.js';

function mockFetch(response: { status: number; body: unknown }): typeof fetch {
  return vi.fn(async () => ({
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    text: async () => JSON.stringify(response.body),
  })) as unknown as typeof fetch;
}

describe('MeridianClient', () => {
  it('calls /v1/analyze with the request body', async () => {
    const fetchFn = mockFetch({
      status: 200,
      body: { verdict: 'CLEAR', confidence: 0.9 },
    });
    const client = new MeridianClient({
      baseUrl: 'https://api.example.com',
      fetch: fetchFn,
    });

    const result = await client.analyze({
      tx: 'AAAA...',
      network: 'testnet',
    });

    expect(result.verdict).toBe('CLEAR');
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example.com/v1/analyze',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ tx: 'AAAA...', network: 'testnet' }),
      }),
    );
  });

  it('sends Authorization header when apiKey is set', async () => {
    const fetchFn = mockFetch({ status: 200, body: { status: 'ok' } });
    const client = new MeridianClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'secret-key',
      fetch: fetchFn,
    });

    await client.health();
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example.com/v1/health',
      expect.objectContaining({
        headers: { Authorization: 'Bearer secret-key' },
      }),
    );
  });

  it('throws MeridianClientError on API errors', async () => {
    const client = new MeridianClient({
      baseUrl: 'https://api.example.com',
      fetch: mockFetch({
        status: 400,
        body: {
          error: 'Invalid transaction XDR',
          code: 'INVALID_XDR',
          hint: 'Provide base64-encoded XDR',
          layer: 'TRACE',
        },
      }),
    });

    await expect(
      client.trace({ tx: 'bad', network: 'testnet' }),
    ).rejects.toBeInstanceOf(MeridianClientError);
  });
});
