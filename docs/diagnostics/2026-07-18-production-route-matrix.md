# Production ETH/SOL Any-to-Any Route Matrix

Execution window: 2026-07-17 through 2026-07-18 UTC

Target: Yellow production, running solver v2.50.1. PR 762 is not part of this deployment.

## Latest status after fresh-route retry

The four non-passing routes were retried with new quotes at 05:15-05:20 UTC, before their route
deadlines. Three completed the full lifecycle. Only ETH Base -> SOL Solana Any-to-Any still fails.

| Case | Fresh parent intent | Fresh result |
| --- | --- | --- |
| SS-2 | `0x19c052355d65ba1867e0f2d539f97b7cc5d37ca70f7884b5f99d98bd1ccb87a0` | **PASS** |
| SS-4 | `0xea2fabc672689e6ca6890f2cd8ee145c267cca118d290cbf66d7b10b9d6cdaef` | **PASS** |
| SS-6 | `0x074c18d04442f4a4d37a75d1441b3cb3c1b1a41c852b687323ec21c82bb91c4f` | **FAIL: Base `0x12988136` execution revert** |
| SS-7 | `0x5fb9d5bfeb5a5c9622ba4b12dc6e4f83a514e385f3f4b90e8e90cc61f7a03710` | **PASS** |

Combining the original passes with these fresh retries, **8/9 matrix routes now have a confirmed
full-lifecycle production success**. SS-6 is the sole currently reproducible failure.

The `route expired` errors observed when the old SS-4 and SS-7 intents retried were consequences of
those intents sitting in `EXECUTING` past their original route deadline. They are not reproduced as
the primary error with fresh routes: both fresh intents completed.

### Fresh SS-2: ETH Base -> USDC Solana — PASS

- Quote: `quote:f7b93adc-d153-4967-af11-9bccb069b3f5`
- Parent: `0x19c052355d65ba1867e0f2d539f97b7cc5d37ca70f7884b5f99d98bd1ccb87a0`
- Source settlement: `0x04c73d4d5e2470d80b5b9bb3c53c84835c7e25b461c6f42e666063ef520de6c8`
- Published child: `0x624318688ab84b83a02f655a487db49c5e91cb7320ca8c7bb457222302d84324`
- Solana fulfillment and proof:
  `2x3jc1q6EAJQopoYiyzzvf5RrhnxViE3BssjmgMpkMUECQS6WZFN3yVoFrZJKLR6TsCNsi2NKJAxVnbksKfgtTtf`
- Exact recipient delivery: `0.705363 USDC`
- Quote minimum: `0.699851 USDC`
- Base kernel withdrawal: `0xafb96342a8c18de3849300626941b4d106f7cfe3075f4baaa518e1b096254a17`
- Exact kernel reward: `1.105363 USDC`

The earlier SS-2 Base gas failure did not reproduce. The CLI still classified the row as
`POLL_ERROR` because this source-swap quote is not bucketed, but Yellow DB and exact onchain
delivery/withdrawal evidence show the route completed.

### Fresh SS-4: USDC Base -> SOL Solana — PASS

- Quote: `quote:1f75d2b2-4fdf-49c7-822d-ba219889f191`
- Intent: `0xea2fabc672689e6ca6890f2cd8ee145c267cca118d290cbf66d7b10b9d6cdaef`
- Funding: `0x1e47e9a2036ac9b349de4826ea5f2438aa30cf187fb881715334a5eec900b9a3`
- Solana fulfillment:
  `2iGXwB8DyzGa5Sdz78zGSsfCrBRtmwvT4NhQFrSGDNzNjeTuP6TkeA3v6LZWZiSv33qotqeqraM338wGtqgbG3LS`
- Native recipient delta: `0.010038431 SOL`
- Quote minimum: `0.007968469 SOL`
- Solana proof:
  `bqqeCdaHvAQERvzEjG7j59bkYZWZYwSv55t79UrVhc1NtSrELXDRfVM5pp5f8c9CNxXpiPqKdew9Fmt42wB5MRB`
- Base kernel withdrawal: `0xafb96342a8c18de3849300626941b4d106f7cfe3075f4baaa518e1b096254a17`
- Exact kernel reward: `1 USDC`

Production completed the lifecycle in about one minute. The CLI row nevertheless timed out after
300 seconds because its status poll did not surface the cross-VM completion. This is a harness false
negative, confirmed by direct Yellow DB lifecycle events and paid RPC evidence.

### Fresh SS-6: ETH Base -> SOL Solana Any-to-Any — FAIL

- Quote: `quote:b416f7dd-e529-4360-aab6-827b47262291`
- Parent: `0x074c18d04442f4a4d37a75d1441b3cb3c1b1a41c852b687323ec21c82bb91c4f`
- Funding: `0x0b9a1bf22d2f3d5fc0390c27785313944f1b3a9ccaac965886f9583c8727a427`
- Yellow state: `FAILED`, `retryCount: 1`
- Error: `EVM_REVERT_WITH_SELECTOR`, selector `0x12988136`

Yellow marked the route failed in the same second as funding, well before quote or route expiry. No
child was promoted and no execution transaction hash is persisted. This confirms a real Base
source-execution problem remains for SS-6; it is not explained by the later expired-route symptom.

### Fresh SS-7: SOL Solana -> USDC Base — PASS

- Quote: `quote:614e4de8-8e62-4e5e-b224-1eb248690424`
- Parent: `0x5fb9d5bfeb5a5c9622ba4b12dc6e4f83a514e385f3f4b90e8e90cc61f7a03710`
- Funding:
  `icdcoZg71wnLmShEfiB1TvtbqDBPM7FQG4LECjRHSBJNvUhUXBGxEx3KdBshA34AZ6EHMMM8z27duwsnEoJNHXX`
- Source settlement and bucket selection:
  `2cxstNKyQMGP4HgVxz1TPmEAMTEyp4Ss9oE9Tdx9Cd2zyip5XFf4afSEety2DFDo4VF37gjV1u5RLcZfGEU17Wwf`
- Promoted bucket: index `3`
- Child: `0xe00576d8ac4e090e7e2f8eab35e42bab7c925dd0ae902467f7c3e423d27f7398`
- Base fulfillment: `0x489439f6c67f422d59f331366906aa08666a862a683e031accb3319b5e59428c`
- Exact recipient delivery: `0.318891 USDC`
- Quote minimum: `0.313271 USDC`
- Solana proof:
  `3HucJXbnnfxbVMafLRFnYmV5T3cZ92ac2KPWmULZeQUhWkC6hZh23jeAa3wpvevT45WBFPDHy3gtCBo6PTGP7t3u`
- Solana withdrawal:
  `2jm3wYSE5gjkmmdmaUgPjVZkCwXPisrG4G1bkw9L2RM8h9WXG7bCJqHvcBkdfdz1ARAs2gDTrGJ1azSNBbBGaZHK`
- Exact kernel reward: `1.123830 USDC`

The later reconciliation reported `succeeded=1/1`, including exact destination delivery and exact
withdrawal to `7HBkzmHz3gYHBV4DJ1GCvCax815zgrntRRwoBJEZi3Fe`.

## Initial result

All nine requests quoted successfully. Five completed the full production lifecycle, two failed
during Base source execution, and two remain stuck in `EXECUTING` with no retry or terminal error.

| Case | Route | Path | Slippage | Quote | Destination delivery | Proof | Kernel withdrawal | Production result |
| --- | --- | --- | ---: | --- | --- | --- | --- | --- |
| SS-1 | ETH Base -> USDC Arbitrum | source swap | 50 bps | pass | pass | pass | pass | **PASS** |
| SS-2 | ETH Base -> USDC Solana | source swap | 50 bps | pass | not reached | not reached | not reached | **FAIL: Base execution gas** |
| SS-3 | USDC Base -> ETH Arbitrum | destination swap | 50 bps | pass | pass | pass | pass | **PASS** |
| SS-4 | USDC Base -> SOL Solana | destination swap | 50 bps | pass | not observed | not reached | not reached | **STUCK: Solana destination execution** |
| SS-5 | ETH Base -> ARB Arbitrum | Any-to-Any | 100 bps | pass | pass | pass | pass | **PASS** |
| SS-6 | ETH Base -> SOL Solana | Any-to-Any | 100 bps | pass | not reached | not reached | not reached | **FAIL: Base execution gas** |
| SS-7 | SOL Solana -> USDC Base | Any-to-Any | 50 bps | pass | not reached | not reached | not reached | **STUCK: Solana source execution** |
| SS-8 | SOL Solana -> ETH Base | Any-to-Any | 50 bps | pass | pass | pass | pass | **PASS** |
| SS-10 | ETH Arbitrum -> USDC Base | control/source swap | 50 bps | pass | pass | pass | pass | **PASS** |

Aggregate production status: **5/9 full-lifecycle passes, 2/9 terminal failures, 2/9 stuck**.
Quote availability is **9/9**.

## Test parameters

The runs used native ETH and native SOL, not WETH or wSOL, with approximately USD 1-2 of input:

- ETH input: `0.0006 ETH`
- USDC input: `1 USDC`
- SOL input: `0.015 SOL`
- Liquid/stable routes: `50 bps` (`0.5%`) slippage
- Volatile-to-volatile Any-to-Any routes: `100 bps` (`1.0%`) slippage

This follows the common pattern of tighter tolerance for stable or single-liquid-pair routes and a
wider tolerance for small, multi-leg volatile routes. SS-6 was deliberately rerun at 100 bps and
failed at the same source execution boundary, ruling out tight slippage as its cause.

The EVM destination recipient was
`0x62b2Ac83E0C8666d9bE4e75B99C0E96c822d23E1`. Successful EVM-source withdrawals were checked
against kernel claimant `0xd15E62E64c1265Dfb753eD6e7C76CB5FF8f276c7`. The successful Solana-source
withdrawal was checked against kernel claimant
`7HBkzmHz3gYHBV4DJ1GCvCax815zgrntRRwoBJEZi3Fe`.

## Success boundary and verification

A source-swap parent withdrawal is intermediate, not route success. A route is counted as passing
only when the requested destination asset is delivered, the destination intent is proven, and the
reward is withdrawn to the configured source-chain kernel claimant.

The successful cases were reconciled using Yellow Mongo lifecycle records plus paid EVM/SVM RPC
evidence. ERC-20 delivery and withdrawals were decoded from `Transfer` logs. Native delivery was
checked from the recipient balance delta in the fulfillment block. Withdrawal amounts and
claimants were required to match exactly.

### SS-1: ETH Base -> USDC Arbitrum — PASS

- Quote: `quote:c6d1196c-db5e-4fba-8d6e-9613602684a3`
- Parent: `0xf13819d4287734a7fc6e5b43b733542a303e023f8932ce689f24bb3549df4278`
- Source settlement: `0x4beabd90ac8e7b0c1f1d94963d3deaec9e474d6d4165b85f4eb1f84698fb47b4`
- Published child: `0xee85a8dbee318ec796362183fb4201883fa7ee9a7162e5a1dc5fff660f00c6db`
- Destination fulfillment: `0x47761ff19fce11d7fe6e9195057cccf42bdb1353ebd70be13520b3b7ce908091`
- Exact recipient delivery: `1.094081 USDC`
- Proof: `0x5936872171673ac66a0fb739e723bef505010f9dcc210da778ad3c1629f8d1f4`
- Withdrawal: `0x2d0e93c3071b8d60833810b86158273694a200b1f7278f7e2e0b2914250cc5ad`
- Exact kernel reward: `1.104081 USDC`

The CLI row ended as `POLL_ERROR` because the quote is not represented as a bucketed Any-to-Any
quote. Direct DB lifecycle records and exact onchain delivery/withdrawal logs prove the production
route succeeded. This is a harness classification gap.

### SS-2: ETH Base -> USDC Solana — FAIL

- Quote: `quote:65f4880b-cc01-420c-a7fb-16bb620195ab`
- Parent: `0x2a1dbcfa710bdfea979aa625f9d0e6364da1d685a5edd86d6cbdb080debd8bb4`
- Failed Base execution: `0xb3eeaee9cf7d4d68060db43783b6c99e12d26416b2b55452400b094f9826b962`
- Yellow terminal state: `FAILED`
- Yellow error selector: `0x12988136`

The paid Base call trace shows that the LiFi source swap produced USDC, then the final Portal
funding path failed. The deepest Base USDC `transferFrom` delegatecall exhausted its gas and the
wrapper returned `0x1425ea42`. No destination child was published, so delivery, proof, and child
withdrawal were never reached.

### SS-3: USDC Base -> ETH Arbitrum — PASS

- Quote: `quote:56e0ea21-eff3-417a-b315-61ad60ac8a19`
- Intent: `0x854bd5540f630d09c06d7114279e54965f158573a4e5f0870920e11156f4babd`
- Destination fulfillment: `0x3aa299fbc26957de7cd3abaad2d1d827c85d2544bb9190564c8a2ff6808c0d18`
- Native recipient delta: `0.000548030570047490 ETH`
- Quote minimum: `0.000545320673979354 ETH`
- Proof: `0x4deac0c4791cb4eb85f650f897bf0c6a245ab391f45c7d46af438bc0e10483c3`
- Withdrawal: `0x1c82a2f1b132f7470b1ea778f92f0b6bf3053f63c6bc6a04ac35e6d6645e8e39`
- Exact kernel reward: `1 USDC`

### SS-4: USDC Base -> SOL Solana — STUCK

- Quote: `quote:901805ce-774b-46d7-82fe-5f8cd55ee1eb`
- Intent: `0xb58b1203ff125d19212dc9ee0ee80d5100105a566ed97d8c8684198f93c65677`
- Funding: `0x447be43a2e4426c6533e8b2e35b6f949bdcc00447158f39f6cb3dfa898ad17a7`
- Quoted output: `0.007997350 SOL`
- Quote minimum: `0.007957364 SOL`

The run timed out after 300 seconds. A later direct DB check still showed `EXECUTING`,
`retryCount: 0`, no `lastError`, and no fulfillment, proof, withdrawal, or refund event. The stored
fulfillment metadata includes two Solana lookup tables and the wSOL setup ATA, locating the stall
inside the Solana destination execution path after Base funding.

### SS-5: ETH Base -> ARB Arbitrum — PASS

- Quote: `quote:4a4f659e-b60e-4f4c-a388-b903718b2b04`
- Parent: `0x7e7eb3d5b664dcac707f4461fb6d7b04772fcc08ec201a479b0b94a0489faeb2`
- Source settlement: `0xd526c10be5b238bc26b630d263849092c042a685c71409db93a1d3e313fb3ee5`
- Promoted child: `0x251b848df98afcd0b1d43cc49323b636409d1adfaf4b841a432ff122e4d550b9`
- Destination fulfillment: `0xd055a1c66afe984e7d41cff4044e96ba6d95bca6999882bd276c0b4e523649d4`
- Verified recipient delivery: `11.972463256414448391 ARB`
- Quote minimum: `3.744101463711709320 ARB`
- Proof: `0x8de2c5fd0a6eaf913e5bffcfd563764d30126e447f8fde01de80f985922c059b`
- Withdrawal: `0x2df65c975a2f4816ea492cacedf40fc140d26fada294fec89c9fff227bc0f05c`
- Exact kernel reward: `1.103325 USDC`

### SS-6: ETH Base -> SOL Solana — FAIL

- Quote: `quote:fb27ea73-6d68-46d7-9384-472f8ee8723e`
- Parent: `0x1aef8c7fadc37787299af5e60b0fedb25f424507099d9906141aee96ff6cdd66`
- Failed Base execution: `0x900672f1bed2a9125a3282b70cd3b1dc19c7f5739dc24a24d2f5e031a77d9f98`
- Yellow terminal state: `FAILED`
- Yellow error: `EVM_REVERT_EMPTY`

The paid Base call trace resolves the empty revert to an out-of-gas failure. The Portal call reaches
Base USDC `transfer`; its implementation delegatecall receives only `0xa95` gas and consumes all of
it. The outer call returns selector `0x12988136`. No bucket child was promoted. This 100 bps rerun
reproduced the earlier 50 bps failure, so slippage is not causal.

### SS-7: SOL Solana -> USDC Base — STUCK

- Quote: `quote:1eeaa53c-4e61-414e-a31a-edb8a83798a0`
- Parent: `0x21aebcd517b7fef3c274ec1bc75681a95a901a7a545c328151e24e8bd5e77216`
- Solana funding signature:
  `3aDsuK64HGeiTum4zLDb6Efv9PvrJ8yXwBTZkNcNvTFgk3gTes7UXFJ3dV9jvRb4nZzYoJWYbt1dYhcWcwq82E3n`

The run timed out after 300 seconds. A later direct DB check still showed the parent as `EXECUTING`,
`retryCount: 0`, no `lastError`, and all four children as `CANDIDATE`. No child was selected, so no
Base delivery, proof, or kernel withdrawal occurred.

### SS-8: SOL Solana -> ETH Base — PASS

- Quote: `quote:cab6e155-2401-4900-963a-221b90c28470`
- Parent: `0x93edc28072fbfdcd7b2f655787403778244b89971366053a3deb5b7b0eeb32ee`
- Source settlement:
  `46KoY3RBbZ5iqRs62vA12YQQVLGmksdSRLJBwAnRQsFxYXTX2VSbDNRP3WmHvoPgcwcsjbY9b4M1RkpR8Xs9Ka4h`
- Promoted child: `0x435c9182b8d0b26cab2bbf5ce42ef877da3dc5ec400a0df777fe065438f554e5`
- Destination fulfillment: `0x8a757238f23a828b0baae7c1cf00b54b7ebd8cc5c915350df923e153413efb00`
- Verified recipient delivery: `0.000173081723812561 ETH`
- Quote minimum: `0.000170246853059800 ETH`
- Proof signature:
  `SFwn5V9HmXYUNV4k4VJbfm6G49ynGwd3meFRcgG9QZG8y2m2C4bun6AiCMxdda7g3ZynKnqJfziX3Mp7XMQVqiv`
- Withdrawal signature:
  `4T5sAkGCQm4ekmAtjDQkMg1kum2Nw2K7woUVXiaDKg2CzkRfSENDpEYVNEFMNiUgeAtFZRRrAPb6gn6dHLVedjkp`
- Exact Solana-kernel reward: `1.123404 USDC`

### SS-10: ETH Arbitrum -> USDC Base control — PASS

- Quote: `quote:57084c67-2f80-40b1-ad1f-54df68bbf2a9`
- Parent: `0xc1db6514e34a30c7735032f140e3fe0d9e6a2ffb0dccbf3e9001ac695c2895eb`
- Source settlement: `0xc55044b9a7fc1b3d9e83a37dbeb386bee569cbbabf3bdb4ffc8e8763099ca3e9`
- Published child: `0x5ca71dd3a6296ab2d2ed288e51a3b18bedc2ac52da6c34ea3e6a57d944220e9c`
- Destination fulfillment: `0xb445e2c1126543ba17a8dddc0cce9596de764397495e6edbbc1c9a2380d0074f`
- Exact recipient delivery: `1.093574 USDC`
- Proof: `0xfeac6ea06f5a530c65a85b8926041b0a50981a1a77d153d5401c893fdcc7654e`
- Withdrawal: `0x4d292e6935a281fc8a0c22aae8da755e31f14f5f38c4d292c0af1ace37fff66e`
- Exact kernel reward: `1.103574 USDC`

As in SS-1, the CLI's non-bucketed classification produced `POLL_ERROR` after source settlement,
but direct DB lifecycle records and exact onchain delivery/withdrawal logs prove success.

## Diagnosis

1. **Quote registration is now healthy for this matrix.** All nine requests received quotes. The
   earlier no-matching-solver symptom is no longer present for these cases.
2. **The Base ETH source path is not universally broken.** SS-1 and SS-5 completed to Arbitrum.
   The reproducible failures are specifically the Base-to-Solana source execution variants.
3. **Both Base-to-Solana ETH failures are gas failures before destination execution.** SS-2 fails
   on Base USDC `transferFrom`; SS-6 fails on Base USDC `transfer`. Both traces exhaust gas in the
   USDC implementation under the Portal path. Increasing slippage does not affect this boundary.
4. **Solana execution is currently inconsistent.** SS-8 proves the full Solana-source lifecycle can
   work, including proof and withdrawal. SS-4 and SS-7 nevertheless remain indefinitely
   `EXECUTING` without retry/error state. A shared SVM executor or queue issue is plausible because
   the stalls occurred in the same run window, but that is an inference; solver logs are required
   to identify the exact internal boundary.
5. **The destination EVM swap and native-balance verifier are healthy.** SS-3 delivered native ETH
   above the quote minimum, and SS-5 delivered ARB. The failures do not support a general LiFi
   destination-swap outage.
6. **Kernel withdrawal works on both VMs for completed routes.** All five passes have proof and
   exact reward withdrawal evidence to their configured kernel claimant.

## Recommended production follow-up

1. Apply and deploy an executor gas-estimation/buffer fix for the final Base Portal funding call,
   then rerun SS-2 and SS-6 unchanged.
2. Search Yellow logs by SS-4 and SS-7 parent intent hash to determine why work remains
   `EXECUTING` with `retryCount: 0` and no persisted `lastError`.
3. Add an age-based alert for intents that remain `EXECUTING` without an update or retry, especially
   on SVM execution paths.
4. Extend lifecycle reconciliation to support non-bucketed source-swap quotes so SS-1 and SS-10 are
   reported as successful directly by the harness rather than requiring DB/onchain reconciliation.
