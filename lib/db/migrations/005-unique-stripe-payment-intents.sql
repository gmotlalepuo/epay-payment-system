-- Prevent duplicate Stripe-backed wallet credits when both the webhook and
-- success-page reconciliation process the same Checkout payment.
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_stripe_payment_intent_unique
  ON public.transactions(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
