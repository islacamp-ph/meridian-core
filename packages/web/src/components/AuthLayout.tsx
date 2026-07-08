import type { ReactNode } from 'react';
import { SiteHeader } from './SiteHeader';

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="page auth-page">
      <SiteHeader
        links={[
          { href: '/', label: 'Home' },
          { href: '/docs', label: 'Docs' },
        ]}
        showSignIn={false}
        showGithub={false}
        ctaHref="/register"
        ctaLabel="Create account"
      />

      <main className="auth-main">
        <div className="auth-card">
          <h1>{title}</h1>
          <p className="auth-subtitle">{subtitle}</p>
          {children}
        </div>
      </main>
    </div>
  );
}
