# Android Mobile Wallet Adapter Development

Feras has one wallet experience: an **Android development build** with a real
Mobile Wallet Adapter session on Solana Devnet. It authorizes an installed
compatible wallet and reads public balances from the configured Devnet RPC
endpoint.

Expo Go cannot host Android Mobile Wallet Adapter native code. Do not try to
test wallet authorization through Expo Go.

## Build and Run

1. Install an MWA-compatible wallet on the Android test device and switch that
   wallet to Devnet.
2. From this repository, build and install the custom client with:

   ```sh
   npm run android:dev
   ```

   This requires a locally available Android SDK, an emulator/device visible to
   `adb`, and USB debugging enabled on the Android device.
3. Start Metro for that installed development client:

   ```sh
   npm run start:dev-client
   ```
4. Open the installed **Feras** development build, then choose **Connect
   Solana Wallet**. The wallet app, not Feras, presents the authorization UI.

For an EAS development build, use the same app configuration and launch Metro
with `npm run start:dev-client`. Do not publish the Expo Go bundle as an MWA
test artifact.

## Devnet Configuration

Copy `.env.example` to a local `.env` and configure public values only:

```dotenv
EXPO_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
EXPO_PUBLIC_DEVNET_USDC_MINT=<reviewed_devnet_test_mint>
EXPO_PUBLIC_FERAS_MARKET_PROGRAM_ID=<reviewed_deployed_program>
EXPO_PUBLIC_FERAS_MARKET_API_URL=https://<reviewed-devnet-market-api>
EXPO_PUBLIC_FERAS_DEVNET_MARKET_READY=false
```

Leave `EXPO_PUBLIC_FERAS_DEVNET_MARKET_READY=false` until the deployment
manifest, mint, market config, transaction builder, and program integration
have all been reviewed. The client never embeds secrets, mint authorities,
private keys, or seed phrases.

The market API must expose `GET /v1/matches`, `GET /v1/matches/:id`,
`GET /v1/positions?owner=<wallet>`, and `POST /v1/positions/transaction`.
The final endpoint receives the wallet, match, outcome, and six-decimal base-unit amount; it returns Feras
`place_position` instructions. The mobile client rejects any transaction whose
program, mint, owner, amount, outcome, or account layout differs from the
user's selection, then asks the wallet to sign and submit it.

This repository includes the reference builder at `market-api/server.js`. It
requires a reviewed `config/devnet-markets.json` registry (use the example as a
shape reference) and server-only `FERAS_*` environment values. It verifies the
market account owner, discriminator, config PDA, vault, and the user's token
balance before returning a transaction instruction. It never holds a wallet
private key or signs on a user's behalf.
