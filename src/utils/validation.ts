import Joi from 'joi';
import { VMType, ChainConfig, TokenEntry, IntentCreationParams } from '../types/index.js';
import { AddressManager } from './AddressManager.js';

// Address validation schemas for different VM types
const evmAddressSchema = Joi.string()
  .pattern(/^0x[a-fA-F0-9]{40}$/)
  .required()
  .messages({
    'string.pattern.base':
      'EVM address must be a valid 40-character hexadecimal string starting with 0x',
  });

const tvmAddressSchema = Joi.string()
  .pattern(/^T[1-9A-HJ-NP-Za-km-z]{33}$/)
  .required()
  .messages({
    'string.pattern.base': 'TVM address must be a valid 34-character base58 string starting with T',
  });

const svmAddressSchema = Joi.string()
  .pattern(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
  .required()
  .messages({
    'string.pattern.base': 'SVM address must be a valid 32-44 character base58 string',
  });

// VM type schema
const vmTypeSchema = Joi.string().valid('EVM', 'TVM', 'SVM').required().messages({
  'any.only': 'VM type must be one of: EVM, TVM, SVM',
});

// Chain configuration schema
const chainConfigSchema = Joi.object({
  chainId: Joi.alternatives().try(Joi.number().positive(), Joi.string().min(1)).required(),
  name: Joi.string().min(1).max(50).required(),
  vmType: vmTypeSchema,
  rpcUrl: Joi.string().uri().required(),
  portalAddress: Joi.string().required(),
  blockExplorer: Joi.string().uri().optional(),
  nativeCurrency: Joi.object({
    name: Joi.string().required(),
    symbol: Joi.string().min(1).max(10).required(),
    decimals: Joi.number().integer().min(0).max(30).required(),
  }).required(),
  vmConfig: Joi.object().optional(),
});

// Token entry schema
const tokenEntrySchema = Joi.object({
  symbol: Joi.string().min(1).max(20).required(),
  name: Joi.string().min(1).max(100).required(),
  chainId: Joi.alternatives().try(Joi.number().positive(), Joi.string().min(1)).required(),
  chainName: Joi.string().min(1).max(50).required(),
  vmType: vmTypeSchema,
  address: Joi.string().required(),
  decimals: Joi.number().integer().min(0).max(30).required(),
  logoURI: Joi.string().uri().optional(),
  coingeckoId: Joi.string().optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  verified: Joi.boolean().optional(),
});

// Intent creation parameters schema
const intentCreationParamsSchema = Joi.object({
  sourceChain: chainConfigSchema.required(),
  destinationChain: chainConfigSchema.required(),
  routeToken: Joi.object({
    address: Joi.string().required(),
    amount: Joi.alternatives()
      .try(
        Joi.string().pattern(/^\d+$/),
        Joi.custom((value) => {
          if (typeof value === 'bigint') return value;
          throw new Error('Amount must be a bigint or numeric string');
        })
      )
      .required(),
    decimals: Joi.number().integer().min(0).max(30).required(),
    symbol: Joi.string().required(),
    vmType: vmTypeSchema,
    chainId: Joi.alternatives().try(Joi.number().positive(), Joi.string().min(1)).required(),
  }).required(),
  rewardToken: Joi.object({
    address: Joi.string().required(),
    amount: Joi.alternatives()
      .try(
        Joi.string().pattern(/^\d+$/),
        Joi.custom((value) => {
          if (typeof value === 'bigint') return value;
          throw new Error('Amount must be a bigint or numeric string');
        })
      )
      .required(),
    decimals: Joi.number().integer().min(0).max(30).required(),
    symbol: Joi.string().required(),
    vmType: vmTypeSchema,
    chainId: Joi.alternatives().try(Joi.number().positive(), Joi.string().min(1)).required(),
  }).required(),
  recipient: Joi.string().required(),
  deadlines: Joi.object({
    route: Joi.number()
      .positive()
      .max(24 * 30)
      .required(), // Max 30 days
    refund: Joi.number()
      .positive()
      .max(24 * 90)
      .required(), // Max 90 days
  }).required(),
});

export class ValidationService {
  private addressManager: AddressManager;

  constructor() {
    this.addressManager = new AddressManager();
  }

  // Validate address for specific VM type
  validateAddress(address: string, vmType: VMType): ValidationResult {
    try {
      const schema = this.getAddressSchema(vmType);
      const { error } = schema.validate(address);

      if (error) {
        return {
          valid: false,
          error: error.details[0].message,
        };
      }

      // Additional validation using AddressManager
      const isValid = this.addressManager.validateAddress(address, vmType);
      if (!isValid) {
        return {
          valid: false,
          error: `Invalid ${vmType} address format`,
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error',
      };
    }
  }

  private getAddressSchema(vmType: VMType): Joi.Schema {
    switch (vmType) {
      case 'EVM':
        return evmAddressSchema;
      case 'TVM':
        return tvmAddressSchema;
      case 'SVM':
        return svmAddressSchema;
      default:
        throw new Error(`Unsupported VM type: ${vmType}`);
    }
  }

  // Validate chain configuration
  validateChainConfig(config: ChainConfig): ValidationResult {
    try {
      const { error } = chainConfigSchema.validate(config);

      if (error) {
        return {
          valid: false,
          error: error.details[0].message,
        };
      }

      // Validate portal address format matches VM type
      const addressValidation = this.validateAddress(config.portalAddress, config.vmType);
      if (!addressValidation.valid) {
        return {
          valid: false,
          error: `Portal address validation failed: ${addressValidation.error}`,
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error',
      };
    }
  }

  // Validate token entry
  validateTokenEntry(token: TokenEntry): ValidationResult {
    try {
      const { error } = tokenEntrySchema.validate(token);

      if (error) {
        return {
          valid: false,
          error: error.details[0].message,
        };
      }

      // Validate token address format matches VM type
      const addressValidation = this.validateAddress(token.address, token.vmType);
      if (!addressValidation.valid) {
        return {
          valid: false,
          error: `Token address validation failed: ${addressValidation.error}`,
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error',
      };
    }
  }

  // Validate intent creation parameters
  validateIntentCreationParams(params: IntentCreationParams): ValidationResult {
    try {
      const { error } = intentCreationParamsSchema.validate(params);

      if (error) {
        return {
          valid: false,
          error: error.details[0].message,
        };
      }

      // Additional business logic validation

      // Validate source and destination chains are different
      if (params.sourceChain.chainId === params.destinationChain.chainId) {
        return {
          valid: false,
          error: 'Source and destination chains must be different',
        };
      }

      // Validate recipient address matches destination chain VM type
      const recipientValidation = this.validateAddress(
        params.recipient,
        params.destinationChain.vmType
      );
      if (!recipientValidation.valid) {
        return {
          valid: false,
          error: `Recipient address validation failed: ${recipientValidation.error}`,
        };
      }

      // Validate token addresses match their respective chain VM types
      const routeTokenValidation = this.validateAddress(
        params.routeToken.address,
        params.destinationChain.vmType
      );
      if (!routeTokenValidation.valid) {
        return {
          valid: false,
          error: `Route token address validation failed: ${routeTokenValidation.error}`,
        };
      }

      const rewardTokenValidation = this.validateAddress(
        params.rewardToken.address,
        params.sourceChain.vmType
      );
      if (!rewardTokenValidation.valid) {
        return {
          valid: false,
          error: `Reward token address validation failed: ${rewardTokenValidation.error}`,
        };
      }

      // Validate deadline logic
      if (params.deadlines.refund < params.deadlines.route) {
        return {
          valid: false,
          error: 'Refund deadline must be longer than route deadline',
        };
      }

      // Validate token amounts are positive
      if (params.routeToken.amount <= 0n) {
        return {
          valid: false,
          error: 'Route token amount must be positive',
        };
      }

      if (params.rewardToken.amount <= 0n) {
        return {
          valid: false,
          error: 'Reward token amount must be positive',
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error',
      };
    }
  }

  // Validate private key format for VM type
  validatePrivateKey(privateKey: string, vmType: VMType): ValidationResult {
    try {
      switch (vmType) {
        case 'EVM':
          if (!/^0x[a-f0-9]{64}$/i.test(privateKey)) {
            return {
              valid: false,
              error: 'EVM private key must be 64 hex characters with 0x prefix',
            };
          }
          break;
        case 'TVM':
          const cleanKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
          if (!/^[a-f0-9]{64}$/i.test(cleanKey)) {
            return {
              valid: false,
              error: 'TVM private key must be 64 hex characters',
            };
          }
          break;
        case 'SVM':
          if (privateKey.length < 32) {
            return {
              valid: false,
              error: 'SVM private key must be at least 32 characters',
            };
          }
          break;
        default:
          return {
            valid: false,
            error: `Unknown VM type: ${vmType}`,
          };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error',
      };
    }
  }

  // Validate token amount string
  validateTokenAmount(amount: string, decimals: number): ValidationResult {
    try {
      // Check if amount is a valid number string
      if (!/^\d+(\.\d+)?$/.test(amount)) {
        return {
          valid: false,
          error: 'Amount must be a valid number',
        };
      }

      const [whole, fractional = ''] = amount.split('.');

      // Check for leading zeros (except for "0" or "0.x")
      if (whole !== '0' && whole.startsWith('0')) {
        return {
          valid: false,
          error: 'Amount cannot have leading zeros',
        };
      }

      // Check decimal places don't exceed token decimals
      if (fractional.length > decimals) {
        return {
          valid: false,
          error: `Amount cannot have more than ${decimals} decimal places`,
        };
      }

      // Check amount is positive
      const numAmount = parseFloat(amount);
      if (numAmount <= 0) {
        return {
          valid: false,
          error: 'Amount must be positive',
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error',
      };
    }
  }

  // Validate deadline hours
  validateDeadlineHours(hours: number, type: 'route' | 'refund'): ValidationResult {
    const maxHours = type === 'route' ? 24 * 30 : 24 * 90; // 30 days for route, 90 for refund
    const minHours = 1;

    if (hours < minHours) {
      return {
        valid: false,
        error: `${type} deadline must be at least ${minHours} hour(s)`,
      };
    }

    if (hours > maxHours) {
      return {
        valid: false,
        error: `${type} deadline cannot exceed ${maxHours} hours (${maxHours / 24} days)`,
      };
    }

    return { valid: true };
  }

  // Validate URL
  validateUrl(url: string, required = true): ValidationResult {
    if (!required && !url) {
      return { valid: true };
    }

    try {
      new URL(url);
      return { valid: true };
    } catch {
      return {
        valid: false,
        error: 'Invalid URL format',
      };
    }
  }
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// Create default validation service instance
export const validationService = new ValidationService();

// Export validation functions for convenience
export const validateAddress = (address: string, vmType: VMType): ValidationResult => {
  return validationService.validateAddress(address, vmType);
};

export const validateChainConfig = (config: ChainConfig): ValidationResult => {
  return validationService.validateChainConfig(config);
};

export const validateTokenEntry = (token: TokenEntry): ValidationResult => {
  return validationService.validateTokenEntry(token);
};

export const validateIntentCreationParams = (params: IntentCreationParams): ValidationResult => {
  return validationService.validateIntentCreationParams(params);
};

export const validatePrivateKey = (privateKey: string, vmType: VMType): ValidationResult => {
  return validationService.validatePrivateKey(privateKey, vmType);
};

export const validateTokenAmount = (amount: string, decimals: number): ValidationResult => {
  return validationService.validateTokenAmount(amount, decimals);
};

export const validateDeadlineHours = (
  hours: number,
  type: 'route' | 'refund'
): ValidationResult => {
  return validationService.validateDeadlineHours(hours, type);
};

export const validateUrl = (url: string, required = true): ValidationResult => {
  return validationService.validateUrl(url, required);
};
