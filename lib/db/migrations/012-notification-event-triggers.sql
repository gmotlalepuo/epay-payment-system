-- Durable notification capture for incoming money and status changes.
-- These triggers complement app-side notifications and use a NOT EXISTS check
-- so reruns/app-created notifications do not create duplicate rows.

CREATE OR REPLACE FUNCTION public.insert_notification_once(
  p_user_id UUID,
  p_type TEXT,
  p_category TEXT,
  p_title TEXT,
  p_message TEXT,
  p_link_url TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.notifications n
     WHERE n.user_id = p_user_id
       AND n.title = p_title
       AND (
         (p_reference_id IS NULL AND n.reference_id IS NULL)
         OR n.reference_id = p_reference_id
       )
  ) THEN
    INSERT INTO public.notifications (
      user_id,
      type,
      category,
      title,
      message,
      link_url,
      reference_id
    )
    VALUES (
      p_user_id,
      p_type,
      p_category,
      p_title,
      p_message,
      p_link_url,
      p_reference_id
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_transaction_incoming()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receiver_user_id UUID;
  v_sender_user_id UUID;
  v_title TEXT;
  v_message TEXT;
BEGIN
  IF NEW.status <> 'completed' OR NEW.to_wallet_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO v_receiver_user_id
    FROM public.wallets
   WHERE id = NEW.to_wallet_id;

  SELECT user_id INTO v_sender_user_id
    FROM public.wallets
   WHERE id = NEW.from_wallet_id;

  -- Do not notify as incoming if the same user somehow owns both sides.
  IF v_receiver_user_id IS NULL OR v_receiver_user_id = v_sender_user_id THEN
    RETURN NEW;
  END IF;

  v_title := CASE
    WHEN NEW.type = 'topup' THEN 'Top-up successful'
    WHEN NEW.qr_code_id IS NOT NULL AND NEW.stripe_payment_intent_id IS NOT NULL THEN 'Card payment received'
    WHEN NEW.qr_code_id IS NOT NULL THEN 'Payment Received'
    WHEN NEW.type = 'transfer' THEN 'Transfer Received'
    ELSE 'Money received'
  END;

  v_message := CASE
    WHEN NEW.type = 'topup' THEN
      'P' || to_char(NEW.amount, 'FM999999999990.00') || ' has been added to your wallet.'
    WHEN NEW.qr_code_id IS NOT NULL AND NEW.stripe_payment_intent_id IS NOT NULL THEN
      'You received P' || to_char(NEW.amount, 'FM999999999990.00') || ' from a guest card payment.'
    WHEN NEW.qr_code_id IS NOT NULL THEN
      'You received P' || to_char(NEW.amount, 'FM999999999990.00') || ' via QR payment.'
    WHEN NEW.type = 'transfer' THEN
      'You received P' || to_char(NEW.amount, 'FM999999999990.00') || ' by wallet transfer.'
    ELSE
      'P' || to_char(NEW.amount, 'FM999999999990.00') || ' has arrived in your wallet.'
  END;

  PERFORM public.insert_notification_once(
    v_receiver_user_id,
    'transaction',
    'payment',
    v_title,
    v_message,
    '/dashboard/transactions',
    NEW.id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_transaction_incoming ON public.transactions;
CREATE TRIGGER trg_notify_transaction_incoming
AFTER INSERT ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.notify_transaction_incoming();

CREATE OR REPLACE FUNCTION public.notify_user_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications (
      user_id,
      type,
      category,
      title,
      message,
      link_url
    )
    VALUES (
      NEW.id,
      'security',
      'security',
      'Account status changed',
      'Your account status changed from ' || OLD.status || ' to ' || NEW.status || '.',
      '/dashboard/settings'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_user_status_change ON public.users;
CREATE TRIGGER trg_notify_user_status_change
AFTER UPDATE OF status ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.notify_user_status_change();

CREATE OR REPLACE FUNCTION public.notify_wallet_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications (
      user_id,
      type,
      category,
      title,
      message,
      link_url,
      reference_id
    )
    VALUES (
      NEW.user_id,
      'wallet',
      'wallet',
      'Wallet status changed',
      'Wallet ' || COALESCE(NEW.name, NEW.wallet_number, NEW.id::TEXT) ||
        ' changed from ' || OLD.status || ' to ' || NEW.status || '.',
      '/dashboard/wallets/' || NEW.id::TEXT,
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_wallet_status_change ON public.wallets;
CREATE TRIGGER trg_notify_wallet_status_change
AFTER UPDATE OF status ON public.wallets
FOR EACH ROW
EXECUTE FUNCTION public.notify_wallet_status_change();
