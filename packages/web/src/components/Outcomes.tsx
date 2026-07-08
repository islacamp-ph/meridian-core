import { outcomes } from '../lib/outcomes';

export function Outcomes() {
  return (
    <section id="outcomes" className="section">
      <header className="section-header">
        <h2>What you get back</h2>
        <p>
          One analysis returns everything your team needs to decide — no digging
          through RPC logs or simulation traces.
        </p>
      </header>

      <ul className="outcomes-list">
        {outcomes.map((item) => (
          <li key={item.title}>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
