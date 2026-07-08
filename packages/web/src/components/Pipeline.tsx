import { pipelineLayers } from '../lib/developers';
import { DOCS_URL } from '../lib/constants';

export function Pipeline() {
  return (
    <section id="pipeline" className="section">
      <header className="section-header">
        <h2>How it works</h2>
        <p>
          One analysis call runs four intelligence layers before your transaction
          reaches the network.
        </p>
      </header>

      <ol className="pipeline-list">
        {pipelineLayers.map((layer, index) => (
          <li key={layer.name}>
            <span className="pipeline-step" aria-hidden="true">{index + 1}</span>
            <div>
              <h3>{layer.name}</h3>
              <p>{layer.description}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="pipeline-footnote">
        <a href={DOCS_URL}>Request early docs access →</a>
      </p>
    </section>
  );
}
