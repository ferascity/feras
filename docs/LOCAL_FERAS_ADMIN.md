# Local Feras Admin

This is a developer-only, loopback-only page for the Feras Devnet authority
handoffs. It is deliberately separate from the Expo application and must never
be deployed as a public site.

## Safety model

- Solflare or Phantom keeps the new authority key in the extension.
- `FERAS_ADMIN_KEYPAIR` is read only by the local Node process. It is used only
  to pre-sign the exact `SetAuthorityChecked` transaction for the deployed
  Feras program; it is never sent to the browser.
- The server binds to `127.0.0.1`, validates the full transaction shape before
  broadcasting, and rejects any extra instruction, different account, or
  different authority.
- The Helius RPC credential is read from ignored `config/devnet-release.env`.
  Do not put it in `EXPO_PUBLIC_*` configuration.

## Start

```bash
FERAS_ADMIN_KEYPAIR=/home/code/multihopper-bounty-keypair.json npm run start:admin
```

Open `http://127.0.0.1:8787` in the same desktop browser that has Solflare or
Phantom installed. The page refuses a connected wallet whose address differs
from the configured role.

## Handoff order

1. In Solflare, select Devnet and the upgrade authority account. Review the
   checked loader handoff. It should include only the Feras ProgramData account,
   temporary CLI authority, new authority, and `SetAuthorityChecked`.
2. Switch Solflare to the funded platform authority account. Choose the fee and
   claim window, then initialize the config PDA. A 2% fee is `200` basis points;
   30 days is `2592000` seconds.
3. Verify with `npm run verify:devnet-deployment` after the config transaction
   confirms. Only then set `EXPO_PUBLIC_FERAS_DEVNET_MARKET_READY=true` and add
   a reviewed server-side market registry.

The settlement, treasury, and distribution authority accounts must not sign
either of these two setup transactions.
