import { BorshCoder, Idl } from '@coral-xyz/anchor';

import { getPortalIdlByNetwork, Network } from '@/commons/idls/portal.idl';

export function getPortalBorshCoder(network: Network) {
  const idl = getPortalIdlByNetwork(network);
  return new BorshCoder(idl as unknown as Idl);
}

// keeping the original export for backward compatibility (defaults to mainnet)
export const portalBorshCoder = getPortalBorshCoder(Network.DEVNET);
