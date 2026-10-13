# Feras Devnet Release Runbook

This runbook prepares a reviewable Solana devnet release. It is not permission
to deploy, create a mint, initialize the program, or send a transaction.

## Safety Boundary

- Cluster is exactly `devnet`; mainnet is out of scope.
- Configuration files contain public addresses only.
- Wallets, managed signers, or multisigs retain all private signing material.
- Every transaction is decoded, simulated, summarized, and separately approved
  by an operator before signing.
- The mobile bundle receives only the program ID, mint, cluster, and RPC URL.
- Devnet USDC is valueless test credit and must never be described as Circle
  USDC or redeemable money.

## Authority Roles

| Role | Purpose | Required separation |
| --- | --- | --- |
| Upgrade authority | Program upgrades and final immutability decision | Dedicated multisig |
| Platform authority | Market creation, pause, cancellation, config rotation | Dedicated multisig/service policy |
| Settlement authority | Submits canonical match results | Restricted managed signer |
| Treasury authority | Owns the protocol-fee token account | Dedicated multisig |
| Mint creation authority | Creates and mints the fixed test supply | Temporary ceremony signer |
| Distribution authority | Owns the rate-limited faucet vault | Restricted service/multisig |

All six public addresses must be distinct. The on-chain program independently
enforces separation between platform, settlement, and treasury roles. Platform
authority transfer is two-step: the current authority proposes, then the new
authority signs acceptance.

## Offline Manifest

1. Start from `config/devnet-release.env.example` and create the ignored local
   file `config/devnet-release.env` containing public addresses only.
2. Export those values into the shell.
3. Run `npm run validate:devnet-config` and store the JSON output for review.
4. After every deployment stage, run `npm run verify:devnet-deployment` and
   store its JSON output beside the release manifest. This performs public
   Devnet reads only and verifies the executable program, fixed-supply mint,
   canonical treasury ATA, and on-chain config PDA fields.
5. Confirm the derived config PDA, treasury ATA, distribution ATA, six decimals,
   fixed supply, null final mint authority, and original SPL Token Program.

The validator rejects malformed keys, shared authorities, a redirected treasury
account, fractional precision beyond six decimals, zero supply, and caps above
10,000,000 tokens. It performs no RPC request and creates no transaction.

## Reviewed Transaction Sequence

Each numbered stage is a separate approval boundary.

1. **Deploy program:** verify the reviewed `.so` hash, program ID, cluster, fee
   payer, and upgrade authority. Simulate where supported, deploy, then record
   the deployment signature and ProgramData authority.
2. **Create mint:** create an original SPL Token mint with exactly six decimals,
   the temporary mint authority, and no freeze authority. Verify its parsed
   on-chain state before continuing.
3. **Create vaults:** create canonical ATAs for the treasury and distribution
   authorities. Reject any noncanonical destination or wrong token program.
4. **Fix supply:** mint exactly the manifest cap to the distribution ATA, verify
   total supply and destination balance, then revoke mint authority permanently.
   Verify both mint and freeze authorities are `null` afterward.
5. **Initialize Feras:** initialize the config PDA with the platform,
   settlement, and treasury roles, accepted mint, treasury ATA, reviewed fee,
   and claim window. Fetch and byte-check the resulting account.
6. **Smoke test:** use a deliberately small faucet transfer and market on devnet.
   Simulate each transaction, exercise position, lock, settle, claim/refund, and
   reconcile token balances and emitted events.
7. **Publish client config:** only after reconciliation, copy the recorded mint
   and program public addresses into the mobile/API environment.

## Required Release Record

Record these public facts in a reviewed deployment manifest:

- UTC timestamp, operator/reviewer identities, cluster, and RPC provider;
- source revision, Anchor/Solana versions, `.so` SHA-256, byte length, and
  containerized/verifiable build evidence;
- program ID, deployment signature, ProgramData address, and upgrade authority;
- mint, token program, decimals, total supply, revoked mint/freeze authority;
- distribution authority and ATA;
- platform, settlement, and treasury authorities;
- config PDA, treasury ATA, fee basis points, and claim window;
- initialization and smoke-test signatures.

## Abort Conditions

Stop before signing if the cluster is not devnet, a role is reused, simulation
fails, an account owner differs from the manifest, a PDA/ATA is noncanonical,
the binary hash differs, the mint exposes freeze authority, the requested supply
exceeds the cap, or transaction decoding does not exactly match the review.

If any post-transaction verification fails, pause the platform when possible,
do not publish client configuration, preserve logs/signatures, and start the
incident review. Never “fix forward” with an unreviewed authority or destination.
