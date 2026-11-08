# Feras Private Beta — Tester Funding

The beta is invite-only. A tester signs in with Privy, gets an embedded Solana
wallet, and claims a one-time starter grant of **25 test-USDC + 0.25 SOL**.
Later top-ups will be paid in SOL and converted invisibly (Phase 2).

Test-USDC is **valueless devnet credit**. It is not Circle USDC and cannot be
redeemed. The UI labels it "Devnet test credit".

## How a tester joins

1. Operator creates an invite code (see below).
2. Tester opens `https://<web-origin>/profile?invite=FERAS-BETA-XXXXXXXX` and
   signs in with the same Privy account as the mobile app.
3. The **Beta credits** card on Profile shows the claim button. The tester signs
   a short message (proves wallet ownership) and the backend sends both assets in
   one atomic transaction.
4. The card reports "Funded" with an explorer link. The arena works immediately.

The invite code is captured into local storage so it survives sign-in and
navigation.

## Invite codes

Codes are rows in `beta_invites`. They are single-use by default, can carry a
different starter amount, and can be revoked.

Run from the API container (the image ships `scripts/`):

```bash
# create 10 single-use codes
docker compose --env-file .env.aws -f docker-compose.yml -f docker-compose.aws.yml \
  exec -T api node scripts/create-beta-invites.js --count 10 --label "cohort-1"

# a reusable code, max 3 claims, custom grant
... node scripts/create-beta-invites.js --code FERAS-BETA-FOUNDER --max-claims 3

# inspect / revoke
... node scripts/create-beta-invites.js --list
... node scripts/create-beta-invites.js --revoke FERAS-BETA-7K2M
```

Set `FERAS_BETA_WEB_ORIGIN=https://app.example.com` so the printed links are
production links instead of `http://localhost:5173`.

## The beta float

Grants are paid from a single HOT float wallet, not from the 1,000,000 test-USDC
vault. The vault key stays in the operator's browser wallet; the float holds a
bounded amount.

| Item | Value |
| --- | --- |
| Float address | `GkuWk8sLYWsquzUK2bh1uTzhgZMa6YT1R3H7xAbBFYhA` (devnet) |
| Suggested float | 25,000 test-USDC + 2 SOL |
| Key storage | SSM SecureString `/feras/beta/treasury-secret`, mirrored into `/opt/feras/.env.aws` (0600) |
| Vault | distribution ATA `GaW4XX…z9ce` holds the fixed 1,000,000 supply |

Top up the float by signing a transfer in the admin console (`admin/`, connects
the distribution authority `6RCii…`) with the float address as the recipient.
The transfer creates the float's token account automatically.

The float can never mint: the mint authority was revoked. Worst case if the hot
key leaks is the loss of the float, which is test credit.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/v1/beta/status?owner=<wallet>` | eligibility, grant state, float health, limits |
| `POST` | `/v1/beta/claim` | `{ code, wallet, issuedAt, signature }` → atomic grant |

`signature` is base64 of the wallet's ed25519 signature over
`feras-beta-claim:v1:<wallet>:<CODE>:<issuedAt>`. The server rejects signatures
older than five minutes, bad signatures, revoked/expired/exhausted codes, and
second claims.

## Safety rails

- **One grant per wallet**, enforced by a partial unique index on
  `beta_ledger(wallet) WHERE kind='STARTER_GRANT' AND status <> 'FAILED'`.
- Failed sends mark the ledger row `FAILED` and return the invite slot, so a
  retry is safe. A wallet can never be paid twice.
- `FERAS_BETA_DISABLED=true` is the kill switch; claims return 503 while status
  keeps working.
- Every grant is recorded in `beta_ledger` with amounts, signature, and error.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `FERAS_BETA_TREASURY_SECRET_KEY` | — | JSON key array (or base58) for the float |
| `FERAS_BETA_TREASURY_ADDRESS` | — | Expected float address; mismatch disables claims |
| `FERAS_BETA_STARTER_SOL` | `0.25` | Fallback starter SOL (invites store their own) |
| `FERAS_BETA_STARTER_USDC` | `25` | Fallback starter test-USDC |
| `FERAS_BETA_SOL_TO_USDC` | `150` | Phase 2 top-up rate |
| `FERAS_BETA_DISABLED` | `false` | Kill switch |

## Before inviting real testers

1. Add the web origin (`http://localhost:5173` and the production domain) to the
   Privy app's allowed origins. Without it, sign-in cannot complete.
2. Fund the float (see above). `/v1/beta/status` reports
   `"canClaim": false` until the float holds at least one full grant.
3. Create codes and share the links.

## Not built yet (Phase 2)

- SOL → test-USDC top-up: one atomic transaction (SOL transfer + ATA create +
  transfer from float), fixed rate 1 SOL = 150 test-USDC, per-wallet and global
  daily caps. The float and `beta_ledger` already model it.
- Arena CTA that offers "Pay with SOL" instead of "Insufficient USDC".
- Android parity; the mobile `services/solana/swapService.ts` still fakes the
  conversion in AsyncStorage and must be replaced with these endpoints.
