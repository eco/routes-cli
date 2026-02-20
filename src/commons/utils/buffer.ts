import { Hex } from 'viem';

export const toBuffer = (hex: Hex): Buffer => Buffer.from(hex.slice(2), 'hex');
