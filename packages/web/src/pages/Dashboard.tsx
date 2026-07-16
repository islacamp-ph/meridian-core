import { FormEvent, useEffect, useState } from 'react';
import {
  createApiKey,
  fetchSession,
  listApiKeys,
  logout,
  revokeApiKey,
  type ApiKeySummary,
  type User,
} from '../lib/api';
import {
  DOCS_URL,
  GITHUB_REPO,
  INSTALL_CLI,
  NPM_CLI,
  NPM_SDK,
  PYPI_SDK,
} from '../lib/constants';

const API_BASE = import.meta.env.VITE_API_URL ?? 'https://api.meridian.dev';

type DashboardTab = 'overview' | 'api-keys' | 'integrations' | 'usage' | 'webhooks';

const ANALYZE_CURL = `curl -X POST ${API_BASE}/v1/analyze \\
  -H "Authorization: Bearer <your-api-key>" \\
  -H "Content-Type: application/json" \\
  -d '{"tx": "<base64-xdr>", "network": "testnet"}'`;

const JS_SDK_SNIPPET = `import { MeridianClient } from '@meridian/stellar';

const client = new MeridianClient({
  baseUrl: '${API_BASE}',
  apiKey: process.env.MERIDIAN_API_KEY,
});

const result = await client.analyze({
  tx: '<base64-xdr>',
  network: 'testnet',
});`;

const PY_SDK_SNIPPET = `from meridian import MeridianClient

client = MeridianClient(
    base_url="${API_BASE}",
    api_key=os.environ["MERIDIAN_API_KEY"],
)

result = client.analyze(tx="<base64-xdr>", network="testnet")`;

const GITHUB_ACTION_SNIPPET = `- name: MERIDIAN pre-execution check
  uses: ./packages/meridian-action
  with:
    tx-file: tx.xdr
    network: testnet
    ecosystem-manifest: manifest.json
    fail-on: ABORT
    api-url: ${API_BASE}
    api-key: \${{ secrets.MERIDIAN_API_KEY }}`;

const WEBHOOK_PAYLOAD_EXAMPLE = `{
  "event": "approval.required",
  "timestamp": "2026-07-08T12:00:00Z",
  "data": {
    "verdict": "WARN",
    "decision": "hold",
    "decision_reason": "Blast radius requires human approval",
    "confidence": 0.82,
    "blast_radius": 45,
    "approval_route": "human_approve",
    "network": "testnet"
  }
}`;

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  }

  return (
    <button type="button" className="btn btn-secondary compact dashboard-copy-btn" onClick={handleCopy}>
      {copied ? 'Copied' : label}
    </button>
  );
}

function IntegrationCard({
  title,
  description,
  code,
  links,
}: {
  title: string;
  description: string;
  code: string;
  links?: Array<{ href: string; label: string }>;
}) {
  return (
    <article className="dashboard-integration-card">
      <div className="dashboard-integration-card-head">
        <h3>{title}</h3>
        <CopyButton text={code} />
      </div>
      <p>{description}</p>
      <pre className="dashboard-code-block"><code>{code}</code></pre>
      {links && links.length > 0 && (
        <div className="dashboard-integration-links">
          {links.map((link) => (
            <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">
              {link.label}
            </a>
          ))}
        </div>
      )}
    </article>
  );
}

export function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [tab, setTab] = useState<DashboardTab>('overview');
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('Production');
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function load() {
      const session = await fetchSession();
      if (!session.authenticated || !session.user) {
        window.location.href = '/login';
        return;
      }
      setUser(session.user);
      try {
        const apiKeys = await listApiKeys();
        setKeys(apiKeys);
      } catch {
        setKeys([]);
      }
      setLoading(false);
    }
    void load();
  }, []);

  async function handleLogout() {
    await logout();
    window.location.href = '/';
  }

  async function handleCreateKey(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const key = await createApiKey(newKeyName);
      setCreatedSecret(key.secret);
      setKeys(await listApiKeys());
      setNewKeyName('Production');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create key');
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm('Revoke this API key? Applications using it will stop working.')) return;
    setBusy(true);
    try {
      await revokeApiKey(id);
      setKeys(await listApiKeys());
      if (createdSecret) setCreatedSecret(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke key');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="page dashboard-page">
        <p className="dashboard-loading">Loading dashboard…</p>
      </div>
    );
  }

  return (
    <div className="page dashboard-page">
      <header className="dashboard-topbar">
        <a href="/" className="brand">
          <span className="brand-name">MERIDIAN</span>
          <span className="brand-domain">dashboard</span>
        </a>
        <div className="dashboard-topbar-actions">
          <span className="dashboard-user">{user?.email}</span>
        </div>
      </header>

      <div className="dashboard-shell">
        <nav className="dashboard-nav" aria-label="Dashboard">
          <div className="dashboard-nav-items">
            <button
              type="button"
              className={tab === 'overview' ? 'active' : ''}
              onClick={() => setTab('overview')}
            >
              Overview
            </button>
            <button
              type="button"
              className={tab === 'api-keys' ? 'active' : ''}
              onClick={() => setTab('api-keys')}
            >
              API keys
            </button>
            <button
              type="button"
              className={tab === 'integrations' ? 'active' : ''}
              onClick={() => setTab('integrations')}
            >
              Integrations
            </button>
            <button
              type="button"
              className={tab === 'usage' ? 'active' : ''}
              onClick={() => setTab('usage')}
            >
              Usage
            </button>
            <button
              type="button"
              className={tab === 'webhooks' ? 'active' : ''}
              onClick={() => setTab('webhooks')}
            >
              Webhooks
              <span className="dashboard-badge">Soon</span>
            </button>
          </div>
          <div className="dashboard-nav-footer">
            <a className="dashboard-nav-link" href={DOCS_URL}>
              Docs
            </a>
            <button type="button" className="dashboard-nav-link danger" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </nav>

        <main className="dashboard-main">
          {error && <p className="dashboard-error" role="alert">{error}</p>}

          {tab === 'overview' && (
            <section>
              <h1>Welcome{user?.name ? `, ${user.name}` : ''}</h1>
              <p className="dashboard-lead">
                Your MERIDIAN developer account is on the <strong>Early Beta</strong> plan.
                Generate API keys, then connect via the REST API, CLI, or SDKs.
              </p>
              <div className="dashboard-stat-grid">
                <article className="dashboard-stat">
                  <strong>{keys.length}</strong>
                  <span>API keys</span>
                </article>
                <article className="dashboard-stat">
                  <strong>Beta</strong>
                  <span>Plan</span>
                </article>
                <article className="dashboard-stat">
                  <strong>4</strong>
                  <span>Pipeline layers</span>
                </article>
              </div>
              <div className="dashboard-quick-actions">
                <button type="button" className="btn btn-primary" onClick={() => setTab('api-keys')}>
                  Generate API key
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setTab('integrations')}>
                  View integrations
                </button>
              </div>
            </section>
          )}

          {tab === 'api-keys' && (
            <section>
              <h1>API keys</h1>
              <p className="dashboard-lead">
                Use keys with the MERIDIAN REST API. Pass as{' '}
                <code>Authorization: Bearer &lt;key&gt;</code> or{' '}
                <code>X-Api-Key: &lt;key&gt;</code>.
              </p>

              {createdSecret && (
                <div className="dashboard-secret-banner" role="status">
                  <strong>Copy your new API key now</strong>
                  <p>It won&apos;t be shown again.</p>
                  <code className="dashboard-secret-value">{createdSecret}</code>
                  <button
                    type="button"
                    className="btn btn-secondary compact"
                    onClick={() => navigator.clipboard.writeText(createdSecret)}
                  >
                    Copy
                  </button>
                </div>
              )}

              <form className="dashboard-key-form" onSubmit={handleCreateKey}>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="Key name"
                  disabled={busy}
                />
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'Creating…' : 'Generate key'}
                </button>
              </form>

              {keys.length === 0 ? (
                <p className="dashboard-empty">No API keys yet. Generate one to get started.</p>
              ) : (
                <div className="dashboard-table-wrap">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Prefix</th>
                        <th>Created</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {keys.map((key) => (
                        <tr key={key.id}>
                          <td>{key.name}</td>
                          <td><code>{key.prefix}…</code></td>
                          <td>{new Date(key.createdAt).toLocaleDateString()}</td>
                          <td>
                            <button
                              type="button"
                              className="btn-link danger"
                              onClick={() => handleRevoke(key.id)}
                              disabled={busy}
                            >
                              Revoke
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {tab === 'integrations' && (
            <section>
              <h1>Integrations</h1>
              <p className="dashboard-lead">
                Connect MERIDIAN to your stack — REST API, CLI, SDKs, and CI. Copy snippets below
                and replace <code>&lt;your-api-key&gt;</code> with a key from the API keys tab.
              </p>
              <div className="dashboard-integration-grid">
                <IntegrationCard
                  title="REST API"
                  description="Hosted analyze endpoint — TRACE, FIELD, GRAVITY, and optional BRIEF."
                  code={ANALYZE_CURL}
                  links={[{ href: `${API_BASE}/v1/openapi.json`, label: 'OpenAPI spec' }]}
                />
                <IntegrationCard
                  title="CLI"
                  description="Run analysis locally or in scripts without the hosted API."
                  code={INSTALL_CLI}
                  links={[
                    { href: NPM_CLI, label: 'npm' },
                    { href: GITHUB_REPO, label: 'GitHub' },
                  ]}
                />
                <IntegrationCard
                  title="JavaScript SDK"
                  description="TypeScript client for @meridian/stellar with typed request/response."
                  code={JS_SDK_SNIPPET}
                  links={[{ href: NPM_SDK, label: 'npm' }]}
                />
                <IntegrationCard
                  title="Python SDK"
                  description="httpx-based client for meridian-py pipelines and automation."
                  code={PY_SDK_SNIPPET}
                  links={[{ href: PYPI_SDK, label: 'PyPI' }]}
                />
                <IntegrationCard
                  title="GitHub Action"
                  description="Fail CI on WARN or ABORT before a Soroban transaction ships."
                  code={GITHUB_ACTION_SNIPPET}
                  links={[{ href: `${GITHUB_REPO}/tree/main/packages/meridian-action`, label: 'Action source' }]}
                />
                <article className="dashboard-integration-card">
                  <h3>Quick reference</h3>
                  <p>API base URL and repository links.</p>
                  <ul className="dashboard-quick-ref">
                    <li>
                      <span>API base URL</span>
                      <code>{API_BASE}</code>
                    </li>
                    <li>
                      <span>Repository</span>
                      <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer">{GITHUB_REPO}</a>
                    </li>
                    <li>
                      <span>Manifests</span>
                      <a href={`${GITHUB_REPO}/tree/main/manifests`} target="_blank" rel="noopener noreferrer">
                        ScholarSeal &amp; community manifests
                      </a>
                    </li>
                  </ul>
                </article>
              </div>
            </section>
          )}

          {tab === 'usage' && (
            <section>
              <h1>Usage</h1>
              <p className="dashboard-lead">
                Request analytics will appear here as the hosted API rolls out to beta users.
              </p>
              <div className="dashboard-stat-grid">
                <article className="dashboard-stat muted">
                  <strong>—</strong>
                  <span>Requests (30d)</span>
                </article>
                <article className="dashboard-stat muted">
                  <strong>—</strong>
                  <span>Analyze calls</span>
                </article>
                <article className="dashboard-stat muted">
                  <strong>—</strong>
                  <span>Batch jobs</span>
                </article>
              </div>
            </section>
          )}

          {tab === 'webhooks' && (
            <section>
              <div className="dashboard-section-head">
                <h1>Webhooks</h1>
                <span className="dashboard-badge dashboard-badge-lg">Live</span>
              </div>
              <p className="dashboard-lead">
                Push MERIDIAN verdicts to Slack, CI, treasury dashboards, and signer approval flows.
                Register destinations via <code>POST /v1/webhooks</code> (or seed with{' '}
                <code>MERIDIAN_WEBHOOK_URLS</code>).
              </p>

              <div className="dashboard-coming-soon-panel">
                <h2>Events</h2>
                <ul className="dashboard-event-list">
                  <li><code>analysis.completed</code> — verdict, confidence, blast radius, decision</li>
                  <li><code>analysis.failed</code> — simulation or pipeline errors</li>
                  <li><code>risk.elevated</code> — WARN or ABORT</li>
                  <li><code>approval.required</code> — hold / rewrite / policy WARN (treasury routing)</li>
                  <li><code>batch.completed</code> — CI batch summary</li>
                </ul>

                <h2>Register</h2>
                <div className="dashboard-code-toolbar">
                  <CopyButton text={`curl -X POST $API_BASE/v1/webhooks \\
  -H "Authorization: Bearer $MERIDIAN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://hooks.example.com/meridian",
    "events": ["approval.required", "risk.elevated", "analysis.completed"],
    "label": "treasury-ops"
  }'`} />
                </div>
                <pre className="dashboard-code-block"><code>{`curl -X POST $API_BASE/v1/webhooks \\
  -H "Authorization: Bearer $MERIDIAN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://hooks.example.com/meridian",
    "events": ["approval.required", "risk.elevated", "analysis.completed"],
    "label": "treasury-ops"
  }'`}</code></pre>

                <h2>Example payload</h2>
                <div className="dashboard-code-toolbar">
                  <CopyButton text={WEBHOOK_PAYLOAD_EXAMPLE} />
                </div>
                <pre className="dashboard-code-block"><code>{WEBHOOK_PAYLOAD_EXAMPLE}</code></pre>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
