import { DOCS_URL, GITHUB_REPO, INSTALL_CLI } from '../lib/constants';

export function Footer() {
  return (
    <footer className="site-footer">
      <p className="footer-left">
        <strong>MERIDIAN</strong> · Pre-execution intelligence for Stellar developers
      </p>
      <div className="footer-links">
        <a href={DOCS_URL}>Docs</a>
        <a href={DOCS_URL}>Early access</a>
        <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer">GitHub</a>
        <a href="mailto:hello@meridian.dev">Contact</a>
      </div>
      <p className="footer-install">
        <code>{INSTALL_CLI}</code>
      </p>
    </footer>
  );
}
