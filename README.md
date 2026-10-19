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

## Market API Deployment

The API is container-ready through `Dockerfile`. Its required host environment
is public Devnet configuration only:

```text
FERAS_SOLANA_RPC_URL=<devnet RPC URL>
FERAS_PROGRAM_ID=3UJi7D53Cbj5TLGbbxFCzqW9vE7Ji5N5KKEdbQMWFaFA
FERAS_DEVNET_USDC_MINT=CwhBMtAs7tAHSabWrW2Dg2hgQ7Ktt7pW86UR35Be9VrU
FERAS_MARKET_REGISTRY_JSON=<reviewed JSON array of open market metadata>
```

`GET /healthz` is available for deployment checks. The API validates the
program owner, config PDA, vault, status, and lock time before it prepares any
position instruction.

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
