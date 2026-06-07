-- Migration 004: fix fn_transfer random reference generation on Supabase.
--
-- Run this if QR or transfer payments fail with:
--   function gen_random_bytes(integer) does not exist
--
-- fn_transfer uses SET search_path = public, while Supabase exposes pgcrypto
-- functions from the extensions schema. Qualify gen_random_bytes explicitly.

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
    SELECT t.id, t.reference_id AS ref, t.status
      INTO v_existing
      FROM public.transactions t
     WHERE t.idempotency_key = p_idempotency_key;
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
                          || upper(encode(extensions.gen_random_bytes(4),'hex'));

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
