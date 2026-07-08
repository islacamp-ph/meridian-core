import { tickerItems } from '../lib/scenarios';

export function Ticker() {
  const items = [...tickerItems, ...tickerItems];

  return (
    <div className="ticker" aria-hidden="true">
      <div className="ticker-track">
        {items.map((item, i) => (
          <span className="ticker-item" key={`${item}-${i}`}>
            {item}
            <span className="ticker-dot">·</span>
          </span>
        ))}
      </div>
    </div>
  );
}
