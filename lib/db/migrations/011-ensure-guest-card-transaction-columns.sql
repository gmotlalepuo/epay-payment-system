-- Ensure guest QR card payment details exist on transactions.
-- The app can credit without these optional columns, but when present they let
-- receipts and activity show the guest payer details captured by Stripe.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS guest_payer_name TEXT,
  ADD COLUMN IF NOT EXISTS guest_payer_email TEXT;

-- Ask PostgREST/Supabase API to reload schema cache so new columns are visible
-- immediately to REST inserts/selects.
NOTIFY pgrst, 'reload schema';
