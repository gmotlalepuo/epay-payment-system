# Digital Wallet App Technical Documentation

Last updated: 2026-06-08

This document describes the current Digital Wallet web application and the backend contracts needed to build a mobile application from it. It covers architecture, database model, authentication, APIs, payments, QR flows, notifications, admin functions, and mobile-specific implementation guidance.

## 1. Product Summary

Digital Wallet is a peer-to-peer wallet and QR payment system.

Core capabilities:

- Customer signup/login through Supabase Auth.
- Customer profile management.
- Wallet creation, wallet naming, wallet listing, and wallet detail.
- Wallet-to-wallet money transfer by wallet number.
- QR payment requests that encode a public payment URL.
- Logged-in wallet payment against a QR code.
- Guest card payment against a QR code through Stripe Checkout.
- Wallet top-up through Stripe Checkout.
- Transaction history with source, sender, receiver, and payment method context.
- In-app notifications.
- Complaints/dispute submission.
- Super admin user management and admin dashboard.

Current stack:

- Next.js 16 App Router
- React 19
- Supabase Auth, Postgres, RLS
- Stripe Checkout and PaymentIntent webhooks
- Tailwind CSS and shadcn/ui for the web UI
- `qrcode` package for QR image generation
- Browser `BarcodeDetector` usage in the web QR scanner where supported

## 2. High-Level Architecture

```text
Web/Mobile Client
  |
  | Auth/session
  v
Supabase Auth
  |
  | User JWT/session
  v
Next.js API Routes
  |
  | Server-side Supabase client, service role where required
  v
Supabase Postgres
  |
  | Wallet balances, transactions, QR codes, notifications
  v
Stripe
  |
  | Checkout redirect + webhooks
  v
Next.js payment webhook/reconcile endpoints
```

Important architecture decisions:

- Wallet-to-wallet transfers are performed by the Postgres function `public.fn_transfer`.
- `fn_transfer` locks both wallets, validates ownership, validates limits, debits one wallet, credits the other wallet, inserts the transaction row, and updates QR usage when applicable.
- Stripe top-ups and guest QR card payments are credited server-side only.
- Stripe webhook is the authoritative production path.
- Success-page reconciliation endpoints are also present to handle local/dev environments where webhooks may not reach the app.
- Transaction history is normalized through `/api/transfers`, which enriches transaction rows with sender/receiver labels and source labels.

## 3. Repository Map

Important directories:

```text
app/
  api/
    auth/
    wallets/
    transfers/
    qr-codes/
    payments/
    notifications/
    complaints/
    admin/
  dashboard/
  pay/[token]/
components/
lib/
  auth.ts
  notifications.ts
  guest-qr-card-payments.ts
  supabase/
  db/
    schema.sql
    migrations/
docs/
```

Key backend files:

- `app/api/transfers/route.ts`: wallet transfers, QR wallet payments, transaction history.
- `app/api/wallets/route.ts`: wallet list and create.
- `app/api/wallets/[id]/route.ts`: wallet detail and rename.
- `app/api/qr-codes/route.ts`: create and list QR codes.
- `app/api/qr-codes/[id]/route.ts`: activate/deactivate QR code.
- `app/api/qr-codes/resolve/[token]/route.ts`: public QR resolver.
- `app/api/qr-codes/card-checkout/route.ts`: guest card checkout session creation.
- `app/api/qr-codes/reconcile-card-session/route.ts`: guest QR card success-page reconciliation.
- `app/api/payments/create-checkout/route.ts`: wallet top-up checkout creation.
- `app/api/payments/reconcile-session/route.ts`: top-up success-page reconciliation.
- `app/api/payments/webhook/route.ts`: Stripe webhook.
- `lib/guest-qr-card-payments.ts`: shared guest QR card payment crediting logic.
- `lib/notifications.ts`: notification helpers and service-role client creation.

## 4. Environment Variables

Required:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-or-publishable-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
STRIPE_SECRET_KEY=<sk_test_or_live>
STRIPE_WEBHOOK_SECRET=<whsec>
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<pk_test_or_live>
NEXT_PUBLIC_SITE_URL=https://<your-web-domain>
```

Optional:

```env
NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL=http://localhost:3000/auth/callback
```

Mobile notes:

- The mobile app can use `NEXT_PUBLIC_SUPABASE_URL` and the Supabase anon key.
- Never ship `SUPABASE_SERVICE_ROLE_KEY` or `STRIPE_SECRET_KEY` in the mobile app.
- Stripe Checkout should be opened in an external browser or in-app browser, then returned using universal links or deep links.

## 5. Current Database Model

The active database shape is the base schema plus migrations. The QR redesign migration is the canonical model for the current app.

Apply in this order on a fresh Supabase project:

1. `lib/db/schema.sql`
2. `lib/db/migrations/001-qr-redesign.sql`
3. `lib/db/migrations/002-add-notification-link-url.sql`
4. `lib/db/migrations/002-public-qr-resolver.sql`
5. `lib/db/migrations/003-fix-fn-transfer-reference-id.sql`
6. `lib/db/migrations/004-fix-fn-transfer-gen-random-bytes.sql`
7. `lib/db/migrations/005-unique-stripe-payment-intents.sql`
8. `lib/db/migrations/006-guest-card-payer-details.sql`
9. `lib/db/migrations/007-transaction-counterparty-snapshots.sql`

### 5.1 users

Purpose:

- Public profile row linked to `auth.users`.
- Stores role and status used by app/admin logic.

Important fields:

```text
id UUID primary key, references auth.users(id)
email text
phone_number text
first_name text
last_name text
role text: customer | super_admin
status text: active | inactive | suspended | blocked
email_verified boolean
phone_verified boolean
two_factor_enabled boolean
created_at timestamptz
updated_at timestamptz
```

Notes:

- `public.users` rows are expected to be auto-created from Supabase Auth by trigger.
- Several API routes also backfill missing `public.users` rows.
- Mobile app should treat Supabase Auth as identity source and `public.users` as profile/role source.

### 5.2 wallets

Purpose:

- Stores user wallet balances and limits.

Important fields:

```text
id UUID primary key
user_id UUID references users(id)
wallet_number text unique
name text nullable
currency text
balance decimal
available_balance decimal
reserved_balance decimal
daily_limit decimal
monthly_limit decimal
daily_spent decimal
monthly_spent decimal
last_reset_date date
status text: active | frozen | closed
created_at timestamptz
updated_at timestamptz
```

Notes:

- Current code uses `balance` as the authoritative balance.
- `available_balance` and `reserved_balance` exist in older schema but are not consistently used by current flows.
- Transfers validate `daily_limit` and `daily_spent`.
- Wallets must be `active` to send/receive transfers.

### 5.3 transactions

Purpose:

- Canonical ledger-like table for transfers, wallet QR payments, top-ups, guest card payments, refunds, and adjustments.

Important fields:

```text
id UUID primary key
from_wallet_id UUID nullable
to_wallet_id UUID nullable
type text: transfer | topup | payment | refund | adjustment
amount decimal
currency text
status text: pending | processing | completed | failed | cancelled | reversed
reference_id text unique
description text nullable
qr_code_id UUID nullable
stripe_payment_intent_id text nullable
idempotency_key text nullable unique
failure_reason text nullable
guest_payer_name text nullable
guest_payer_email text nullable
sender_display_name text nullable
sender_wallet_number text nullable
receiver_display_name text nullable
receiver_wallet_number text nullable
created_at timestamptz
completed_at timestamptz nullable
updated_at timestamptz
```

Transaction source conventions:

- `from_wallet_id != null` and `to_wallet_id != null`, `type='transfer'`: wallet-to-wallet transfer.
- `from_wallet_id != null` and `to_wallet_id != null`, `type='payment'`, `qr_code_id != null`: logged-in wallet QR payment.
- `from_wallet_id = null`, `to_wallet_id != null`, `type='topup'`: Stripe top-up.
- `from_wallet_id = null`, `to_wallet_id != null`, `type='payment'`, `stripe_payment_intent_id != null`: guest card QR payment.

Idempotency and uniqueness:

- `idempotency_key` dedupes wallet transfer calls.
- `stripe_payment_intent_id` has a partial unique index from migration 005 to prevent duplicate Stripe credits.

### 5.4 qr_codes

Purpose:

- Stores payment requests that can be rendered as QR codes and resolved by public token.

Important fields:

```text
id UUID primary key
wallet_id UUID references wallets(id)
token text unique
description text
amount decimal
currency text
qr_image_url text
single_use boolean
is_active boolean
paid_count int
expiry_at timestamptz nullable
created_at timestamptz
updated_at timestamptz
```

Notes:

- QR code URL is `/pay/<token>`.
- Public resolver returns enough data to show receiver, amount, currency, and payable status.
- Single-use QR codes are deactivated after first successful payment.

### 5.5 notifications

Purpose:

- In-app notification feed and notification bell.

Important fields:

```text
id UUID primary key
user_id UUID references users(id)
title text
message text
link_url text nullable
category text: payment | security | wallet | complaint | merchant | system
type text: transaction | security | wallet | complaint | system
reference_id UUID nullable
is_read boolean
read_at timestamptz nullable
created_at timestamptz
updated_at timestamptz
```

### 5.6 complaints

The complaint table in the current app code expects:

```text
id UUID
user_id UUID
transaction_id UUID nullable
complaint_type text
status text
priority text
title text
description text
attachment_urls array/json
created_at timestamptz
updated_at timestamptz
```

Note:

- The base schema contains an older complaint shape with fields like `ticket_number`, `category`, and `subject`.
- The mobile app should verify the deployed Supabase table shape before implementing complaints.

### 5.7 audit_logs

Purpose:

- Records user/admin/system actions.

Current code inserts fields such as:

```text
user_id
action
resource_type
resource_id
details
status
error_message
created_at
```

Note:

- The base schema uses older names `entity_type` and `entity_id`, but current app code uses `resource_type` and `resource_id`.
- Verify deployed Supabase schema before mobile/admin reporting work.

## 6. Database Functions

### 6.1 public.fn_transfer

Source:

- `lib/db/migrations/004-fix-fn-transfer-gen-random-bytes.sql`

Signature:

```sql
public.fn_transfer(
  p_from_wallet_id UUID,
  p_to_wallet_id UUID,
  p_amount DECIMAL,
  p_description TEXT DEFAULT NULL,
  p_qr_code_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE (transaction_id UUID, reference_id TEXT, status TEXT)
```

Responsibilities:

- Reads authenticated user through `auth.uid()`.
- Replays an existing transaction when `p_idempotency_key` matches.
- Locks source and destination wallets in stable ID order to avoid deadlocks.
- Validates source wallet belongs to authenticated user.
- Prevents same-wallet transfers.
- Validates both wallets are active.
- Validates sufficient balance.
- Validates source daily limit.
- Debits source wallet balance.
- Increments source `daily_spent`.
- Credits destination wallet balance.
- Inserts transaction row.
- Sets type to `payment` when `p_qr_code_id` is supplied, otherwise `transfer`.
- Increments QR `paid_count`.
- Deactivates single-use QR codes after payment.

Returned response:

```json
{
  "transaction_id": "uuid",
  "reference_id": "TXN20260608123456ABCD1234",
  "status": "completed"
}
```

Mobile implication:

- Do not perform wallet balance mutations directly from mobile.
- Use `/api/transfers`, or build a mobile-safe backend endpoint that calls this function.

## 7. Authentication and Session Model

Current web app:

- Uses Supabase Auth.
- Uses `@supabase/ssr`.
- Server API routes read the authenticated user from Supabase cookies.
- `proxy.ts` refreshes sessions via cookies.

Mobile app:

- Use the Supabase mobile SDK for login/signup/session refresh.
- Store Supabase session securely.
- Call Supabase directly for simple reads only if RLS allows it.
- For balance mutations and Stripe operations, call backend API endpoints.

Important mobile compatibility issue:

The existing Next.js API routes currently expect browser Supabase cookies. A mobile app using bearer tokens will not automatically satisfy `createClient()` cookie-based auth.

Recommended mobile backend adaptation:

1. Add a server helper that accepts `Authorization: Bearer <access_token>`.
2. Create a Supabase server client with that JWT, or call `supabase.auth.getUser(token)`.
3. Use that helper in API routes so both web cookies and mobile bearer tokens work.

Example mobile request header:

```http
Authorization: Bearer <supabase_access_token>
Content-Type: application/json
```

## 8. Roles and Access Control

Roles:

```text
customer
super_admin
```

Customer can:

- Manage own profile.
- Create/list/rename own wallets.
- Send money from own wallet.
- Receive money to own wallet.
- Create/list/update QR codes for own wallets.
- View own transactions.
- View and update own notifications.
- Submit and list own complaints.

Super admin can:

- Access admin dashboard.
- List users.
- View user detail.
- Update user role/status.
- Delete public user row.
- View admin-level metrics and recent transactions.

## 9. API Contract Reference

All authenticated routes currently rely on Supabase cookie auth in the web app. For mobile, add bearer-token support as described above.

### 9.1 POST /api/auth/signup

Purpose:

- Create Supabase Auth user.

Request:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Validation:

- `email` required.
- `password` required.
- Password must be at least 8 characters.

Success:

```json
{
  "message": "Signup successful. Please check your email to confirm your account.",
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  }
}
```

Errors:

- `400` missing fields or short password.
- `409` signup conflict/auth error.
- `500` unexpected failure.

Mobile note:

- Mobile can also use Supabase SDK `signUp` directly, but should match redirect/deep-link configuration.

### 9.2 POST /api/auth/login

Purpose:

- Authenticate by email/password.

Request:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Success:

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  }
}
```

Mobile note:

- Prefer Supabase SDK `signInWithPassword` in mobile so the app receives access and refresh tokens.

### 9.3 GET /api/users/profile

Purpose:

- Get current user's profile row.
- Backfills missing `public.users` row when needed.

Success:

```json
{
  "profile": {
    "id": "uuid",
    "email": "user@example.com",
    "phone_number": "+267...",
    "first_name": "Jane",
    "last_name": "Doe",
    "role": "customer",
    "status": "active"
  }
}
```

### 9.4 PUT /api/users/profile

Purpose:

- Update profile fields.

Request:

```json
{
  "first_name": "Jane",
  "last_name": "Doe",
  "phone_number": "+267..."
}
```

Success:

```json
{
  "profile": {}
}
```

### 9.5 GET /api/wallets

Purpose:

- List current user's wallets.
- Backfills profile row if missing.

Success:

```json
{
  "wallets": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "wallet_number": "W...",
      "name": "Main wallet",
      "currency": "BWP",
      "balance": 100.00,
      "daily_limit": 10000.00,
      "daily_spent": 250.00,
      "status": "active",
      "created_at": "..."
    }
  ]
}
```

### 9.6 POST /api/wallets

Purpose:

- Create wallet.

Request:

```json
{
  "name": "Main wallet",
  "currency": "BWP"
}
```

Success:

```json
{
  "wallet": {
    "id": "uuid",
    "wallet_number": "W...",
    "name": "Main wallet",
    "currency": "BWP",
    "balance": 0,
    "status": "active"
  },
  "message": "Wallet created successfully"
}
```

Notes:

- Current default in this route is `USD` when currency is omitted.
- The QR redesign migration defaults DB currency to `BWP`.
- Mobile should always send an explicit currency.

### 9.7 GET /api/wallets/[id]

Purpose:

- Get wallet detail, wallet QR codes, and last 20 transactions for that wallet.

Success:

```json
{
  "wallet": {},
  "qrCodes": [],
  "transactions": []
}
```

Errors:

- `401` unauthenticated.
- `403` wallet does not belong to user.
- `404` not found.

### 9.8 PATCH /api/wallets/[id]

Purpose:

- Rename wallet.

Request:

```json
{
  "name": "Savings"
}
```

Success:

```json
{
  "wallet": {}
}
```

### 9.9 POST /api/transfers

Purpose:

- Send wallet-to-wallet money.
- Pay a QR code from a logged-in wallet.

Wallet-to-wallet request:

```json
{
  "from_wallet_id": "uuid",
  "to_wallet_number": "W...",
  "amount": 50.00,
  "description": "Lunch",
  "idempotency_key": "mobile-generated-unique-key"
}
```

QR wallet payment request:

```json
{
  "from_wallet_id": "uuid",
  "qr_code_id": "uuid",
  "idempotency_key": "mobile-generated-unique-key"
}
```

Success:

```json
{
  "transaction_id": "uuid",
  "reference_id": "TXN...",
  "status": "completed"
}
```

Validation/errors:

- `from_wallet_id` required.
- Either `to_wallet_number` or `qr_code_id` required.
- Recipient wallet must exist.
- Amount must be greater than zero for wallet-number transfer.
- `fn_transfer` may return: insufficient balance, daily limit exceeded, inactive wallet, same wallet, not found.

Mobile notes:

- Always send an idempotency key.
- Generate idempotency key client-side per payment attempt.
- Example: `transfer:<fromWalletId>:<recipient>:<amount>:<uuid>`.
- Do not retry with a new idempotency key unless the user explicitly starts a new payment.

### 9.10 GET /api/transfers

Purpose:

- Returns full transaction history for current user's wallets.
- Used by `/dashboard/transactions`.

Success:

```json
{
  "transactions": [
    {
      "id": "uuid",
      "from_wallet_id": "uuid-or-null",
      "to_wallet_id": "uuid-or-null",
      "type": "transfer",
      "amount": 50.00,
      "currency": "BWP",
      "status": "completed",
      "reference_id": "TXN...",
      "description": "Lunch",
      "qr_code_id": null,
      "stripe_payment_intent_id": null,
      "guest_payer_name": null,
      "guest_payer_email": null,
      "sender_display_name": "Jane Doe",
      "sender_wallet_number": "Main wallet",
      "receiver_display_name": "John Smith",
      "receiver_wallet_number": "W...",
      "source_label": "Wallet transfer",
      "sender_label": "Jane Doe (Main wallet)",
      "receiver_label": "John Smith (W...)",
      "counterparty_label": "John Smith (W...)",
      "created_at": "...",
      "completed_at": "..."
    }
  ]
}
```

Source label values:

- `Guest card via Stripe`
- `Card top-up via Stripe`
- `Wallet QR payment`
- `Wallet transfer`
- fallback to raw transaction `type`

### 9.11 POST /api/qr-codes

Purpose:

- Create a QR payment request for a wallet.

Request:

```json
{
  "wallet_id": "uuid",
  "description": "Coffee",
  "amount": 25.00,
  "single_use": true,
  "expiry_at": "2026-06-30T12:00:00.000Z"
}
```

Success:

```json
{
  "qrCode": {
    "id": "uuid",
    "wallet_id": "uuid",
    "token": "ABCDE12345",
    "description": "Coffee",
    "amount": 25.00,
    "currency": "BWP",
    "qr_image_url": "data:image/png;base64,...",
    "single_use": true,
    "is_active": true,
    "paid_count": 0
  },
  "payUrl": "https://domain.com/pay/ABCDE12345"
}
```

Mobile notes:

- Mobile can display `qr_image_url` directly.
- Mobile can also generate its own QR image from `payUrl` if preferred.
- The QR should encode the URL, not raw JSON.

### 9.12 GET /api/qr-codes

Purpose:

- List QR codes for the current user's wallets.

Success:

```json
{
  "qrCodes": []
}
```

### 9.13 PATCH /api/qr-codes/[id]

Purpose:

- Activate or deactivate QR code.

Request:

```json
{
  "is_active": false
}
```

Success:

```json
{
  "qrCode": {}
}
```

### 9.14 GET /api/qr-codes/resolve/[token]

Purpose:

- Public endpoint to resolve a scanned QR token.
- Does not require login.

Success:

```json
{
  "qr": {
    "id": "uuid",
    "wallet_id": "uuid",
    "description": "Coffee",
    "amount": 25.00,
    "currency": "BWP",
    "single_use": true,
    "is_active": true,
    "paid_count": 0,
    "expiry_at": null,
    "receiver_name": "Jane Doe",
    "receiver_user_id": "uuid"
  },
  "payable": true,
  "reason": null
}
```

Not payable response example:

```json
{
  "qr": {},
  "payable": false,
  "reason": "This single-use QR has already been paid"
}
```

Mobile use:

- QR scanner extracts `/pay/<token>` URL.
- Mobile app parses token and calls this endpoint.
- If user is logged in, show wallet payment option.
- If user is not logged in or wants card, show guest card option.

### 9.15 POST /api/qr-codes/card-checkout

Purpose:

- Start Stripe Checkout for guest card payment against a QR code.
- Does not require authenticated customer.
- Uses service role to read QR and receiver wallet.

Request:

```json
{
  "qr_code_id": "uuid"
}
```

Success:

```json
{
  "url": "https://checkout.stripe.com/..."
}
```

Minimum card amounts:

```text
USD: 0.50
BWP: 8.00
ZAR: 10.00
EUR: 0.50
GBP: 0.30
Fallback: 1.00
```

Stripe metadata set:

```json
{
  "source": "guest_qr_payment",
  "qr_code_id": "uuid",
  "qr_token": "TOKEN",
  "receiver_wallet_id": "uuid",
  "receiver_user_id": "uuid",
  "description": "Coffee"
}
```

Mobile notes:

- Open returned `url` in browser/in-app browser.
- Success URL currently returns to web `/pay/<token>/success?session_id=...`.
- For native mobile, configure Stripe success URL to a universal link/deep link or build a mobile-specific checkout creation endpoint.

### 9.16 POST /api/qr-codes/reconcile-card-session

Purpose:

- Verifies a guest QR Stripe Checkout Session.
- Credits receiver wallet if not already credited.
- Stores Stripe Checkout payer details when available.
- Backfills missing notification when payment already exists.

Request:

```json
{
  "session_id": "cs_test_..."
}
```

Success credited:

```json
{
  "credited": true,
  "amount": 25.00,
  "currency": "BWP",
  "reference_id": "CARDQR-pi_...",
  "transaction_id": "uuid",
  "receiver_wallet_id": "uuid",
  "description": "Card payment: Coffee",
  "payer_name": "Stripe Customer Name",
  "payer_email": "customer@example.com"
}
```

Already credited:

```json
{
  "credited": false,
  "already_credited": true,
  "reference_id": "CARDQR-pi_..."
}
```

### 9.17 POST /api/payments/create-checkout

Purpose:

- Create Stripe Checkout session for wallet top-up.

Request:

```json
{
  "amount": 100.00,
  "wallet_id": "uuid"
}
```

Success:

```json
{
  "url": "https://checkout.stripe.com/..."
}
```

Validation:

- Amount must be at least 1.00.
- Wallet must belong to user.

### 9.18 POST /api/payments/reconcile-session

Purpose:

- Verifies top-up Checkout Session.
- Credits wallet if webhook has not already done it.

Request:

```json
{
  "session_id": "cs_test_..."
}
```

Success credited:

```json
{
  "credited": true,
  "amount": 100.00,
  "reference_id": "TOPUP-pi_...",
  "wallet_id": "uuid"
}
```

Already credited:

```json
{
  "credited": false,
  "already_credited": true,
  "reference_id": "TOPUP-pi_..."
}
```

### 9.19 POST /api/payments/webhook

Purpose:

- Stripe webhook receiver.

Handled event types:

- `payment_intent.succeeded`
- `payment_intent.payment_failed`

Succeeded behavior:

- If `paymentIntent.metadata.source === 'guest_qr_payment'`, call guest QR card application logic.
- Otherwise treat as wallet top-up.

Guest card webhook details:

- Looks up Stripe Checkout Session by PaymentIntent.
- Captures `customer_details.name`.
- Captures `customer_details.email`.
- Applies payment idempotently.
- Creates transaction.
- Credits receiver wallet.
- Updates QR paid count.
- Deactivates single-use QR.
- Creates receiver notification.
- Notifies admins.
- Writes audit log.

### 9.20 GET /api/notifications

Purpose:

- List user's notifications.

Query params:

```text
unread=true
```

Success:

```json
{
  "notifications": [
    {
      "id": "uuid",
      "title": "Card payment received",
      "message": "You received 25.00 BWP from John Doe.",
      "type": "transaction",
      "category": "payment",
      "link_url": "/dashboard/transactions",
      "reference_id": "uuid",
      "is_read": false,
      "created_at": "..."
    }
  ]
}
```

### 9.21 PATCH /api/notifications

Purpose:

- Mark notifications read/unread.

Request:

```json
{
  "notificationIds": ["uuid"],
  "isRead": true
}
```

Success:

```json
{
  "notifications": [],
  "message": "Notifications updated successfully"
}
```

### 9.22 DELETE /api/notifications

Purpose:

- Delete a notification.

Request:

```json
{
  "notificationId": "uuid"
}
```

Success:

```json
{
  "message": "Notification deleted successfully"
}
```

### 9.23 POST /api/complaints

Purpose:

- Submit support complaint.

Request:

```json
{
  "complaintType": "failed_transaction",
  "title": "Payment failed",
  "description": "The receiver did not get funds.",
  "transactionId": "uuid",
  "attachmentUrls": []
}
```

Valid complaint types:

```text
unauthorized_transaction
duplicate_charge
failed_transaction
qr_payment_issue
refund_issue
account_access
other
```

Success:

```json
{
  "complaint": {},
  "message": "Complaint submitted successfully"
}
```

### 9.24 GET /api/complaints

Purpose:

- List current user's complaints.

Success:

```json
{
  "complaints": []
}
```

### 9.25 Admin APIs

`GET /api/admin/users`

Query:

```text
page=0
per=25
```

Success:

```json
{
  "users": [],
  "count": 0
}
```

`GET /api/admin/users/[id]`

Success:

```json
{
  "user": {}
}
```

`PATCH /api/admin/users/[id]`

Request:

```json
{
  "role": "customer",
  "status": "active"
}
```

`DELETE /api/admin/users/[id]`

Success:

```json
{
  "message": "User deleted"
}
```

Admin notes:

- These routes require `super_admin`.
- The `[id]` route currently has an older Next.js params type and appears in strict TypeScript errors. Runtime build still passes.

## 10. Core Flow Details

### 10.1 Signup and Profile Flow

```text
Mobile app
  -> Supabase signUp(email, password)
  -> Email confirmation
  -> Supabase signInWithPassword
  -> GET /api/users/profile
  -> PUT /api/users/profile with first/last/phone
  -> POST /api/wallets if user has no wallet
```

Recommended mobile screens:

- Signup
- Email confirmation pending
- Login
- Complete profile
- Create first wallet

### 10.2 Wallet Creation Flow

```text
User enters wallet name/currency
  -> POST /api/wallets
  -> API creates wallet_number
  -> API inserts wallet with balance 0
  -> API writes audit log
  -> Mobile refreshes wallet list
```

### 10.3 Wallet-to-Wallet Transfer Flow

```text
Sender selects source wallet
Sender enters recipient wallet number
Sender enters amount and description
Mobile generates idempotency key
  -> POST /api/transfers
  -> API resolves recipient wallet
  -> API calls fn_transfer
  -> DB locks wallets, debits, credits, creates transaction
  -> API stores sender/receiver snapshots on transaction
  -> API creates sender and receiver notifications
  -> API notifies admins
  -> API writes audit logs
  -> Mobile shows receipt/success
```

Important:

- Transfers are instant.
- Transfers are irreversible in current implementation.
- There is no PIN/2FA confirmation yet.
- Mobile should add a confirmation screen before calling the API.

### 10.4 QR Creation Flow

```text
Receiver selects wallet
Receiver enters description, amount, single-use flag, optional expiry
  -> POST /api/qr-codes
  -> API creates short token
  -> API generates pay URL /pay/<token>
  -> API creates PNG QR data URL
  -> API inserts qr_codes row
  -> Mobile displays QR
```

### 10.5 Logged-In QR Wallet Payment Flow

```text
Payer scans QR
Mobile extracts token from URL
  -> GET /api/qr-codes/resolve/<token>
  -> Mobile displays receiver, amount, description
Payer selects source wallet
Mobile generates idempotency key
  -> POST /api/transfers { from_wallet_id, qr_code_id, idempotency_key }
  -> fn_transfer debits payer and credits receiver
  -> fn_transfer increments QR paid_count
  -> single-use QR deactivates if needed
  -> API creates notifications
  -> Mobile displays receipt
```

### 10.6 Guest QR Card Payment Flow

```text
Guest scans QR
Mobile extracts token from URL
  -> GET /api/qr-codes/resolve/<token>
Guest chooses card payment
  -> POST /api/qr-codes/card-checkout { qr_code_id }
  -> API creates Stripe Checkout Session
Mobile opens Stripe Checkout URL
Guest pays with card
Stripe redirects to success URL with session_id
  -> POST /api/qr-codes/reconcile-card-session { session_id }
  -> API verifies Stripe session is paid
  -> API credits receiver wallet if not already credited
  -> API stores payer name/email if Stripe captured them
  -> API creates receiver notification
  -> API returns receipt data
Stripe webhook also processes payment_intent.succeeded
```

Idempotency:

- `stripe_payment_intent_id` is unique.
- Webhook and reconcile can both run safely.
- First one to create the transaction wins.
- The other returns `already_credited`.

### 10.7 Wallet Top-Up Flow

```text
User selects wallet and amount
  -> POST /api/payments/create-checkout
  -> API creates Stripe Checkout Session
Mobile opens Stripe URL
User pays
Stripe redirects with session_id
  -> POST /api/payments/reconcile-session
  -> API verifies paid session
  -> API credits wallet if not already credited
Stripe webhook also processes payment_intent.succeeded
```

### 10.8 Notification Flow

Events creating notifications:

- Wallet top-up success/failure.
- Wallet transfer sent.
- Wallet transfer received.
- QR wallet payment sent/received.
- Guest card payment received.
- Low balance after transfer.
- Complaint submitted.
- Admin notifications for key events.

Mobile notification model:

- In-app feed comes from `/api/notifications`.
- Polling is used in web app every 15 seconds.
- Mobile should use polling initially.
- Push notifications are not implemented yet.

Recommended mobile polling:

- On app foreground: fetch `/api/notifications`.
- On notification screen open: fetch `/api/notifications`.
- Optional background interval: 30-60 seconds while app is active.

## 11. Mobile App Screen Map

Recommended mobile navigation:

```text
Auth Stack
  Login
  Signup
  Forgot Password
  Email Confirmation

Main Tabs
  Home
  Wallets
  Scan/Pay
  Transactions
  Notifications

Secondary Screens
  Profile/Settings
  Create Wallet
  Wallet Detail
  Send Money
  Create QR
  QR Detail/Share
  QR Payment Confirm
  Guest Card Checkout Return
  Top Up
  Top Up Return
  Complaint List
  New Complaint
  Transaction Detail
```

Home screen should show:

- Total balance across wallets.
- Recent transactions.
- Quick actions: Send, Scan, Top Up, Create QR.
- Unread notifications badge.

Wallets screen should show:

- All wallets.
- Balance.
- Currency.
- Wallet number.
- Status.
- Rename action.
- Create wallet action.

Scan/Pay screen should:

- Request camera permission.
- Scan QR URL.
- Parse token from `/pay/<token>`.
- Resolve QR.
- Show amount, description, receiver, payable status.
- Offer wallet payment if authenticated.
- Offer card payment if guest or user chooses card.

Transactions screen should:

- Call `GET /api/transfers`.
- Display source label.
- Display sender/receiver labels.
- Show sign based on whether current user's wallet is source or destination.
- Filter by money in/out, type, status.
- Search by description/reference/source/sender/receiver.

Notifications screen should:

- Call `GET /api/notifications`.
- Mark read via `PATCH /api/notifications`.
- Delete via `DELETE /api/notifications`.

## 12. Mobile Deep Links and Stripe Redirects

Current web redirect URLs:

```text
Top-up success:
/dashboard/topup/success?session_id={CHECKOUT_SESSION_ID}

Guest QR card success:
/pay/<token>/success?session_id={CHECKOUT_SESSION_ID}
```

For mobile, add universal links or app links:

```text
digitalwallet://topup/success?session_id=cs_...
digitalwallet://pay/<token>/success?session_id=cs_...
```

Backend options:

1. Reuse existing endpoints but change success URL generation based on request body:

```json
{
  "amount": 100,
  "wallet_id": "uuid",
  "success_url": "digitalwallet://topup/success?session_id={CHECKOUT_SESSION_ID}",
  "cancel_url": "digitalwallet://topup/cancelled"
}
```

2. Create mobile-specific endpoints:

```text
POST /api/mobile/payments/create-checkout
POST /api/mobile/qr-codes/card-checkout
```

Security note:

- Do not trust arbitrary success/cancel URLs from clients unless validated against an allowlist.

## 13. Security and Risk Notes

Current protections:

- Supabase RLS on main tables.
- Server-side wallet mutations.
- `fn_transfer` row locks.
- Transfer idempotency keys.
- Stripe payment intent unique index.
- Service role used only server-side.
- Webhook signature validation.
- QR public resolver exposes only payment request info.

Current gaps before real-money production:

- Web API auth is cookie-based; mobile bearer support should be added.
- No PIN/biometric confirmation before transfer.
- No KYC tiers.
- No fraud rules or velocity limits beyond daily wallet limit.
- No double-entry ledger table.
- No fee model.
- No chargeback/dispute automation for Stripe.
- No push notifications.
- No device/session management screen.
- Multi-currency formatting and FX validation are incomplete.
- Dev and prod should not share the same Supabase project for money-like testing.

## 14. Error Handling Patterns

API error shape:

```json
{
  "error": "Human-readable error message"
}
```

Common statuses:

```text
400 validation or business rule failure
401 unauthenticated
403 forbidden
404 not found
409 signup conflict
500 server/database/Stripe failure
```

Mobile UX guidance:

- Show validation errors inline.
- For transfer failures, keep the form populated.
- For unknown network status after submitting a transfer, retry with the same idempotency key.
- For Stripe success return, call reconciliation and show pending state until it resolves.

## 15. Transaction Presentation Rules

Direction:

```text
Money out: from_wallet_id belongs to current user.
Money in: to_wallet_id belongs to current user.
Neutral: neither side belongs to current user, should not normally appear for customers.
```

Amount sign:

```text
Money out: -amount
Money in: +amount
Neutral: no sign
```

Source:

```text
Guest card via Stripe: stripe_payment_intent_id present and from_wallet_id null and type payment
Card top-up via Stripe: type topup
Wallet QR payment: qr_code_id present and from_wallet_id present
Wallet transfer: type transfer
```

Counterparty:

```text
Money out: receiver_label
Money in: sender_label
Guest card: guest_payer_name || guest_payer_email || "Guest card payer"
Top-up: "Card top-up"
```

## 16. Recommended Mobile Data Types

```ts
type Wallet = {
  id: string
  user_id: string
  wallet_number: string
  name: string | null
  currency: string
  balance: number
  daily_limit: number
  daily_spent: number
  status: 'active' | 'frozen' | 'closed'
  created_at: string
  updated_at: string
}

type Transaction = {
  id: string
  from_wallet_id: string | null
  to_wallet_id: string | null
  type: 'transfer' | 'topup' | 'payment' | 'refund' | 'adjustment'
  amount: number
  currency: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'reversed'
  reference_id: string
  description: string | null
  qr_code_id: string | null
  stripe_payment_intent_id: string | null
  guest_payer_name: string | null
  guest_payer_email: string | null
  sender_display_name: string | null
  sender_wallet_number: string | null
  receiver_display_name: string | null
  receiver_wallet_number: string | null
  source_label: string
  sender_label: string | null
  receiver_label: string | null
  counterparty_label: string | null
  created_at: string
  completed_at: string | null
}

type QrCode = {
  id: string
  wallet_id: string
  token: string
  description: string
  amount: number
  currency: string
  qr_image_url: string | null
  single_use: boolean
  is_active: boolean
  paid_count: number
  expiry_at: string | null
  created_at: string
  updated_at: string
}

type Notification = {
  id: string
  user_id: string
  title: string
  message: string
  category: 'payment' | 'security' | 'wallet' | 'complaint' | 'merchant' | 'system'
  type: 'transaction' | 'security' | 'wallet' | 'complaint' | 'system'
  link_url: string | null
  reference_id: string | null
  is_read: boolean
  read_at: string | null
  created_at: string
}
```

## 17. Mobile Implementation Checklist

Backend readiness:

- Apply all migrations through `007-transaction-counterparty-snapshots.sql`.
- Add bearer-token auth support to API routes.
- Add mobile deep-link success/cancel URL support for Stripe Checkout.
- Verify complaint table deployed shape matches current code.
- Fix strict TypeScript issues in admin users route and `qrcode` typings.

Mobile app MVP:

- Supabase signup/login/logout/session refresh.
- Profile GET/PUT.
- Wallet list/create/rename/detail.
- Send money form with confirmation.
- Transaction list with source/counterparty labels.
- QR creation and share.
- QR scanner and QR resolve.
- Logged-in QR wallet payment.
- Guest card checkout and success reconciliation.
- Wallet top-up checkout and success reconciliation.
- Notifications list/read/delete.
- Complaint submit/list.

Production-hardening:

- Separate dev and prod Supabase projects.
- Add transfer PIN or biometric confirmation.
- Add push notifications.
- Add transaction detail screen.
- Add chargeback/dispute workflow.
- Add audit/admin mobile or web-only admin decision.
- Add device/session management.
- Add stronger currency/FX rules.
- Add double-entry ledger before handling real money at scale.

## 18. Known Current Technical Issues

Strict `tsc --noEmit` currently reports:

- `app/api/admin/users/[id]/route.ts` uses old Next.js params typing. It should use `{ params: Promise<{ id: string }> }` in Next.js 16.
- `qrcode` lacks TypeScript declarations. Add `@types/qrcode` or a local `declare module 'qrcode';`.

Build status:

- `npm.cmd run build` passes.

## 19. Suggested Mobile Backend Auth Helper

Add a shared helper similar to:

```ts
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createCookieClient } from '@/lib/supabase/server'
import type { NextRequest } from 'next/server'

export async function createApiClient(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.match(/^Bearer (.+)$/i)?.[1]

  if (!token) {
    return createCookieClient()
  }

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )
}
```

Then update route handlers to call `createApiClient(request)` instead of only the cookie-based server client where mobile access is required.

## 20. Summary for Mobile Team

Build the mobile app around these backend primitives:

- Supabase Auth for identity.
- `/api/wallets` for wallet management.
- `/api/transfers` for wallet transfer, QR wallet payment, and transaction history.
- `/api/qr-codes` and `/api/qr-codes/resolve/[token]` for QR receiving and scanning.
- `/api/qr-codes/card-checkout` plus `/api/qr-codes/reconcile-card-session` for guest card QR payments.
- `/api/payments/create-checkout` plus `/api/payments/reconcile-session` for top-ups.
- `/api/notifications` for in-app notification feed.
- `/api/complaints` for support complaints.

The biggest mobile-specific backend change is authentication transport: the web app uses Supabase cookies, while mobile should send Supabase bearer tokens. Add that compatibility before trying to reuse the existing API routes from native mobile.
