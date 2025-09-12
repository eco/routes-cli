import { BorshCoder, Idl } from '@coral-xyz/anchor';

import { portalIdl } from '@/commons/idls/portal.idl';

export const portalBorshCoder = new BorshCoder<string, (typeof portalIdl)['types'][number]['name']>(
  portalIdl as unknown as Idl
);
