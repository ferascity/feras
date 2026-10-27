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

## Creating And Locking A First Market

The Admin page is local-only. Do not deploy it beside the public API and do not
put a platform-authority key on the backend host.

1. Create a new backend match with a canonical ID and a lock time at least five
   minutes in the future. The deployed service must use the same ID and lock
   time that the Admin page will use.
2. In the local Admin page, connect the configured platform authority on
   Devnet, enter that exact ID, title, and lock time, then approve only the
   displayed `create_market` transaction.
3. Copy the confirmed transaction signature, market PDA, and vault ATA from
   the page. On the private backend host, confirm the creation command:

   ```bash
   npm run confirm:market -- \
     --id <canonical-match-id> \
     --market <market-pda> \
     --vault <vault-ata> \
     --signature <create-market-signature> \
     --command CREATE
   ```

4. Before the lock time, users may submit positions. At or after the exact
   lock time, use the Admin page's **Lock Devnet Market** section with the same
   platform authority. It refuses to prepare a lock transaction early.
5. Confirm the lock signature privately using the same command with
   `--command LOCK`. The backend then transitions the match to `LIVE` and the
   Stockfish coordinator can begin.

The script derives the market PDA and vault from the canonical match ID and
checks the confirmed Devnet transaction, Feras program ownership, and accepted
mint before changing backend state.
