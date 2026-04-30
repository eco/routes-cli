export type Vm = 'evm' | 'svm';

export interface Scenario {
  id: string;
  name: string;
  srcVm: Vm;
  dstVm: Vm;
  srcChain: number;
  dstChain: number;
  srcToken: string;
  dstToken: string;
  srcSymbol: string;
  dstSymbol: string;
  srcDecimals: number;
  dstDecimals: number;
  defaultAmount: bigint;
}

export const SOLANA_CHAIN = 1399811149;

const TOKENS = {
  ETH_NATIVE: '0x0000000000000000000000000000000000000000',
  USDC_BASE: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  USDC_ARB: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  ARB_ARB: '0x912CE59144191C1204E64559FE8253a0e49E6548',
  USDC_SOL: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  // Native SOL sentinel = Solana System Program ID (32 zero bytes). Used as
  // SOURCE for SVM-source rows: magenta accepts it as the native-SOL marker
  // and routes-cli's `fund` flow (commit a872eff) routes lamports via
  // system_program. Cannot be used as DESTINATION — magenta validates dst
  // SPL mints and the System Program isn't a mint.
  SOL_NATIVE: '11111111111111111111111111111111',
  // Wrapped SOL SPL mint. Used as DESTINATION for EVM→SVM rows where the
  // destination token is "SOL" — magenta resolves this to native SOL on the
  // dest side via Jupiter unwrap.
  WSOL_MINT: 'So11111111111111111111111111111111111111112',
} as const;

// Cheap-test defaults. SOL is sized above magenta's ~$2.30 protocol-fee floor
// (probed: 11.6M lamports rejected, 11.7M passes — using 12M for a small margin).
const AMT = {
  ETH_DEFAULT: 300_000_000_000_000n, // 0.0003 ETH (~$1 at $3,300/ETH)
  USDC_DEFAULT: 1_000_000n, // 1 USDC
  SOL_DEFAULT: 12_000_000n, // 0.012 SOL (~$2.40 at $200/SOL)
} as const;

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'SS-1',
    name: 'EVM any → EVM stable',
    srcVm: 'evm',
    dstVm: 'evm',
    srcChain: 8453,
    dstChain: 42161,
    srcToken: TOKENS.ETH_NATIVE,
    dstToken: TOKENS.USDC_ARB,
    srcSymbol: 'ETH',
    dstSymbol: 'USDC',
    srcDecimals: 18,
    dstDecimals: 6,
    defaultAmount: AMT.ETH_DEFAULT,
  },
  {
    id: 'SS-2',
    name: 'EVM any → SVM stable',
    srcVm: 'evm',
    dstVm: 'svm',
    srcChain: 8453,
    dstChain: SOLANA_CHAIN,
    srcToken: TOKENS.ETH_NATIVE,
    dstToken: TOKENS.USDC_SOL,
    srcSymbol: 'ETH',
    dstSymbol: 'USDC',
    srcDecimals: 18,
    dstDecimals: 6,
    defaultAmount: AMT.ETH_DEFAULT,
  },
  {
    id: 'SS-3',
    name: 'EVM stable → EVM any',
    srcVm: 'evm',
    dstVm: 'evm',
    srcChain: 8453,
    dstChain: 42161,
    srcToken: TOKENS.USDC_BASE,
    dstToken: TOKENS.ETH_NATIVE,
    srcSymbol: 'USDC',
    dstSymbol: 'ETH',
    srcDecimals: 6,
    dstDecimals: 18,
    defaultAmount: AMT.USDC_DEFAULT,
  },
  {
    id: 'SS-4',
    name: 'EVM stable → SVM any',
    srcVm: 'evm',
    dstVm: 'svm',
    srcChain: 8453,
    dstChain: SOLANA_CHAIN,
    srcToken: TOKENS.USDC_BASE,
    dstToken: TOKENS.WSOL_MINT,
    srcSymbol: 'USDC',
    dstSymbol: 'SOL',
    srcDecimals: 6,
    dstDecimals: 9,
    defaultAmount: AMT.USDC_DEFAULT,
  },
  {
    id: 'SS-5',
    name: 'EVM any → EVM any',
    srcVm: 'evm',
    dstVm: 'evm',
    srcChain: 8453,
    dstChain: 42161,
    srcToken: TOKENS.ETH_NATIVE,
    dstToken: TOKENS.ARB_ARB,
    srcSymbol: 'ETH',
    dstSymbol: 'ARB',
    srcDecimals: 18,
    dstDecimals: 18,
    defaultAmount: AMT.ETH_DEFAULT,
  },
  {
    id: 'SS-6',
    name: 'EVM any → SVM any',
    srcVm: 'evm',
    dstVm: 'svm',
    srcChain: 8453,
    dstChain: SOLANA_CHAIN,
    srcToken: TOKENS.ETH_NATIVE,
    dstToken: TOKENS.WSOL_MINT,
    srcSymbol: 'ETH',
    dstSymbol: 'SOL',
    srcDecimals: 18,
    dstDecimals: 9,
    defaultAmount: AMT.ETH_DEFAULT,
  },
  {
    id: 'SS-7',
    name: 'SVM any → EVM stable',
    srcVm: 'svm',
    dstVm: 'evm',
    srcChain: SOLANA_CHAIN,
    dstChain: 8453,
    srcToken: TOKENS.SOL_NATIVE,
    dstToken: TOKENS.USDC_BASE,
    srcSymbol: 'SOL',
    dstSymbol: 'USDC',
    srcDecimals: 9,
    dstDecimals: 6,
    defaultAmount: AMT.SOL_DEFAULT,
  },
  {
    id: 'SS-8',
    name: 'SVM any → EVM any',
    srcVm: 'svm',
    dstVm: 'evm',
    srcChain: SOLANA_CHAIN,
    dstChain: 8453,
    srcToken: TOKENS.SOL_NATIVE,
    dstToken: TOKENS.ETH_NATIVE,
    srcSymbol: 'SOL',
    dstSymbol: 'ETH',
    srcDecimals: 9,
    dstDecimals: 18,
    defaultAmount: AMT.SOL_DEFAULT,
  },
];

const ALL_IDS = new Set(SCENARIOS.map(s => s.id));

export interface FilterOptions {
  include?: string[];
  exclude?: string[];
}

export function filterScenarios(scenarios: readonly Scenario[], opts: FilterOptions): Scenario[] {
  const { include, exclude } = opts;
  for (const id of [...(include ?? []), ...(exclude ?? [])]) {
    if (!ALL_IDS.has(id)) {
      throw new Error(`unknown scenario id: ${id}`);
    }
  }
  let out = [...scenarios];
  if (include && include.length > 0) {
    const set = new Set(include);
    out = out.filter(s => set.has(s.id));
  }
  if (exclude && exclude.length > 0) {
    const set = new Set(exclude);
    out = out.filter(s => !set.has(s.id));
  }
  return out;
}

export function applyAmountOverrides(
  scenarios: readonly Scenario[],
  overrides: Record<string, bigint>
): Scenario[] {
  for (const id of Object.keys(overrides)) {
    if (!ALL_IDS.has(id)) {
      throw new Error(`unknown scenario id: ${id}`);
    }
  }
  return scenarios.map(s =>
    overrides[s.id] !== undefined ? { ...s, defaultAmount: overrides[s.id] } : s
  );
}
