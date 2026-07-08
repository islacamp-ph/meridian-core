import { DOCS_URL, GITHUB_REPO } from '../lib/constants';

export function Cta() {
  return (
    <section id="contact" className="section section-bordered cta-section">
      <div className="cta-inner">
        <h2>Start analyzing before you submit</h2>
        <p>
          Join the docs waitlist for early beta access, or install the CLI and
          follow development on GitHub.
        </p>
        <div className="cta-actions">
          <a className="btn btn-primary" href={DOCS_URL}>
            Request docs access
          </a>
          <a
            className="btn btn-secondary"
            href={GITHUB_REPO}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
