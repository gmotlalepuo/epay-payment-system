-- Store payer details captured by Stripe Checkout for guest QR card payments.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS guest_payer_name TEXT,
  ADD COLUMN IF NOT EXISTS guest_payer_email TEXT;
