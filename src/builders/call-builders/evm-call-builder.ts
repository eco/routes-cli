import { Intent } from '@/core/interfaces/intent';
import { encodeFunctionData, erc20Abi } from 'viem';
import { AddressNormalizer } from '@/core/utils/address-normalizer';
import { UniversalAddress } from '@/core/types/universal-address';

export function evmCallsBuilder(
  route: Intent['route'],
  recipient: UniversalAddress
): Intent['route']['calls'] {
  const { token, amount } = route.tokens[0];
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [AddressNormalizer.denormalizeToEvm(recipient), amount],
  });

  return [{ target: token, data, value: 0n }];
}
