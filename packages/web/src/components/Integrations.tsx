import { integrations } from '../lib/scenarios';

export function Integrations() {
  return (
    <section id="integrations" className="section section-bordered">
      <header className="section-header">
        <h2>Fits into how you already work</h2>
        <p>
          MERIDIAN is a layer you add before submit — in your pipeline, your
          wallet, or your ops stack. Not another dashboard to babysit.
        </p>
      </header>

      <div className="integration-grid">
        {integrations.map((item) => (
          <article className="integration-card" key={item.title}>
            <span className="integration-icon" aria-hidden="true">{item.icon}</span>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
