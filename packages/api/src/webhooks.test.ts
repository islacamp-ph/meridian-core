import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deleteWebhook,
  dispatchWebhookEvent,
  eventsForAnalysis,
  listWebhooks,
  registerWebhook,
  resetWebhooksForTests,
} from './webhooks.js';

afterEach(() => {
  resetWebhooksForTests();
  delete process.env.MERIDIAN_WEBHOOK_URLS;
});

describe('webhooks', () => {
  it('registers, lists, and deletes subscriptions', () => {
    const created = registerWebhook({
      url: 'https://hooks.example.com/meridian',
      events: ['approval.required'],
      label: 'treasury',
    });
    expect(created.id).toMatch(/^wh_/);
    expect(listWebhooks()).toHaveLength(1);
    expect(deleteWebhook(created.id)).toBe(true);
    expect(listWebhooks()).toHaveLength(0);
  });

  it('rejects non-http urls', () => {
    expect(() => registerWebhook({ url: 'ftp://bad.example' })).toThrow(/http/i);
  });

  it('dispatches matching events', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    registerWebhook({
      url: 'https://hooks.example.com/a',
      events: ['approval.required'],
      secret: 's3cret',
    });

    const results = await dispatchWebhookEvent(
      'approval.required',
      { decision: 'hold' },
      fetchFn as unknown as typeof fetch,
    );

    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledOnce();
    const [, init] = fetchFn.mock.calls[0];
    expect(init.headers['X-Meridian-Event']).toBe('approval.required');
    expect(init.headers['X-Meridian-Secret']).toBe('s3cret');
  });

  it('derives approval.required for hold decisions', () => {
    const events = eventsForAnalysis({
      verdict: 'WARN',
      decision: { action: 'hold', reason: 'needs review' },
      confidence: 0.8,
      gravity: { blast_radius: 55 },
      top_risks: [{ severity: 'HIGH', title: 'Wide blast' }],
      meta: { network: 'testnet' },
    });
    expect(events.map((e) => e.event)).toEqual([
      'analysis.completed',
      'risk.elevated',
      'approval.required',
    ]);
  });
});
