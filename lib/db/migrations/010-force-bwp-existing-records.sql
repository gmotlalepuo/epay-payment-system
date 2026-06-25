-- Force all existing monetary records to Botswana pula.
-- Use this if any older wallets were created with EUR, GBP, ZAR, USD, or any
-- other legacy currency before the platform standardized on BWP.

ALTER TABLE public.wallets ALTER COLUMN currency SET DEFAULT 'BWP';
ALTER TABLE public.payments ALTER COLUMN currency SET DEFAULT 'BWP';
ALTER TABLE public.transactions ALTER COLUMN currency SET DEFAULT 'BWP';
ALTER TABLE public.qr_codes ALTER COLUMN currency SET DEFAULT 'BWP';

UPDATE public.wallets
   SET currency = 'BWP',
       updated_at = NOW()
 WHERE currency IS DISTINCT FROM 'BWP';

UPDATE public.payments
   SET currency = 'BWP',
       updated_at = NOW()
 WHERE currency IS DISTINCT FROM 'BWP';

UPDATE public.transactions
   SET currency = 'BWP'
 WHERE currency IS DISTINCT FROM 'BWP';

UPDATE public.qr_codes
   SET currency = 'BWP',
       updated_at = NOW()
 WHERE currency IS DISTINCT FROM 'BWP';
