# Feras Web

The desktop web companion for Feras — autonomous chess agents competing for
on-chain markets on Solana Devnet.

Built with React 19, Vite, TypeScript, React Router, and Privy. The interface is
desktop-first and intentionally unavailable on small screens: below 1000px the
app shows a download gate instead of the product.

## Routes

| Route      | Purpose                                                                 |
| ---------- | ----------------------------------------------------------------------- |
| `/`        | Overview — live markets, featured game, arena stats and how it works.   |
| `/arena`   | Chess board, replay controls, matchup detail, and the position panel.    |
| `/train`   | Local agent drafts (name, engine, opening, aggression) for the v1 web.   |
| `/profile` | Privy identity, Solana wallet balances, Devnet faucet, market positions. |

## Requirements

- Node.js 20 or newer
- A browser with WebCrypto support (all current desktop browsers)
- The Feras Devnet market API for live markets and position transactions

## Run locally

```bash
cd ferasweb
npm install
npm run dev
```

The dev server runs at <http://localhost:5173>. Copy `.env.example` to `.env` if
you need to change defaults.

## Environment

| Variable                     | Default                        | Purpose                                      |
| ---------------------------- | ------------------------------ | -------------------------------------------- |
| `VITE_PRIVY_APP_ID`          | Feras Privy app ID             | Same Privy application as the mobile app.    |
| `VITE_PRIVY_CLIENT_ID`       | unset                          | Optional app client; see the Privy section.  |
| `VITE_FERAS_MARKET_API_URL`  | `https://dqrwnhn2nif0u.cloudfront.net` | Devnet market API base URL (use `http://127.0.0.1:8787` for a local API). |
| `VITE_SOLANA_RPC_URL`        | `https://api.devnet.solana.com`| Solana RPC used for balances and signing.    |
| `VITE_FERAS_MARKET_PROGRAM_ID` | Devnet Feras program         | Program that owns the market accounts.       |
| `VITE_DEVNET_USDC_MINT`      | Devnet test-USDC mint          | Mint checked by the position validator.      |
| `VITE_APP_STORE_URL`         | empty                          | App Store link used by the mobile gate.      |
| `VITE_PLAY_STORE_URL`        | empty                          | Google Play link used by the mobile gate.    |

Store links are placeholders. When they are empty, tapping a store button shows
a "coming soon" notice.

## Privy setup

The web app uses the **same Privy app** as the mobile app, so accounts, embedded
Solana wallets, and linked logins are shared.

The mobile app initializes Privy with its native app client ID. That client is
scoped to native identifiers and currently sends
`frame-ancestors 'self' disallowed` for browser requests, which blocks the Privy
embedded-wallet iframe. For that reason the web build starts with the app ID
only (the app-level configuration already allows `http://localhost:*`).

Before deploying, add every web origin to the Privy dashboard:

1. Open **Privy Dashboard → your app → Settings → Allowed origins**.
2. Add `http://localhost:5173` for development and the production origin
   `https://dllxy64bv69x8.cloudfront.net` (or your own domain in front of it).
3. If you specifically want to use the mobile app client on web, add the same
   origins to that app client and uncomment `VITE_PRIVY_CLIENT_ID` in `.env`.

Without the production origin, Privy cannot initialize. After 15 seconds the app
falls back to a usable signed-out interface with an explanatory notice on
Profile. Market data, replay, and drafts keep working, but sign-in and embedded
wallets require the allowed origin.

## Deployment (AWS)

The web app is published to a private S3 bucket and served through CloudFront
with an origin access control:

| Item | Value |
| --- | --- |
| URL | `https://dllxy64bv69x8.cloudfront.net` |
| Bucket | `feras-web-626771561529` (`eu-north-1`, public access blocked, AES256) |
| Distribution | `E5L31UR6TVPYT` (`PriceClass_100`, HTTP/2+3, IPv6) |
| SPA routing | `403`/`404` → `/index.html` with a `200` response |
| Cache | `index.html` no-store; hashed `assets/*` immutable for a year |

Publish a new build:

```bash
cd ferasweb
npm run build

BUCKET=feras-web-626771561529
aws s3 sync dist "s3://$BUCKET" --delete \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "index.html" --exclude "*.html" \
  --exclude "favicon.png" --exclude "logo.png"
aws s3 cp dist/index.html "s3://$BUCKET/index.html" \
  --cache-control "no-cache,no-store,must-revalidate" \
  --content-type "text/html; charset=utf-8"
for f in favicon.png logo.png; do
  aws s3 cp "dist/$f" "s3://$BUCKET/$f" --cache-control "public,max-age=86400"
done
aws cloudfront create-invalidation --distribution-id E5L31UR6TVPYT --paths "/*"
```

The bucket policy only allows `cloudfront.amazonaws.com` to read objects when
the request comes from this distribution (`AWS:SourceArn`).


## Market API

The web app talks to the existing Devnet market API in `../market-api`. Mobile
clients do not enforce CORS, so the server now sets CORS headers (default `*`,
configurable with `FERAS_CORS_ORIGINS`) and answers `OPTIONS` preflights.

Start it from the repository root:

```bash
FERAS_PROGRAM_ID=<program-id> \
FERAS_DEVNET_USDC_MINT=<devnet-usdc-mint> \
node market-api/server.js
```

It listens on `:8787` by default (`PORT` to override) and reads
`config/devnet-markets.json` unless `FERAS_MARKET_REGISTRY_PATH` or
`FERAS_MARKET_REGISTRY_JSON` is set. Restrict `FERAS_CORS_ORIGINS` to a
comma-separated allowlist (for example
`FERAS_CORS_ORIGINS=http://localhost:5173,https://feras.app`) in production.

When the API is unreachable the web app falls back to the bundled demo matches
in `src/data/demo-matches.json`. Demo matches are visibly marked and are
read-only: position controls stay disabled.

### Taking a position

1. Sign in with Privy. An embedded Solana wallet is created for users without one.
2. Get Devnet SOL from the faucet button on Profile (network fees).
3. Hold Devnet test-USDC for the connected wallet.
4. Open a registered live market in Arena, choose White / Draw / Black, enter a
   stake, and approve the transaction in the Privy wallet.

The web client re-validates the transaction returned by the API before signing:
program ID, nine-account layout, discriminator, outcome byte, amount, mint, and
owner. It refuses to sign if any of those do not match the UI selection.

### Private beta credits

Testers are invited with `/profile?invite=FERAS-BETA-XXXXXXXX`. The **Beta
credits** card on Profile claims a one-time starter grant (25 test-USDC + 0.25
SOL) from the backend float; the wallet signs a short message so the server knows
the address is really theirs. Once claimed, the same card can add more test
credit from Devnet SOL in one signed step, and Arena does it automatically when a
stake is larger than the wallet balance. Invite creation, float top-ups, the
endpoints, and the safety rails are documented in
[`../docs/PRIVATE_BETA.md`](../docs/PRIVATE_BETA.md).

## Scripts

```bash
npm run dev        # Vite dev server
npm run typecheck  # TypeScript project build check
npm run build      # typecheck + production bundle
npm run preview    # serve the production bundle
```

## Implementation notes

- **Design tokens** live in `src/styles/tokens.css`: Obsidian surfaces, emerald
  and cyan accents, Geist / Geist Mono, restrained radii and motion.
- **Desktop gate** is a `matchMedia('(min-width: 1000px)')` check in `App.tsx`.
  Privy and the wallet provider only mount on desktop, so the mobile gate makes
  no auth requests.
- **Arena replay** uses the normalized `replay.moves` from the market API. When a
  market has no replay data, the board shows its current FEN and the controls are
  disabled.
- **Train** is a local v1: drafts are stored in `localStorage` under
  `ferasweb.agent-drafts.v1`. Real training and on-chain agent ownership are
  planned for the mobile app.
- **Demo fallback** marks every bundled match with `isDemo`, disables betting,
  and surfaces the API error in the overview notice.
