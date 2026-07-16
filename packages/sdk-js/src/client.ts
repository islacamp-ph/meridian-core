import type {
  AnalyzeDiffRequest,
  AnalyzeDiffResponse,
  AnalyzeRequest,
  AnalyzeResponse,
  BatchAnalyzeItemRequest,
  BatchAnalyzeResponse,
  EcosystemManifest,
  FieldResult,
  GravityResult,
  MeridianError,
  Network,
  StructuredAnalyzeResponse,
  TraceResult,
} from '@meridian/core';

export interface MeridianClientOptions {
  /** Base URL of the MERIDIAN API (e.g. https://api.example.com) */
  baseUrl: string;
  /** API key for authenticated deployments */
  apiKey?: string;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Custom fetch implementation */
  fetch?: typeof fetch;
}

export interface TraceRequest {
  tx: string;
  network: Network;
}

export interface FieldRequest extends TraceRequest {
  ecosystem?: EcosystemManifest;
}

export interface GravityRequest extends FieldRequest {}

export interface BatchAnalyzeRequest {
  items: BatchAnalyzeItemRequest[];
  default_network?: Network;
}

export interface ScreenRequest extends AnalyzeRequest {
  profile: 'exchange' | 'custodian' | 'treasury' | 'wallet';
  allowlist?: string[];
}

export interface WebhookSubscription {
  id: string;
  url: string;
  events: string[];
  secret?: string;
  label?: string;
  created_at: string;
}

/**
 * HTTP client for the MERIDIAN REST API.
 *
 * For local/offline analysis, import engines directly from `@meridian/core`.
 */
export class MeridianClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: MeridianClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.fetchFn = options.fetch ?? globalThis.fetch;
  }

  async health(): Promise<{ status: string }> {
    return this.get('/v1/health');
  }

  async version(): Promise<{ product: string; version: string }> {
    return this.get('/v1/version');
  }

  async analyze(request: AnalyzeRequest): Promise<AnalyzeResponse> {
    return this.post('/v1/analyze', request);
  }

  async analyzeBatch(request: BatchAnalyzeRequest): Promise<BatchAnalyzeResponse> {
    return this.post('/v1/analyze/batch', request);
  }

  async analyzeDiff(request: AnalyzeDiffRequest): Promise<AnalyzeDiffResponse> {
    return this.post('/v1/analyze/diff', request);
  }

  /** Exchange / custodian / treasury / wallet screening profile. */
  async screen(request: ScreenRequest): Promise<Record<string, unknown>> {
    return this.post('/v1/screen', request);
  }

  async listWebhooks(): Promise<{ webhooks: WebhookSubscription[] }> {
    return this.get('/v1/webhooks');
  }

  async registerWebhook(input: {
    url: string;
    events?: string[];
    secret?: string;
    label?: string;
  }): Promise<WebhookSubscription> {
    return this.post('/v1/webhooks', input);
  }

  async deleteWebhook(id: string): Promise<{ deleted: boolean; id: string }> {
    return this.delete(`/v1/webhooks/${encodeURIComponent(id)}`);
  }

  async trace(request: TraceRequest): Promise<TraceResult> {
    return this.post('/v1/trace', request);
  }

  async field(request: FieldRequest): Promise<FieldResult> {
    return this.post('/v1/field', request);
  }

  async gravity(request: GravityRequest): Promise<GravityResult> {
    return this.post('/v1/gravity', request);
  }

  private async get<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(`${this.baseUrl}${path}`, {
        method: 'GET',
        headers: this.headers(),
        signal: controller.signal,
      });
      return this.parseResponse<T>(response);
    } finally {
      clearTimeout(timer);
    }
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          ...this.headers(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return this.parseResponse<T>(response);
    } finally {
      clearTimeout(timer);
    }
  }

  private async delete<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(`${this.baseUrl}${path}`, {
        method: 'DELETE',
        headers: this.headers(),
        signal: controller.signal,
      });
      return this.parseResponse<T>(response);
    } finally {
      clearTimeout(timer);
    }
  }

  private headers(): Record<string, string> {
    if (!this.apiKey) return {};
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    const text = await response.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new MeridianClientError(
        `Invalid JSON response (${response.status})`,
        response.status,
      );
    }

    if (!response.ok) {
      const err = data as Partial<MeridianError>;
      throw new MeridianClientError(
        err.error ?? `Request failed with status ${response.status}`,
        response.status,
        err.code,
        err.hint,
        err.layer,
      );
    }

    return data as T;
  }
}

export class MeridianClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly hint?: string,
    readonly layer?: string,
  ) {
    super(message);
    this.name = 'MeridianClientError';
  }
}

export type { AnalyzeDiffRequest, AnalyzeDiffResponse, AnalyzeRequest, AnalyzeResponse, StructuredAnalyzeResponse };
