-- Migration 002: install/refresh the public QR resolver.
--
-- Run this if /pay/<token> links fail with a missing qr_codes_resolve function.
-- This migration is intentionally narrow and does not recreate any tables.

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
