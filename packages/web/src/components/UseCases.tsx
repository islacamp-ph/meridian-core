const audiences = [
  {
    title: 'DeFi & payments',
    description:
      'Swaps, remittances, and treasury moves that hop across multiple contracts — know the full path before funds leave the wallet.',
  },
  {
    title: 'Wallets & consumer apps',
    description:
      'Show users a plain verdict before they sign. No more failed transaction screens after they already approved.',
  },
  {
    title: 'Protocol & infra teams',
    description:
      'Ship contract upgrades and cross-protocol integrations with blast-radius visibility across your entire deployment.',
  },
] as const;

export function UseCases() {
  return (
    <section id="why" className="section section-bordered">
      <header className="section-header">
        <h2>Who it's for</h2>
        <p>
          Anyone moving real value on-chain who'd rather catch problems in
          preview than in production.
        </p>
      </header>

      <div className="use-case-grid">
        {audiences.map((item) => (
          <article className="use-case-card" key={item.title}>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
