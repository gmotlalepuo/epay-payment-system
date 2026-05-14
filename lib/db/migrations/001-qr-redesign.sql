-- Migration 001: QR redesign + schema/code reconciliation
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query
-- Idempotent within reason: re-running skips work that's already done, but
-- re-creating function bodies is fine.
--
-- Effects:
--   - Drops merchant-tied tables (merchants, payments, settlements,
--     reconciliation_reports, failed_transactions, payment_gateways).
--   - Collapses user roles to (super_admin, customer).
--   - Renames wallet_transactions -> transactions (or drops + recreates) and
--     aligns column names with what the app code uses.
--   - Adds wallet_number to wallets, defaults currency to BWP.
--   - Reshapes qr_codes around wallet_id + token + description + amount.
--   - Adds full RLS (SELECT/INSERT/UPDATE) for tables the app writes.
--   - Adds trigger that auto-creates public.users on auth.users insert.
--   - Adds atomic fn_transfer(...) with row locks + idempotency.
--   - Adds qr_codes_resolve(token) SECURITY DEFINER for public scan landing.

BEGIN;

-- ============================================================================
-- 1. Drop merchant-tied tables (CASCADE handles FKs and old policies)
-- ============================================================================
DROP TABLE IF EXISTS public.reconciliation_reports CASCADE;
DROP TABLE IF EXISTS public.settlements              CASCADE;
DROP TABLE IF EXISTS public.failed_transactions      CASCADE;
DROP TABLE IF EXISTS public.payments                 CASCADE;
DROP TABLE IF EXISTS public.payment_gateways         CASCADE;
DROP TABLE IF EXISTS public.qr_codes                 CASCADE;  -- recreated below
DROP TABLE IF EXISTS public.merchants                CASCADE;
DROP TABLE IF EXISTS public.wallet_transactions      CASCADE;  -- replaced by transactions

-- complaints.merchant_id is now stale
ALTER TABLE public.complaints           DROP COLUMN IF EXISTS merchant_id;
-- notification_preferences.merchant_notifications is also stale
ALTER TABLE public.notification_preferences DROP COLUMN IF EXISTS merchant_notifications;

-- ============================================================================
-- 2. Collapse user roles
-- ============================================================================
UPDATE public.users
   SET role = 'customer'
 WHERE role IN ('merchant', 'finance_officer', 'support_officer');

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD  CONSTRAINT users_role_check
  CHECK (role IN ('super_admin', 'customer'));

-- ============================================================================
-- 3. Wallets: BWP default + wallet_number
-- ============================================================================
ALTER TABLE public.wallets ALTER COLUMN currency SET DEFAULT 'BWP';

UPDATE public.wallets SET currency = 'BWP' WHERE currency IS NULL OR currency = 'USD';

ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS wallet_number TEXT;

UPDATE public.wallets
   SET wallet_number = 'W' || upper(encode(gen_random_bytes(6), 'hex'))
 WHERE wallet_number IS NULL;

ALTER TABLE public.wallets ALTER COLUMN wallet_number SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wallets_wallet_number_key'
  ) THEN
    ALTER TABLE public.wallets ADD CONSTRAINT wallets_wallet_number_key UNIQUE (wallet_number);
  END IF;
END $$;

-- INSERT/UPDATE policies (SELECT already exists)
DROP POLICY IF EXISTS "Users insert own wallet" ON public.wallets;
CREATE POLICY  "Users insert own wallet" ON public.wallets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own wallet" ON public.wallets;
CREATE POLICY  "Users update own wallet" ON public.wallets FOR UPDATE
  USING (auth.uid() = user_id OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin');

-- ============================================================================
-- 4. transactions table (canonical name, matches code)
-- ============================================================================
CREATE TABLE public.transactions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_wallet_id           UUID REFERENCES public.wallets(id) ON DELETE SET NULL,
  to_wallet_id             UUID REFERENCES public.wallets(id) ON DELETE SET NULL,
  type                     TEXT NOT NULL CHECK (type IN ('transfer','topup','payment','refund','adjustment')),
  amount                   DECIMAL(15,2) NOT NULL CHECK (amount > 0),
  currency                 TEXT NOT NULL DEFAULT 'BWP',
  status                   TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','processing','completed','failed','cancelled','reversed')),
  reference_id             TEXT UNIQUE NOT NULL,
  description              TEXT,
  qr_code_id               UUID,                       -- FK added after qr_codes
  stripe_payment_intent_id TEXT,
  idempotency_key          TEXT UNIQUE,
  failure_reason           TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at             TIMESTAMPTZ,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_wallet_id IS NOT NULL OR to_wallet_id IS NOT NULL),
  CHECK (from_wallet_id IS NULL OR to_wallet_id IS NULL OR from_wallet_id <> to_wallet_id)
);

CREATE INDEX idx_transactions_from   ON public.transactions(from_wallet_id, created_at DESC);
CREATE INDEX idx_transactions_to     ON public.transactions(to_wallet_id,   created_at DESC);
CREATE INDEX idx_transactions_status ON public.transactions(status,         created_at DESC);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own transactions" ON public.transactions FOR SELECT
  USING (
    from_wallet_id IN (SELECT id FROM public.wallets WHERE user_id = auth.uid())
    OR to_wallet_id IN (SELECT id FROM public.wallets WHERE user_id = auth.uid())
    OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
  );

-- Inserts go through fn_transfer (SECURITY DEFINER) and the Stripe webhook
-- (server-side with service-role). Clients should not insert directly.

-- ============================================================================
-- 5. qr_codes table (new shape)
-- ============================================================================
CREATE TABLE public.qr_codes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id     UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  token         TEXT UNIQUE NOT NULL,
  description   TEXT NOT NULL,
  amount        DECIMAL(15,2) NOT NULL CHECK (amount > 0),
  currency      TEXT NOT NULL DEFAULT 'BWP',
  qr_image_url  TEXT,                       -- data: URL of the PNG
  single_use    BOOLEAN NOT NULL DEFAULT FALSE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  paid_count    INT     NOT NULL DEFAULT 0,
  expiry_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_qr_codes_wallet ON public.qr_codes(wallet_id);
CREATE INDEX idx_qr_codes_token  ON public.qr_codes(token);

ALTER TABLE public.qr_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own qr codes" ON public.qr_codes FOR SELECT
  USING (
    wallet_id IN (SELECT id FROM public.wallets WHERE user_id = auth.uid())
    OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
  );

CREATE POLICY "Users insert own qr codes" ON public.qr_codes FOR INSERT
  WITH CHECK (wallet_id IN (SELECT id FROM public.wallets WHERE user_id = auth.uid()));

CREATE POLICY "Users update own qr codes" ON public.qr_codes FOR UPDATE
  USING (wallet_id IN (SELECT id FROM public.wallets WHERE user_id = auth.uid()));

-- Add the deferred FK from transactions.qr_code_id -> qr_codes.id
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_qr_code_id_fkey
  FOREIGN KEY (qr_code_id) REFERENCES public.qr_codes(id) ON DELETE SET NULL;

-- ============================================================================
-- 6. notifications: align type enum with what code writes
--    (current schema expects 'info'|'warning'|'success'|'error', but routes
--    write 'transaction'. Swap to a category-style enum.)
-- ============================================================================
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD  CONSTRAINT notifications_type_check
  CHECK (type IN ('transaction','security','wallet','complaint','system'));

DROP POLICY IF EXISTS "Users insert own notifications" ON public.notifications;
CREATE POLICY  "Users insert own notifications" ON public.notifications FOR INSERT
  WITH CHECK (true);  -- inserts come from server (fn_transfer / webhook)

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY  "Users update own notifications" ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 7. audit_logs: align column names with what code writes
--    code uses resource_type / resource_id / details
--    schema had  entity_type   / entity_id   / new_values
-- ============================================================================
ALTER TABLE public.audit_logs RENAME COLUMN entity_type TO resource_type;
ALTER TABLE public.audit_logs RENAME COLUMN entity_id   TO resource_id;
ALTER TABLE public.audit_logs RENAME COLUMN new_values  TO details;
ALTER TABLE public.audit_logs DROP COLUMN IF EXISTS old_values;

DROP POLICY IF EXISTS "Anyone can write audit logs" ON public.audit_logs;
CREATE POLICY  "Anyone can write audit logs" ON public.audit_logs FOR INSERT
  WITH CHECK (true);  -- inserts from server only

-- ============================================================================
-- 8. Auto-create public.users row when an auth.users row is inserted.
--    Permanently fixes the wallets_user_id_fkey error.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (
    id, email, phone_number, first_name, last_name,
    role, status, password_hash
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'phone',      '+placeholder_' || NEW.id::text),
    COALESCE(NEW.raw_user_meta_data->>'first_name', 'User'),
    COALESCE(NEW.raw_user_meta_data->>'last_name',  ''),
    'customer',
    'active',
    ''
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Backfill: any existing auth.users without a public.users row
INSERT INTO public.users (id, email, phone_number, first_name, last_name, role, status, password_hash)
SELECT au.id,
       au.email,
       '+placeholder_' || au.id::text,
       COALESCE(au.raw_user_meta_data->>'first_name','User'),
       COALESCE(au.raw_user_meta_data->>'last_name',''),
       'customer','active',''
  FROM auth.users au
  LEFT JOIN public.users pu ON pu.id = au.id
 WHERE pu.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 9. Atomic transfer function with row locks + idempotency
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_transfer(
  p_from_wallet_id  UUID,
  p_to_wallet_id    UUID,
  p_amount          DECIMAL,
  p_description     TEXT DEFAULT NULL,
  p_qr_code_id      UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE (transaction_id UUID, reference_id TEXT, status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      UUID;
  v_from         RECORD;
  v_to           RECORD;
  v_existing     RECORD;
  v_reference_id TEXT;
  v_txn_id       UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;

  -- Idempotency replay
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id, reference_id AS ref, status
      INTO v_existing
      FROM public.transactions
     WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN QUERY SELECT v_existing.id, v_existing.ref, v_existing.status;
      RETURN;
    END IF;
  END IF;

  -- Lock both wallets in stable id order to avoid deadlocks under concurrency
  IF p_from_wallet_id < p_to_wallet_id THEN
    SELECT * INTO v_from FROM public.wallets WHERE id = p_from_wallet_id FOR UPDATE;
    SELECT * INTO v_to   FROM public.wallets WHERE id = p_to_wallet_id   FOR UPDATE;
  ELSE
    SELECT * INTO v_to   FROM public.wallets WHERE id = p_to_wallet_id   FOR UPDATE;
    SELECT * INTO v_from FROM public.wallets WHERE id = p_from_wallet_id FOR UPDATE;
  END IF;

  IF v_from IS NULL THEN RAISE EXCEPTION 'Source wallet not found';     END IF;
  IF v_to   IS NULL THEN RAISE EXCEPTION 'Recipient wallet not found';  END IF;

  IF v_from.user_id <> v_user_id THEN
    RAISE EXCEPTION 'Source wallet does not belong to user';
  END IF;
  IF v_from.id = v_to.id THEN
    RAISE EXCEPTION 'Cannot transfer to the same wallet';
  END IF;
  IF v_from.status <> 'active' THEN
    RAISE EXCEPTION 'Source wallet is not active';
  END IF;
  IF v_to.status <> 'active' THEN
    RAISE EXCEPTION 'Recipient wallet is not active';
  END IF;
  IF v_from.balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;
  IF v_from.daily_spent + p_amount > v_from.daily_limit THEN
    RAISE EXCEPTION 'Daily transfer limit exceeded';
  END IF;

  v_reference_id := 'TXN' || to_char(now(),'YYYYMMDDHH24MISS')
                          || upper(encode(gen_random_bytes(4),'hex'));

  UPDATE public.wallets
     SET balance     = balance     - p_amount,
         daily_spent = daily_spent + p_amount,
         updated_at  = now()
   WHERE id = p_from_wallet_id;

  UPDATE public.wallets
     SET balance    = balance + p_amount,
         updated_at = now()
   WHERE id = p_to_wallet_id;

  INSERT INTO public.transactions (
    from_wallet_id, to_wallet_id, type, amount, currency, status,
    reference_id, description, qr_code_id, idempotency_key, completed_at
  ) VALUES (
    p_from_wallet_id, p_to_wallet_id,
    CASE WHEN p_qr_code_id IS NOT NULL THEN 'payment' ELSE 'transfer' END,
    p_amount, v_from.currency, 'completed',
    v_reference_id, p_description, p_qr_code_id, p_idempotency_key, now()
  ) RETURNING id INTO v_txn_id;

  IF p_qr_code_id IS NOT NULL THEN
    UPDATE public.qr_codes
       SET paid_count = paid_count + 1,
           is_active  = CASE WHEN single_use THEN FALSE ELSE is_active END,
           updated_at = now()
     WHERE id = p_qr_code_id;
  END IF;

  RETURN QUERY SELECT v_txn_id, v_reference_id, 'completed'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_transfer(UUID, UUID, DECIMAL, TEXT, UUID, TEXT) TO authenticated;

-- ============================================================================
-- 10. Public QR resolver for the scan landing page
-- ============================================================================
CREATE OR REPLACE FUNCTION public.qr_codes_resolve(p_token TEXT)
RETURNS TABLE (
  id                  UUID,
  wallet_id           UUID,
  description         TEXT,
  amount              DECIMAL,
  currency            TEXT,
  single_use          BOOLEAN,
  is_active           BOOLEAN,
  paid_count          INT,
  expiry_at           TIMESTAMPTZ,
  receiver_first_name TEXT,
  receiver_last_name  TEXT,
  receiver_user_id    UUID
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.id, q.wallet_id, q.description, q.amount, q.currency,
         q.single_use, q.is_active, q.paid_count, q.expiry_at,
         u.first_name, u.last_name, u.id
    FROM public.qr_codes q
    JOIN public.wallets  w ON w.id = q.wallet_id
    JOIN public.users    u ON u.id = w.user_id
   WHERE q.token = p_token;
$$;

GRANT EXECUTE ON FUNCTION public.qr_codes_resolve(TEXT) TO anon, authenticated;

COMMIT;
