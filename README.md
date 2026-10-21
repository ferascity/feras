# Feras

Feras is an Android-first Solana Devnet chess-prediction app. Players follow
autonomous chess matches, connect an Android Mobile Wallet Adapter-compatible
wallet, and submit predictions using valueless Devnet test credit.

## Android APK

The signed Android APK is available from the GitHub release:

<https://github.com/ferascity/feras/releases/download/v1.0.0/Feras-v1.0.0.apk>

It is an ARM64 APK for physical Android devices. Install it directly, enable
unknown-app installation only for your browser/file manager when Android asks,
then return that permission to its previous state.

## Devnet Status

- Network: Solana Devnet only. No mainnet funds are accepted or requested.
- Program and platform configuration: verified on 19 October 2026.
- Test asset: fixed-supply, six-decimal Feras Devnet test-USDC. It is not
  Circle USDC, has no monetary value, and is not redeemable.
- Wallet path: Android Mobile Wallet Adapter. Expo Go and iOS do not provide
  the native wallet path.

The next Android release will enable real position signing after the public
market API, a newly created open market, and test-credit distribution service
have been deployed and independently smoke-tested. The source deliberately
keeps that action disabled until those live release inputs are verified.

## Repository Layout

- `app/`, `components/`, `services/`: Expo/React Native mobile experience.
- `programs/feras_market/`: Anchor market program.
- `market-api/`: transaction-building API; it never receives wallet private
  keys and returns only validated Devnet transaction instructions.
- `backend/`: PostgreSQL-backed match ledger, Stockfish/UCI coordinator,
  transcript hash chain, replay API, and market-lifecycle command worker.
- `admin/`: local authority-operated Devnet tool for market setup and test
  credit distribution.
- `docs/`: deployment, Android wallet, and protocol documentation.

## Local Development

```bash
npm install --legacy-peer-deps
npx expo start
```

For the native Android wallet flow, build and install the Android development
client or use the signed APK. Expo Go is suitable for UI preview only.

## Complete Backend Deployment

`docker-compose.yml` runs PostgreSQL, applies the durable schema, then starts
the API and coordinator as separate services. The API exposes:

- `GET /v1/matches?status=LIVE` for live arena data.
- `GET /v1/matches/:id` for the current authoritative position.
- `GET /v1/matches/:id/replay` for the persisted replay and PGN.
- `GET /v1/matches/:id/events?after=<sequence>` for incremental replay sync.
- `GET /v1/matches/:id/events/stream` for Server-Sent live match events.
- `GET /v1/matches/:id/transcript` to independently verify the event hash chain.
- `GET /readyz` for PostgreSQL-backed deployment readiness.

The backend records every legal UCI move, SAN, post-move FEN, PGN, clocks,
engine profile/settings, and an append-only SHA-256 transcript hash chain.
Its required host environment is:

```text
FERAS_DATABASE_URL=postgresql://...
FERAS_SOLANA_RPC_URL=<devnet RPC URL>
FERAS_PROGRAM_ID=3UJi7D53Cbj5TLGbbxFCzqW9vE7Ji5N5KKEdbQMWFaFA
FERAS_DEVNET_USDC_MINT=CwhBMtAs7tAHSabWrW2Dg2hgQ7Ktt7pW86UR35Be9VrU
FERAS_TREASURY_TOKEN_ACCOUNT=<reviewed Devnet treasury token account>
FERAS_PLATFORM_AUTHORITY=<dedicated automation authority public key>
FERAS_SETTLEMENT_AUTHORITY=<dedicated automation authority public key>
```

Start an authoritative match with:

```bash
npm run create:match -- --id gp-001 --title "Feras Devnet Grand Prix" --lock-at "2026-10-21T16:00:00Z"
```

`GET /healthz` reports whether the API is serving PostgreSQL-backed matches or
the legacy registry fallback. The API validates the program owner, config PDA,
vault, status, and lock time before it prepares any position instruction.

### Market signing boundary

By default the coordinator places `CREATE`, `LOCK`, and `SETTLE` commands in
`AWAITING_SIGNATURE`; it does not hold any authority secret. This is the only
correct mode while the platform and settlement authorities live in browser
wallet extensions.

For a fully autonomous **Devnet-only** coordinator, create dedicated automation
authority wallets with narrowly scoped Devnet funds, move the on-chain platform
and settlement roles to those addresses through the reviewed authority flow,
and configure their paths only as private host secrets:

```text
FERAS_MARKET_SIGNER_MODE=automated-devnet
FERAS_AUTOMATION_PLATFORM_KEYPAIR_PATH=/run/secrets/feras-platform.json
FERAS_AUTOMATION_SETTLEMENT_KEYPAIR_PATH=/run/secrets/feras-settlement.json
```

The worker checks those public keys against the configured authorities and
simulates every lifecycle transaction before sending it. Never use a Phantom or
Solflare recovery phrase/key export for this purpose, and never put key files
in GitHub, an APK, Docker images, or `EXPO_PUBLIC_*` values.

After the API and a fresh open market are verified, add these **GitHub Actions
repository variables** (not secrets) before making the next APK release:

```text
FERAS_MARKET_API_URL=https://<your-public-HTTPS-market-api>
FERAS_DEVNET_MARKET_READY=true
```

The Android release workflow embeds those public values along with the
reviewed Devnet program and test-mint addresses. Do not set the ready value
until the API health endpoint and a real wallet position have been verified.

## Safety

Never add a seed phrase, private key, keystore, wallet session, or authority
credential to this repository, the APK, or an `EXPO_PUBLIC_*` variable. Review
the Devnet runbook before any authority action.
