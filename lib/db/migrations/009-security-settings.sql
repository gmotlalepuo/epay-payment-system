CREATE TABLE IF NOT EXISTS public.payment_security_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  confirm_transfers BOOLEAN NOT NULL DEFAULT TRUE,
  confirm_qr_payments BOOLEAN NOT NULL DEFAULT TRUE,
  confirm_topups BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.payment_security_preferences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notification_preferences'
      AND policyname = 'Users can view own notification preferences'
  ) THEN
    CREATE POLICY "Users can view own notification preferences"
      ON public.notification_preferences FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notification_preferences'
      AND policyname = 'Users can upsert own notification preferences'
  ) THEN
    CREATE POLICY "Users can upsert own notification preferences"
      ON public.notification_preferences FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_security_preferences'
      AND policyname = 'Users can view own payment security preferences'
  ) THEN
    CREATE POLICY "Users can view own payment security preferences"
      ON public.payment_security_preferences FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_security_preferences'
      AND policyname = 'Users can upsert own payment security preferences'
  ) THEN
    CREATE POLICY "Users can upsert own payment security preferences"
      ON public.payment_security_preferences FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
