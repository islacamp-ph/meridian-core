export const outcomes = [
  {
    title: 'A verdict you can act on',
    description: 'CLEAR, WARN, or ABORT — one signal for eng, ops, and whoever signs.',
  },
  {
    title: 'A brief, not a log dump',
    description: 'Plain-language summary of what fails, who is affected, and what to do next.',
  },
  {
    title: 'The full contract surface',
    description: 'Every dependency in the execution path — including contracts you never called directly.',
  },
  {
    title: 'Blast radius, scored',
    description: 'Downstream impact ranked so you know whether this is a local fix or a production incident.',
  },
  {
    title: 'TTL & archival checks',
    description: 'Footprint entries nearing expiry flagged before archived state causes an on-chain revert.',
  },
] as const;
