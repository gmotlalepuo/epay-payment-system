-- Standardize all BotsPay monetary records on Botswana pula.
ALTER TABLE public.wallets ALTER COLUMN currency SET DEFAULT 'BWP';
ALTER TABLE public.payments ALTER COLUMN currency SET DEFAULT 'BWP';
ALTER TABLE public.transactions ALTER COLUMN currency SET DEFAULT 'BWP';
ALTER TABLE public.qr_codes ALTER COLUMN currency SET DEFAULT 'BWP';

UPDATE public.wallets SET currency = 'BWP' WHERE currency IS NULL OR UPPER(currency) = 'USD';
UPDATE public.payments SET currency = 'BWP' WHERE currency IS NULL OR UPPER(currency) = 'USD';
UPDATE public.transactions SET currency = 'BWP' WHERE currency IS NULL OR UPPER(currency) = 'USD';
UPDATE public.qr_codes SET currency = 'BWP' WHERE currency IS NULL OR UPPER(currency) = 'USD';
