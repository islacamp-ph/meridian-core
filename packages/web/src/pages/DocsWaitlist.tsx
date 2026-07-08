import { FormEvent, useState } from 'react';
import { SiteHeader } from '../components/SiteHeader';
import { GITHUB_REPO } from '../lib/constants';

type FormState = 'idle' | 'submitting' | 'success' | 'error';

export function DocsWaitlist() {
  const [email, setEmail] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [state, setState] = useState<FormState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setState('submitting');

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'docs-waitlist' }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Something went wrong. Please try again.',
        );
      }

      setSubmittedEmail(email);
      setEmail('');
      setState('success');
    } catch (err) {
      setState('error');
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <div className="page docs-waitlist-page">
      <SiteHeader
        links={[
          { href: '/', label: 'Home' },
          { href: GITHUB_REPO, label: 'GitHub', external: true },
        ]}
        showSignIn
        showGithub={false}
        ctaHref="/login"
        ctaLabel="Sign in"
      />

      <main className="docs-waitlist-main">
        <div className="docs-waitlist-card">
          <p className="docs-waitlist-badge">Coming soon</p>
          <h1>Documentation is on the way</h1>
          <p className="docs-waitlist-lead">
            Full guides for the CLI, SDKs, REST API, GitHub Action, and ecosystem
            manifests are in early beta. Join the waitlist and we&apos;ll email you
            when docs access opens.
          </p>

          {state === 'success' ? (
            <div className="docs-waitlist-success" role="status">
              <strong>You&apos;re on the list.</strong>
              <p>
                We&apos;ll email you at <code>{submittedEmail}</code> when early beta docs are ready.
              </p>
              <a href="/" className="btn btn-secondary">Back to home</a>
            </div>
          ) : (
            <form className="docs-waitlist-form" onSubmit={handleSubmit}>
              <label htmlFor="waitlist-email" className="sr-only">Email address</label>
              <div className="docs-waitlist-fields">
                <input
                  id="waitlist-email"
                  type="email"
                  name="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  disabled={state === 'submitting'}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={state === 'submitting'}
                >
                  {state === 'submitting' ? 'Joining…' : 'Request early access'}
                </button>
              </div>
              {state === 'error' && errorMessage && (
                <p className="docs-waitlist-error" role="alert">{errorMessage}</p>
              )}
              <p className="docs-waitlist-note">
                No spam. One email when docs beta opens. Install the CLI today:{' '}
                <code>npm install -g meridian-core</code>
              </p>
            </form>
          )}

          <ul className="docs-waitlist-preview">
            <li>Quickstart &amp; verdict semantics</li>
            <li>CLI, REST API &amp; SDK reference</li>
            <li>GitHub Action &amp; ecosystem manifests</li>
            <li>TTL, auth modes &amp; architecture</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
