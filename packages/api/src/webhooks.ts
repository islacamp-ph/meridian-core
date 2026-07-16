/**
 * In-memory webhook registry + delivery for treasury / signer approval routing.
 *
 * Persistence is process-local by default. Set MERIDIAN_WEBHOOK_URLS (comma-separated)
 * to seed destinations that receive every analysis event.
 */

export type WebhookEventType =
  | 'analysis.completed'
  | 'analysis.failed'
  | 'risk.elevated'
  | 'approval.required'
  | 'batch.completed';

export interface WebhookSubscription {
  id: string;
  url: string;
  events: WebhookEventType[];
  secret?: string;
  label?: string;
  created_at: string;
}

export interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface WebhookDeliveryResult {
  id: string;
  url: string;
  event: WebhookEventType;
  ok: boolean;
  status?: number;
  error?: string;
}

const subscriptions = new Map<string, WebhookSubscription>();
let seeded = false;

function seedFromEnv(): void {
  if (seeded) return;
  seeded = true;
  const raw = process.env.MERIDIAN_WEBHOOK_URLS;
  if (!raw) return;
  for (const url of raw.split(',').map((part) => part.trim()).filter(Boolean)) {
    const id = `env-${Buffer.from(url).toString('base64url').slice(0, 12)}`;
    subscriptions.set(id, {
      id,
      url,
      events: ['analysis.completed', 'risk.elevated', 'approval.required', 'analysis.failed'],
      created_at: new Date().toISOString(),
      label: 'env',
    });
  }
}

function newId(): string {
  return `wh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function listWebhooks(): WebhookSubscription[] {
  seedFromEnv();
  return [...subscriptions.values()];
}

export function registerWebhook(input: {
  url: string;
  events?: WebhookEventType[];
  secret?: string;
  label?: string;
}): WebhookSubscription {
  seedFromEnv();
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    throw new Error('Webhook url must be an absolute HTTP(S) URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Webhook url must use http or https.');
  }

  const sub: WebhookSubscription = {
    id: newId(),
    url: input.url,
    events: input.events?.length
      ? input.events
      : ['analysis.completed', 'risk.elevated', 'approval.required'],
    secret: input.secret,
    label: input.label,
    created_at: new Date().toISOString(),
  };
  subscriptions.set(sub.id, sub);
  return sub;
}

export function deleteWebhook(id: string): boolean {
  seedFromEnv();
  return subscriptions.delete(id);
}

async function deliverOne(
  sub: WebhookSubscription,
  payload: WebhookPayload,
  fetchFn: typeof fetch,
): Promise<WebhookDeliveryResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'MERIDIAN-Webhooks/1.0',
    'X-Meridian-Event': payload.event,
  };
  if (sub.secret) {
    headers['X-Meridian-Secret'] = sub.secret;
  }

  try {
    const response = await fetchFn(sub.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    return {
      id: sub.id,
      url: sub.url,
      event: payload.event,
      ok: response.ok,
      status: response.status,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (err) {
    return {
      id: sub.id,
      url: sub.url,
      event: payload.event,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Fan-out a webhook event to all matching subscriptions (best-effort, parallel).
 */
export async function dispatchWebhookEvent(
  event: WebhookEventType,
  data: Record<string, unknown>,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<WebhookDeliveryResult[]> {
  seedFromEnv();
  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  const targets = [...subscriptions.values()].filter((sub) => sub.events.includes(event));
  if (targets.length === 0) return [];

  return Promise.all(targets.map((sub) => deliverOne(sub, payload, fetchFn)));
}

/**
 * Derive treasury/signer routing events from an analysis response.
 */
export function eventsForAnalysis(analysis: {
  verdict: string;
  decision: { action: string; reason: string };
  confidence: number;
  gravity: { blast_radius: number };
  top_risks?: Array<{ severity: string; title: string }>;
  policy?: { effect: string; passed: boolean };
  meta: { network: string };
}): Array<{ event: WebhookEventType; data: Record<string, unknown> }> {
  const base = {
    verdict: analysis.verdict,
    decision: analysis.decision.action,
    decision_reason: analysis.decision.reason,
    confidence: analysis.confidence,
    blast_radius: analysis.gravity.blast_radius,
    top_risks: analysis.top_risks ?? [],
    policy_effect: analysis.policy?.effect,
    policy_passed: analysis.policy?.passed,
    network: analysis.meta.network,
  };

  const events: Array<{ event: WebhookEventType; data: Record<string, unknown> }> = [
    { event: 'analysis.completed', data: base },
  ];

  if (analysis.verdict === 'WARN' || analysis.verdict === 'ABORT') {
    events.push({ event: 'risk.elevated', data: base });
  }

  if (
    analysis.decision.action === 'hold'
    || analysis.decision.action === 'rewrite'
    || analysis.policy?.effect === 'WARN'
  ) {
    events.push({
      event: 'approval.required',
      data: {
        ...base,
        approval_route: analysis.decision.action === 'rewrite' ? 'rewrite_then_approve' : 'human_approve',
      },
    });
  }

  return events;
}

/** Test helper — clear in-memory subscriptions. */
export function resetWebhooksForTests(): void {
  subscriptions.clear();
  seeded = false;
}
