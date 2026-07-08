import { DOCS_URL } from '../lib/constants';
import { developerTools } from '../lib/developers';

export function DeveloperTools() {
  return (
    <section id="developers" className="section section-bordered">
      <header className="section-header">
        <h2>Developer access</h2>
        <p>
          CLI, SDKs, REST API, and a GitHub Action — pick the surface that fits your
          stack. All paths run the same TRACE → FIELD → GRAVITY → BRIEF pipeline.
        </p>
      </header>

      <div className="developer-grid">
        {developerTools.map((tool) => (
          <article className="developer-card" key={tool.id}>
            <div className="developer-card-head">
              <h3>{tool.name}</h3>
              <code className="developer-package">{tool.package}</code>
            </div>
            <p>{tool.description}</p>
            <pre className="developer-snippet"><code>{tool.example}</code></pre>
            <a className="developer-docs-link" href={DOCS_URL}>
              Join docs waitlist →
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
