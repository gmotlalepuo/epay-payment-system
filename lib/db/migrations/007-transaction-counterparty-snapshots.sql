-- Store sender/receiver display snapshots for transaction history.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS sender_display_name TEXT,
  ADD COLUMN IF NOT EXISTS sender_wallet_number TEXT,
  ADD COLUMN IF NOT EXISTS receiver_display_name TEXT,
  ADD COLUMN IF NOT EXISTS receiver_wallet_number TEXT;
