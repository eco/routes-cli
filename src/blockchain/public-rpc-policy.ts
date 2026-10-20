// Shared by the CLI and standalone examples, without Nest or chain-catalog
// dependencies. Regression tests require every catalog public URL to be denied.
const PUBLIC_RPC_HOSTS = new Set([
  'ethereum-rpc.publicnode.com',
  'mainnet.optimism.io',
  'mainnet.base.org',
  'arb1.arbitrum.io',
  'polygon.drpc.org',
  'api.roninchain.com',
  'rpc.hyperliquid.xyz',
  'mainnet.unichain.org',
  'rpc.plasma.to',
  'rpc.mainnet.arc.io',
  'sepolia.base.org',
  'rpc.testnet.arc.network',
  'sepolia.optimism.io',
  'rpc.testnet.plasm.technology',
  'rpc.sepolia.org',
  'api.trongrid.io',
  'api.shasta.trongrid.io',
  'api.mainnet-beta.solana.com',
  'api.devnet.solana.com',
  'solana.publicnode.com',
  'tron.publicnode.com',
]);

export function isPublicRpcEndpoint(url: URL): boolean {
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  // This provider serves both the public /public route and keyed endpoints.
  // Reject the former without blocking a configured dedicated API key.
  if (hostname === 'worldchain-mainnet.g.alchemy.com') {
    try {
      return !/^\/v2\/(?!demo(?:\/|$)|public(?:\/|$))[^/]+\/?$/i.test(
        decodeURIComponent(url.pathname)
      );
    } catch {
      return true;
    }
  }
  return PUBLIC_RPC_HOSTS.has(hostname);
}
