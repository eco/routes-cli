export type VMType = 'EVM' | 'TVM' | 'SVM';

export interface VMConfig {
  // EVM specific
  chainIdNumber?: number;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;

  // TVM specific
  fullNode?: string;
  solidityNode?: string;
  eventServer?: string;
  energyLimit?: number;

  // SVM specific
  commitment?: 'processed' | 'confirmed' | 'finalized';
  programId?: string;
}

export interface VMSpecificConfig {
  vmType: VMType;
  config: VMConfig;
}
