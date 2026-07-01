-- Atomic Stripe top-up crediting for webhook and mobile success reconciliation.
-- Safe to run multiple times in Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.fn_credit_stripe_topup(
  p_user_id UUID,
  p_wallet_id UUID,
  p_payment_intent_id TEXT,
  p_amount NUMERIC,
  p_currency TEXT DEFAULT 'BWP',
  p_description TEXT DEFAULT 'Wallet top-up via Stripe'
)
RETURNS TABLE (
  credited BOOLEAN,
  already_credited BOOLEAN,
  transaction_id UUID,
  reference_id TEXT,
  wallet_id UUID,
  amount NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet public.wallets%ROWTYPE;
  v_existing public.transactions%ROWTYPE;
  v_transaction public.transactions%ROWTYPE;
  v_reference_id TEXT;
BEGIN
  IF p_user_id IS NULL OR p_wallet_id IS NULL THEN
    RAISE EXCEPTION 'User and wallet are required';
  END IF;

  IF p_payment_intent_id IS NULL OR length(trim(p_payment_intent_id)) = 0 THEN
    RAISE EXCEPTION 'Stripe payment intent is required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Top-up amount must be greater than zero';
  END IF;

  SELECT *
    INTO v_existing
    FROM public.transactions
   WHERE stripe_payment_intent_id = p_payment_intent_id
   LIMIT 1;

  IF FOUND THEN
    credited := FALSE;
    already_credited := TRUE;
    transaction_id := v_existing.id;
    reference_id := v_existing.reference_id;
    wallet_id := v_existing.to_wallet_id;
    amount := v_existing.amount;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT *
    INTO v_wallet
    FROM public.wallets
   WHERE id = p_wallet_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  IF v_wallet.user_id <> p_user_id THEN
    RAISE EXCEPTION 'Wallet does not belong to user';
  END IF;

  IF v_wallet.status <> 'active' THEN
    RAISE EXCEPTION 'Wallet is not active';
  END IF;

  SELECT *
    INTO v_existing
    FROM public.transactions
   WHERE stripe_payment_intent_id = p_payment_intent_id
   LIMIT 1;

  IF FOUND THEN
    credited := FALSE;
    already_credited := TRUE;
    transaction_id := v_existing.id;
    reference_id := v_existing.reference_id;
    wallet_id := v_existing.to_wallet_id;
    amount := v_existing.amount;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.wallets
     SET balance = balance + p_amount,
         updated_at = now()
   WHERE id = p_wallet_id;

  v_reference_id := 'TOPUP-' || p_payment_intent_id;

  INSERT INTO public.transactions (
    from_wallet_id,
    to_wallet_id,
    type,
    amount,
    currency,
    status,
    stripe_payment_intent_id,
    reference_id,
    description,
    completed_at
  )
  VALUES (
    NULL,
    p_wallet_id,
    'topup',
    p_amount,
    COALESCE(NULLIF(upper(p_currency), ''), v_wallet.currency, 'BWP'),
    'completed',
    p_payment_intent_id,
    v_reference_id,
    p_description,
    now()
  )
  RETURNING * INTO v_transaction;

  credited := TRUE;
  already_credited := FALSE;
  transaction_id := v_transaction.id;
  reference_id := v_transaction.reference_id;
  wallet_id := p_wallet_id;
  amount := p_amount;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_credit_stripe_topup(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_credit_stripe_topup(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT) TO service_role;
