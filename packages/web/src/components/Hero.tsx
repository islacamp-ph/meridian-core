import { useEffect, useState } from 'react';
import { scenarios, type Scenario } from '../lib/scenarios';
import { DOCS_URL, GITHUB_REPO } from '../lib/constants';

const CYCLE_MS = 5000;

export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-heading">
      <div className="hero-main">
        <p className="hero-label">Pre-execution intelligence for Stellar developers</p>

        <h1 id="hero-heading">
          Know what crosses before it does.
        </h1>

        <p className="hero-lead">
          MERIDIAN sits between your application and the chain. Before any
          transaction submits, it simulates the full execution path, maps every
          contract downstream, checks TTL and archival risk, scores blast radius,
          and returns a plain-language brief — via CLI, SDK, API, or GitHub Action.
        </p>

        <div className="hero-actions">
          <a className="btn btn-primary" href={DOCS_URL}>
            Request docs access
          </a>
          <a className="btn btn-secondary" href="#developers">Developer tools</a>
          <a
            className="btn btn-secondary"
            href={GITHUB_REPO}
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </div>

        <p className="hero-note">
          <code>npm install -g meridian-core</code>
        </p>
      </div>

      <HeroPanel />
    </section>
  );
}

function HeroPanel() {
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);
  const scenario = scenarios[index];

  useEffect(() => {
    const interval = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setIndex((i) => (i + 1) % scenarios.length);
        setFading(false);
      }, 350);
    }, CYCLE_MS);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="hero-panel-wrap">
      <ScenarioOutput scenario={scenario} fading={fading} />
      <div className="hero-dots" role="tablist" aria-label="Example transactions">
        {scenarios.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={s.name}
            className={`hero-dot ${i === index ? 'hero-dot-active' : ''}`}
            onClick={() => {
              setFading(true);
              setTimeout(() => {
                setIndex(i);
                setFading(false);
              }, 200);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ScenarioOutput({ scenario, fading }: { scenario: Scenario; fading: boolean }) {
  return (
    <aside
      className={`hero-output ${fading ? 'hero-output-fade' : ''}`}
      aria-label="Sample analysis output"
      aria-live="polite"
    >
      <div className="output-bar">
        <span className="output-title">analysis result</span>
        <span className="output-meta">{scenario.label}</span>
      </div>
      <p className="output-scenario-name">{scenario.name}</p>
      <dl className="output-fields">
        <div className="output-row">
          <dt>verdict</dt>
          <dd><span className={`tag tag-${scenario.verdict}`}>{scenario.verdict.toUpperCase()}</span></dd>
        </div>
        <div className="output-row">
          <dt>confidence</dt>
          <dd>{scenario.confidence}%</dd>
        </div>
        <div className="output-row">
          <dt>blast_radius</dt>
          <dd>{scenario.blastRadius}</dd>
        </div>
        <div className="output-row">
          <dt>contracts</dt>
          <dd>{scenario.contracts}</dd>
        </div>
        <div className="output-row">
          <dt>recovery</dt>
          <dd>{scenario.recovery}</dd>
        </div>
      </dl>
      <div className="output-brief">
        <p className="output-brief-label">brief</p>
        <p className="output-brief-text">{scenario.brief}</p>
      </div>
    </aside>
  );
}
