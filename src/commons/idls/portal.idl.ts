import { Idl } from '@coral-xyz/anchor';

export enum Network {
  MAINNET = 'mainnet',
  DEVNET = 'devnet',
}

const PORTAL_ADDRESSES = {
  [Network.MAINNET]: '7rNRf9CW4jwzS52kXUDtf1pG1rUPfho7tFxgjy2J6cLe',
  [Network.DEVNET]: '5nCJDkRg8mhj9XHkjuFoR6Mcs6VcDZVsCbZ7pTJhRFEF', // Devnet Portal address from chain config
} as const;

export function getPortalIdl(network: Network): Idl {
  return {
    address: PORTAL_ADDRESSES[network],
    metadata: {
      name: 'portal',
      version: '0.1.0',
      spec: '0.1.0',
      description: 'Created with Anchor',
    },
    instructions: [
      {
        name: 'fulfill',
        discriminator: [143, 2, 52, 206, 174, 164, 247, 72],
        accounts: [
          {
            name: 'payer',
            writable: true,
            signer: true,
          },
          {
            name: 'solver',
            writable: true,
            signer: true,
          },
          {
            name: 'executor',
          },
          {
            name: 'fulfill_marker',
            writable: true,
          },
          {
            name: 'token_program',
            address: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
          },
          {
            name: 'token_2022_program',
            address: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
          },
          {
            name: 'associated_token_program',
            address: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
          },
          {
            name: 'system_program',
            address: '11111111111111111111111111111111',
          },
        ],
        args: [
          {
            name: 'args',
            type: {
              defined: {
                name: 'FulfillArgs',
              },
            },
          },
        ],
      },
      {
        name: 'fund',
        discriminator: [218, 188, 111, 221, 152, 113, 174, 7],
        accounts: [
          {
            name: 'payer',
            signer: true,
          },
          {
            name: 'funder',
            writable: true,
            signer: true,
          },
          {
            name: 'vault',
            writable: true,
          },
          {
            name: 'token_program',
            address: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
          },
          {
            name: 'token_2022_program',
            address: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
          },
          {
            name: 'associated_token_program',
            address: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
          },
          {
            name: 'system_program',
            address: '11111111111111111111111111111111',
          },
        ],
        args: [
          {
            name: 'args',
            type: {
              defined: {
                name: 'FundArgs',
              },
            },
          },
        ],
      },
      {
        name: 'prove',
        discriminator: [52, 246, 26, 161, 211, 170, 86, 215],
        accounts: [
          {
            name: 'prover',
          },
          {
            name: 'dispatcher',
          },
        ],
        args: [
          {
            name: 'args',
            type: {
              defined: {
                name: 'ProveArgs',
              },
            },
          },
        ],
      },
      {
        name: 'publish',
        discriminator: [129, 177, 182, 160, 184, 224, 219, 5],
        accounts: [],
        args: [
          {
            name: 'args',
            type: {
              defined: {
                name: 'PublishArgs',
              },
            },
          },
        ],
      },
      {
        name: 'refund',
        discriminator: [2, 96, 183, 251, 63, 208, 46, 46],
        accounts: [
          {
            name: 'payer',
            writable: true,
            signer: true,
          },
          {
            name: 'creator',
            writable: true,
          },
          {
            name: 'vault',
            writable: true,
          },
          {
            name: 'proof',
          },
          {
            name: 'withdrawn_marker',
            writable: true,
          },
          {
            name: 'token_program',
            address: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
          },
          {
            name: 'token_2022_program',
            address: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
          },
          {
            name: 'system_program',
            address: '11111111111111111111111111111111',
          },
        ],
        args: [
          {
            name: 'args',
            type: {
              defined: {
                name: 'RefundArgs',
              },
            },
          },
        ],
      },
      {
        name: 'withdraw',
        discriminator: [183, 18, 70, 156, 148, 109, 161, 34],
        accounts: [
          {
            name: 'payer',
            writable: true,
            signer: true,
          },
          {
            name: 'claimant',
            writable: true,
          },
          {
            name: 'vault',
            writable: true,
          },
          {
            name: 'proof',
            writable: true,
          },
          {
            name: 'proof_closer',
          },
          {
            name: 'prover',
          },
          {
            name: 'withdrawn_marker',
            writable: true,
          },
          {
            name: 'token_program',
            address: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
          },
          {
            name: 'token_2022_program',
            address: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
          },
          {
            name: 'system_program',
            address: '11111111111111111111111111111111',
          },
        ],
        args: [
          {
            name: 'args',
            type: {
              defined: {
                name: 'WithdrawArgs',
              },
            },
          },
        ],
      },
    ],
    events: [
      {
        name: 'IntentFulfilled',
        discriminator: [168, 116, 104, 206, 0, 206, 46, 195],
      },
      {
        name: 'IntentFunded',
        discriminator: [14, 106, 10, 45, 124, 28, 211, 173],
      },
      {
        name: 'IntentProven',
        discriminator: [149, 170, 177, 57, 59, 144, 49, 23],
      },
      {
        name: 'IntentPublished',
        discriminator: [194, 169, 103, 197, 21, 235, 236, 166],
      },
      {
        name: 'IntentRefunded',
        discriminator: [192, 129, 4, 158, 184, 25, 83, 113],
      },
      {
        name: 'IntentWithdrawn',
        discriminator: [28, 22, 16, 41, 101, 254, 123, 228],
      },
    ],
    errors: [
      {
        code: 6000,
        name: 'InvalidCreator',
      },
      {
        code: 6001,
        name: 'InvalidVault',
      },
      {
        code: 6002,
        name: 'InvalidAta',
      },
      {
        code: 6003,
        name: 'InvalidMint',
      },
      {
        code: 6004,
        name: 'InvalidTokenProgram',
      },
      {
        code: 6005,
        name: 'InsufficientFunds',
      },
      {
        code: 6006,
        name: 'InvalidTokenTransferAccounts',
      },
      {
        code: 6007,
        name: 'TokenAmountOverflow',
      },
      {
        code: 6008,
        name: 'RewardNotExpired',
      },
      {
        code: 6009,
        name: 'RouteExpired',
      },
      {
        code: 6010,
        name: 'InvalidProof',
      },
      {
        code: 6011,
        name: 'IntentFulfilledAndNotWithdrawn',
      },
      {
        code: 6012,
        name: 'IntentAlreadyWithdrawn',
      },
      {
        code: 6013,
        name: 'IntentAlreadyFulfilled',
      },
      {
        code: 6014,
        name: 'IntentNotFulfilled',
      },
      {
        code: 6015,
        name: 'InvalidCreatorToken',
      },
      {
        code: 6016,
        name: 'InvalidClaimantToken',
      },
      {
        code: 6017,
        name: 'InvalidWithdrawnMarker',
      },
      {
        code: 6018,
        name: 'InvalidExecutor',
      },
      {
        code: 6019,
        name: 'InvalidCalldata',
      },
      {
        code: 6020,
        name: 'InvalidFulfillMarker',
      },
      {
        code: 6021,
        name: 'InvalidPortal',
      },
      {
        code: 6022,
        name: 'InvalidProver',
      },
      {
        code: 6023,
        name: 'InvalidDispatcher',
      },
      {
        code: 6024,
        name: 'InvalidProofCloser',
      },
      {
        code: 6025,
        name: 'InvalidIntentHash',
      },
      {
        code: 6026,
        name: 'EmptyIntentHashes',
      },
    ],
    types: [
      {
        name: 'Bytes32',
        type: {
          kind: 'struct',
          fields: [
            {
              array: ['u8', 32],
            },
          ],
        },
      },
      {
        name: 'Call',
        type: {
          kind: 'struct',
          fields: [
            {
              name: 'target',
              type: {
                defined: {
                  name: 'Bytes32',
                },
              },
            },
            {
              name: 'data',
              type: 'bytes',
            },
          ],
        },
      },
      {
        name: 'FulfillArgs',
        type: {
          kind: 'struct',
          fields: [
            {
              name: 'intent_hash',
              type: {
                defined: {
                  name: 'Bytes32',
                },
              },
            },
            {
              name: 'route',
              type: {
                defined: {
                  name: 'Route',
                },
              },
            },
            {
              name: 'reward_hash',
              type: {
                defined: {
                  name: 'Bytes32',
                },
              },
            },
            {
              name: 'claimant',
              type: {
                defined: {
                  name: 'Bytes32',
                },
              },
            },
          ],
        },
      },
      {
        name: 'FundArgs',
        type: {
          kind: 'struct',
          fields: [
            {
              name: 'destination',
              type: 'u64',
            },
            {
              name: 'route_hash',
              type: {
                defined: {
                  name: 'Bytes32',
                },
              },
            },
            {
              name: 'reward',
              type: {
                defined: {
                  name: 'Reward',
                },
              },
            },
            {
              name: 'allow_partial',
              type: 'bool',
            },
          ],
        },
      },
      {
        name: 'IntentFulfilled',
        type: {
          kind: 'struct',
          fields: [
            {
              name: 'intent_hash',
              type: {
                defined: {
                  name: 'Bytes32',
                },
              },
            },
            {
              name: 'claimant',
              type: {
                defined: {
                  name: 'Bytes32',
                },
              },
            },
          ],
        },
      },
      {
        name: 'IntentFunded',
        type: {
          kind: 'struct',
          fields: [
            {
              name: 'intent_hash',
              type: {
                defined: {
                  name: 'Bytes32',
                },
              },
            },
            {
              name: 'funder',
              type: 'pubkey',
            },
            {
              name: 'complete',
              type: 'bool',
            },
          ],
        },
      },
      {
        name: 'IntentProven',
        type: {
          kind: 'struct',
          fields: [
            {
              name: 'intent_hash',
              type: {
                defined: {
                  name: 'Bytes32',
                },
              },
            },
            {
              name: 'claimant',
              type: {
                defined: {
                  name: 'Bytes32',
                },
              },
            },
          ],
        },
      },
      {
        name: 'IntentPublished',
        type: {
          kind: 'struct',
          fields: [
            {
              name: 'intent_hash',
              type: {
                defined: {
                  name: 'Bytes32',
                },
              },
            },
            {
              name: 'destination',
              type: 'u64',
            },
            {
              name: 'route',
              type: 'bytes',
            },
            {
              name: 'reward',
              type: {
                defined: {
                  name: 'Reward',
                },
              },
            },
          ],
        },
      },
      {
        name: 'IntentRefunded',
        type: {
          kind: 'struct',
          fields: [
            {
              name: 'intent_hash',
              type: {
                defined: {
                  name: 'Bytes32',
                },
              },
            },
            {
              name: 'refundee',
              type: 'pubkey',
            },
          ],
        },
      },
      {
        name: 'IntentWithdrawn',
        type: {
          kind: 'struct',
          fields: [
            {
              name: 'intent_hash',
              type: {
                defined: {
                  name: 'Bytes32',
                },
              },
            },
            {
              name: 'claimant',
              type: 'pubkey',
            },
          ],
        },
      },
      {
        name: 'ProveArgs',
        type: {
          kind: 'struct',
          fields: [
            {
              name: 'prover',
              type: 'pubkey',
            },
            {
              name: 'source_chain_domain_id',
              type: 'u64',
            },
            {
              name: 'intent_hashes',
              type: {
                vec: {
                  defined: {
                    name: 'Bytes32',
                  },
                },
              },
            },
            {
              name: 'data',
              type: 'bytes',
            },
          ],
        },
      },
      {
        name: 'PublishArgs',
        type: {
          kind: 'struct',
          fields: [
            {
              name: 'destination',
              type: 'u64',
            },
            {
              name: 'route',
              type: 'bytes',
            },
            {
              name: 'reward',
              type: {
                defined: {
                  name: 'Reward',
                },
              },
            },
          ],
        },
      },
      {
        name: 'RefundArgs',
        type: {
          kind: 'struct',
          fields: [
            {
              name: 'destination',
              type: 'u64',
            },
            {
              name: 'route_hash',
              type: {
                defined: {
                  name: 'Bytes32',
                },
              },
            },
            {
              name: 'reward',
              type: {
                defined: {
                  name: 'Reward',
                },
              },
            },
          ],
        },
      },
      {
        name: 'Reward',
        type: {
          kind: 'struct',
          fields: [
            {
              name: 'deadline',
              type: 'u64',
            },
            {
              name: 'creator',
              type: 'pubkey',
            },
            {
              name: 'prover',
              type: 'pubkey',
            },
            {
              name: 'native_amount',
              type: 'u64',
            },
            {
              name: 'tokens',
              type: {
                vec: {
                  defined: {
                    name: 'TokenAmount',
                  },
                },
              },
            },
          ],
        },
      },
      {
        name: 'Route',
        type: {
          kind: 'struct',
          fields: [
            {
              name: 'salt',
              type: {
                defined: {
                  name: 'Bytes32',
                },
              },
            },
            {
              name: 'deadline',
              type: 'u64',
            },
            {
              name: 'portal',
              type: {
                defined: {
                  name: 'Bytes32',
                },
              },
            },
            {
              name: 'native_amount',
              type: 'u64',
            },
            {
              name: 'tokens',
              type: {
                vec: {
                  defined: {
                    name: 'TokenAmount',
                  },
                },
              },
            },
            {
              name: 'calls',
              type: {
                vec: {
                  defined: {
                    name: 'Call',
                  },
                },
              },
            },
          ],
        },
      },
      {
        name: 'TokenAmount',
        type: {
          kind: 'struct',
          fields: [
            {
              name: 'token',
              type: 'pubkey',
            },
            {
              name: 'amount',
              type: 'u64',
            },
          ],
        },
      },
      {
        name: 'WithdrawArgs',
        type: {
          kind: 'struct',
          fields: [
            {
              name: 'destination',
              type: 'u64',
            },
            {
              name: 'route_hash',
              type: {
                defined: {
                  name: 'Bytes32',
                },
              },
            },
            {
              name: 'reward',
              type: {
                defined: {
                  name: 'Reward',
                },
              },
            },
          ],
        },
      },
      {
        name: 'Calldata',
        type: {
          kind: 'struct',
          fields: [
            {
              name: 'data',
              type: 'bytes',
            },
            {
              name: 'account_count',
              type: 'u8',
            },
          ],
        },
      },
      {
        name: 'SerializableAccountMeta',
        type: {
          kind: 'struct',
          fields: [
            {
              name: 'pubkey',
              type: 'pubkey',
            },
            {
              name: 'is_signer',
              type: 'bool',
            },
            {
              name: 'is_writable',
              type: 'bool',
            },
          ],
        },
      },
      {
        name: 'CalldataWithAccounts',
        type: {
          kind: 'struct',
          fields: [
            {
              name: 'calldata',
              type: {
                defined: {
                  name: 'Calldata',
                },
              },
            },
            {
              name: 'accounts',
              type: {
                vec: {
                  defined: {
                    name: 'SerializableAccountMeta',
                  },
                },
              },
            },
          ],
        },
      },
    ],
  } as const;
}

// Keep the original export for backward compatibility (defaults to mainnet)
export const portalIdl: Idl = getPortalIdl(Network.MAINNET);
