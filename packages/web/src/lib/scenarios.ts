export interface Scenario {
  id: string;
  name: string;
  label: string;
  verdict: 'clear' | 'warn' | 'abort';
  confidence: number;
  blastRadius: number;
  contracts: number;
  recovery: string;
  brief: string;
}

export const scenarios: Scenario[] = [
  {
    id: 'governance',
    name: 'Executing a governance vote',
    label: 'timelock · treasury · token transfer',
    verdict: 'abort',
    confidence: 28,
    blastRadius: 82,
    contracts: 14,
    recovery: 'PARTIAL',
    brief:
      'Proposal passes simulation but timelock auth is missing. Treasury move would revert on-chain — 3 dependent protocols exposed.',
  },
  {
    id: 'subscription',
    name: 'Charging a monthly subscription',
    label: 'allowance · billing · merchant wallet',
    verdict: 'clear',
    confidence: 94,
    blastRadius: 4,
    contracts: 2,
    recovery: 'FULL',
    brief:
      'Allowance sufficient, billing contract state valid, single-hop transfer to merchant. Safe to process.',
  },
  {
    id: 'bridge',
    name: 'Depositing assets into a bridge',
    label: 'lock · mint · message relay',
    verdict: 'warn',
    confidence: 63,
    blastRadius: 61,
    contracts: 11,
    recovery: 'PARTIAL',
    brief:
      'Bridge path is live but relayer contract was upgraded 2 days ago. Confidence reduced — confirm compatibility before depositing.',
  },
  {
    id: 'listing',
    name: 'Publishing a marketplace listing',
    label: 'mint · escrow · royalty split',
    verdict: 'warn',
    confidence: 77,
    blastRadius: 22,
    contracts: 5,
    recovery: 'FULL',
    brief:
      'Listing creation succeeds but royalty routing touches a deprecated splitter. Works today — update reference before volume scales.',
  },
];

export const tickerItems = [
  'before you hit submit',
  'will this transaction break?',
  'who gets affected?',
  'simulate first',
  'map every contract',
  'score the blast radius',
  'CLEAR · WARN · ABORT',
  'pre-execution intelligence',
  'production is unforgiving',
  'know what crosses',
];

export const integrations = [
  {
    title: 'CI / GitHub Action',
    description:
      'Run meridian-action on every PR. Block merges on ABORT or WARN with verdict outputs in your workflow summary.',
    icon: '↻',
  },
  {
    title: 'CLI & SDKs',
    description:
      'meridian-core CLI, @meridian/stellar, and meridian-py — same pipeline from terminal, Node, or Python.',
    icon: '⌘',
  },
  {
    title: 'Wallet pre-sign flow',
    description:
      'Show users a CLEAR / WARN / ABORT badge before they approve — not after the transaction fails.',
    icon: '◎',
  },
  {
    title: 'Ecosystem manifests',
    description:
      'Enrich dependency mapping and blast-radius scoring with shared manifests from the community library.',
    icon: '▣',
  },
] as const;
