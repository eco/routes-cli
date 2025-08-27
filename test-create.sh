#!/bin/bash

# Test the create command with predefined options
npx tsx src/index.ts create \
  --source-chain base \
  --destination-chain optimism \
  --route-token USDC \
  --route-amount 100 \
  --reward-token USDC \
  --reward-amount 5 \
  --recipient 0x0000000000000000000000000000000000000001 \
  --route-deadline 24 \
  --refund-deadline 72