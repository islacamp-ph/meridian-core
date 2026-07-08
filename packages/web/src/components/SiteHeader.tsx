import { useEffect, useState } from 'react';
import { DOCS_URL, GITHUB_REPO } from '../lib/constants';

export interface NavLink {
  href: string;
  label: string;
  external?: boolean;
}

interface SiteHeaderProps {
  links?: NavLink[];
  showSignIn?: boolean;
  showGithub?: boolean;
  ctaHref?: string;
  ctaLabel?: string;
}

const DEFAULT_LINKS: NavLink[] = [
  { href: DOCS_URL, label: 'Docs' },
  { href: '#developers', label: 'Developers' },
  { href: '#pipeline', label: 'Pipeline' },
  { href: '#outcomes', label: 'What you get' },
  { href: '#integrations', label: 'Integrations' },
];

export function SiteHeader({
  links = DEFAULT_LINKS,
  showSignIn = true,
  showGithub = true,
  ctaHref = DOCS_URL,
  ctaLabel = 'Get started',
}: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.body.classList.toggle('nav-open', menuOpen);
    return () => document.body.classList.remove('nav-open');
  }, [menuOpen]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 800) setMenuOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <header className="site-header">
      <a href="/" className="brand" onClick={closeMenu}>
        <span className="brand-name">MERIDIAN</span>
        <span className="brand-domain">meridian.dev</span>
      </a>

      <button
        type="button"
        className="nav-toggle"
        aria-expanded={menuOpen}
        aria-controls="site-nav-panel"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span className="sr-only">{menuOpen ? 'Close menu' : 'Open menu'}</span>
        <span className="nav-toggle-bar" aria-hidden="true" />
        <span className="nav-toggle-bar" aria-hidden="true" />
        <span className="nav-toggle-bar" aria-hidden="true" />
      </button>

      <div
        id="site-nav-panel"
        className={`site-nav-panel ${menuOpen ? 'site-nav-panel-open' : ''}`}
      >
        <nav className="site-nav" aria-label="Main navigation">
          {links.map((link) => (
            <a
              key={link.href + link.label}
              href={link.href}
              target={link.external ? '_blank' : undefined}
              rel={link.external ? 'noopener noreferrer' : undefined}
              onClick={closeMenu}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="header-actions">
          {showSignIn && (
            <a className="link-button" href="/login" onClick={closeMenu}>
              Sign in
            </a>
          )}
          {showGithub && (
            <a
              className="link-button"
              href={GITHUB_REPO}
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          )}
          <a className="btn btn-primary compact" href={ctaHref} onClick={closeMenu}>
            {ctaLabel}
          </a>
        </div>
      </div>

      {menuOpen && (
        <button
          type="button"
          className="nav-backdrop"
          aria-label="Close menu"
          onClick={closeMenu}
        />
      )}
    </header>
  );
}
