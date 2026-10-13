# Feras Chain Integration

This document is the handoff contract between the Feras mobile/API code and the
Anchor market program. It describes the current local artifact, not a deployed
or audited service.

## Current Status

- Program: `feras_market` (`0.1.0`)
- Program ID: `3UJi7D53Cbj5TLGbbxFCzqW9vE7Ji5N5KKEdbQMWFaFA`
- Anchor: `0.30.1`
- Solana CLI: `1.18.23`
- Token program: original SPL Token Program
- Asset invariant: the configured mint must have exactly six decimals
- Claim window: configured once at initialization, from one second to 180 days
- Deployment: **not deployed to localnet, devnet, or mainnet**
- Initialization: **not initialized**

The mobile config exposes the public address as
`FERAS_MARKET_PROGRAM_ID`. An `EXPO_PUBLIC_FERAS_MARKET_PROGRAM_ID` override is
allowed for a future reviewed deployment; an address in configuration is not
proof that a program is deployed.

`target/deploy/feras_market.so`, `target/idl/feras_market.json`, and
`target/types/feras_market.ts` are generated build artifacts and are ignored by
Git. Rebuild them from the checked-in Rust source before use.

## Canonical Inputs

The backend owns canonicalization. Mobile clients must not invent match hashes,
results, payouts, or account addresses.

```text
match_id_hash = sha256(UTF8(canonical_match_id))
transcript_hash = sha256(canonical_hash_chained_match_transcript)
amount = decimal USDC amount converted to u64 base units (10^6)
client_nonce = stable unsigned 64-bit value generated once per position request
```

Never convert token amounts through JavaScript floating-point arithmetic. Parse
the decimal string into six base-unit digits and reject extra precision.

## Program-Derived Addresses

```text
config   = PDA(program_id, ["config"])
market   = PDA(program_id, ["market", match_id_hash])
position = PDA(program_id, ["position", market, owner, client_nonce_le_u64])
vault    = ATA(owner = market PDA, mint = configured accepted mint)
```

The `client_nonce` is part of the position identity. A retry must reuse the
original nonce so that duplicate submission fails deterministically instead of
creating a second position.

## Instruction Ownership

| Instruction | Signer | Expected caller |
| --- | --- | --- |
| `initialize_config` | platform authority | one-time deployment runbook |
| `propose_authority` | current platform authority | two-step rotation runbook |
| `accept_authority` | pending platform authority | two-step rotation runbook |
| `update_settlement_authority` | platform authority | signer rotation runbook |
| `update_treasury` | platform authority | treasury rotation runbook |
| `create_market` | platform authority | market service |
| `place_position` | position owner | Android wallet through MWA |
| `lock_market` | platform authority | market service |
| `settle_market` | settlement authority | restricted settlement worker |
| `claim` | position owner | Android wallet through MWA |
| `cancel_market` | platform authority | incident/market service |
| `claim_refund` | position owner | Android wallet through MWA |
| `set_paused` | platform authority | incident runbook |
| `sweep_remainder` | permissionless | indexer crank or any caller |

Pausing blocks new markets and positions. Claims and refunds remain available.
Platform, settlement, and treasury authorities are nonzero and pairwise
distinct. Treasury updates require a token account for the accepted mint whose
SPL owner equals the declared new treasury authority.

## State Machine

```text
Open -> Locked -> Settled -> Closed
  |       |
  +-------+-> Cancelled
```

- Positions are accepted only while `Open` and strictly before `lock_time`.
- Settlement requires `Locked`, a non-empty transcript hash, and a non-empty
  winning pool.
- A settled position can claim only when its outcome won.
- Settlement records `claim_deadline = chain_time + claim_window_seconds`.
- Winning claims are accepted through the deadline, inclusive.
- After the deadline, `sweep_remainder` transfers the complete vault balance to
  the configured treasury and permanently changes the market to `Closed`.
- A cancelled position can refund its original amount.
- A position can be claimed or refunded once, never both.

## Accounting

The pool order is `[White, Draw, Black]`. All values are `u64` token base units.

```text
fee = floor(total_pool * fee_basis_points / 10_000)
net_pool = total_pool - fee
payout = floor(position_amount * net_pool / winning_pool)
```

The fee is capped at 1,000 basis points. Integer division can leave a small
remainder in the vault. After the configured claim window, a permissionless
instruction sweeps that remainder and any abandoned winning payouts to the
configured treasury. Its accounts cannot redirect the destination.

## Mobile/API Boundary

Expo Go cannot connect a wallet or submit a position. The Android custom
development build uses `@wallet-ui/react-native-kit` and
Android Mobile Wallet Adapter to authorize a compatible wallet. It reads the
connected address's Devnet SOL balance and the configured Devnet test-USDC mint
directly from RPC. The app intentionally keeps position creation disabled until
`EXPO_PUBLIC_DEVNET_USDC_MINT`, a reviewed deployed program address, and
`EXPO_PUBLIC_FERAS_DEVNET_MARKET_READY=true` have all been published after the
release gates below.

The production Android transaction path should follow this sequence:

1. API returns canonical market state and an unsigned transaction preview.
2. App displays outcome, amount, estimate, fee, mint, program, and devnet label.
3. Android MWA wallet signs and submits the serialized transaction.
4. App records `submitted`; it does not decrement balance optimistically.
5. Indexer validates program ID, event, mint, PDAs, and commitment.
6. Confirmed chain state updates activity, balances, and explorer receipt.

The API transaction builder must return the `client_nonce`, blockhash expiry,
market version, correlation ID, and a human-readable instruction summary.

## Pre-Deployment Gates

The current local-validator suite verifies six-decimal initialization, real SPL
Token deposits, pause/unpause, duplicate nonce protection, wrong-mint rejection,
late-position rejection, empty-winning-pool rejection, settlement-authority and
position-owner constraints, exact fee/payout balances, duplicate claim,
repeated settlement, cancellation, full refunds in arbitrary order, and
duplicate-refund rejection. It also verifies reverse-order winner claims,
Clock-sysvar expiry, treasury redirection rejection, exact rounding residue,
the final `Closed` state, invalid lock-time creation, and position rejection at
the accepted market's chain-clock boundary. Every instruction has an explicit
account-substitution rejection: invalid mint treasury ownership at
initialization; attacker platform authority for market creation, pause, lock,
and cancellation; foreign vault placement; wrong settlement authority and
redirected settlement treasury; attacker position owner for claim and refund;
redirected sweep treasury; unauthorized platform proposals and rotation calls;
wrong pending-authority acceptance; shared authority roles; and mismatched new
treasury ownership. The Rust suite deterministically generates 5,000 pools with
varied fees, up to 64 winners, shuffled claim orders, large stake partitions,
and near-`u64` values. Run everything with `npm run test:program`.

Run `npm run verify:program:repro` to build the SBF program twice, fully offline,
with separate target directories and deterministic build environment values.
The 2026-10-11 verification produced identical 451,888-byte artifacts with
SHA-256 `1b3fa25010eed8a57222f9df0db1928c1effb5ec7101c9d7c25fd6c6fd484b9c`.
This proves repeatability on the pinned local toolchain; a release still needs a
recorded containerized/verifiable build and deployment provenance.

Remaining gates:

1. Add continuous mutation/fuzz tooling in CI beyond the deterministic generated
   accounting corpus.
2. Produce and record the final containerized/verifiable release build.
3. Assign the reviewed managed/multisig public addresses and execute the capped
   six-decimal devnet mint ceremony in `DEVNET_RELEASE_RUNBOOK.md`.
4. Threat-model and independently review the program before using valuable
   assets.
5. Deploy only after an explicit operator approval and record the signature,
   binary hash, program-data authority, mint, config PDA, and treasury account.

No private key, seed phrase, mint authority, or settlement key belongs in the
mobile bundle or repository.
