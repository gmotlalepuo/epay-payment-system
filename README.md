# Digital Wallet

A peer-to-peer wallet for sending money and accepting payments via QR codes. Built with Next.js 16, Supabase, and Stripe.

## Quick start

```bash
npm install            # or: npx pnpm install
npm run dev            # default: http://localhost:3000
```

Required env vars in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>     # for seeding admin only
STRIPE_SECRET_KEY=<sk_test_...>                  # top-up flow
STRIPE_WEBHOOK_SECRET=<whsec_...>                # top-up flow
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<pk_test_...>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Then apply the schema:

1. Open Supabase Dashboard → SQL Editor.
2. Run [`lib/db/schema.sql`](lib/db/schema.sql) once on a fresh project.
3. Run [`lib/db/migrations/001-qr-redesign.sql`](lib/db/migrations/001-qr-redesign.sql) once.
4. If `/pay/<token>` links fail because `qr_codes_resolve` is missing, run [`lib/db/migrations/002-public-qr-resolver.sql`](lib/db/migrations/002-public-qr-resolver.sql).

## Roles

| Role | What they can do |
|---|---|
| `customer` | Wallets, P2P transfers, generate/pay QR codes, file complaints. |
| `super_admin` | Everything customers can do, plus admin dashboard, audit log access. |

## Core flows

**Receiving via QR.** Any user opens `/dashboard/qr-codes/new`, enters a description and price, submits. The platform issues a token, generates a PNG, and exposes a public link `/<host>/pay/<token>`. The QR encodes that URL.

**Paying via QR.** Scanning the QR opens the pay link in the scanner's browser. The page fetches `/api/qr-codes/resolve/<token>` (a `SECURITY DEFINER` Postgres function so unauthenticated requests can read it), shows the receiver, item, and price, then routes the user to login/signup if needed and back. On confirmation, the client calls `/api/transfers` with `{from_wallet_id, qr_code_id}`. The route invokes the `fn_transfer` Postgres function, which:

- locks both wallets (`FOR UPDATE`, in stable id order),
- validates balance and daily limit,
- debits + credits + inserts the transactions row,
- updates `qr_codes.paid_count` (and deactivates if `single_use`),
- replays a previous result if `idempotency_key` matches.

All in one SQL transaction — no hand-rolled rollback.

**Sending P2P.** `/dashboard/transfers` takes a wallet number and amount and calls the same `fn_transfer` without `qr_code_id`.

**Top up.** `/dashboard/topup` redirects to Stripe Checkout. The webhook at `/api/payments/webhook` listens for `payment_intent.succeeded` and credits the wallet.

## Tech

- Next.js 16, React 19, Tailwind 4, shadcn/ui
- Supabase (Postgres + Auth + RLS)
- Stripe (Checkout + webhooks)
- `qrcode` for image generation, browser `BarcodeDetector` for camera scanning where supported

## Things to know

- Default currency is **USD**. Wallets can be created in other currencies (EUR, GBP, ZAR, BWP) but the rest of the UI displays the `$` symbol — multi-currency formatting is not yet wired up end-to-end.
- `public.users` rows are auto-created via the `on_auth_user_created` trigger. The signup route just patches `phone_number` afterward.
- The `payments` / `merchants` / `settlements` tables from earlier iterations are gone; `transactions` covers transfers, payments, and top-ups uniformly.
- The pay landing page is publicly readable via the `qr_codes_resolve(token)` RPC. Anyone who has the URL can see the price and receiver name. That's the design — the URL is the secret.

## What's deliberately out of scope (for now)

- No KYC tiers, no transaction limits beyond `daily_spent`/`daily_limit`.
- No fraud / velocity / device fingerprinting.
- No agent network for cash-in / cash-out — Stripe Checkout is the only top-up path.
- No FX between currencies. Transfers between wallets of different currencies aren't validated yet.
- Balances are stored on `wallets.balance` and mutated atomically by `fn_transfer`. A double-entry journal is the right next step before this serves real money.
