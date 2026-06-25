-- Ensure customer notification feeds are visible and manageable after server-side events.
-- Safe to run multiple times in Supabase SQL editor.

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Older notification rows may have UI-status types such as info/success/error.
-- Normalize them before restoring the stricter product event type constraint.
UPDATE public.notifications
SET type = CASE
  WHEN type IN ('transaction', 'security', 'wallet', 'complaint', 'system') THEN type
  WHEN category = 'payment' OR link_url ILIKE '%transaction%' OR title ILIKE '%top-up%' THEN 'transaction'
  WHEN category = 'security' THEN 'security'
  WHEN category = 'wallet' THEN 'wallet'
  WHEN category = 'complaint' THEN 'complaint'
  ELSE 'system'
END
WHERE type IS NULL
   OR type NOT IN ('transaction', 'security', 'wallet', 'complaint', 'system');

UPDATE public.notifications
SET category = CASE
  WHEN category IN ('payment', 'security', 'wallet', 'complaint', 'merchant', 'system') THEN category
  WHEN type = 'transaction' THEN 'payment'
  WHEN type = 'security' THEN 'security'
  WHEN type = 'wallet' THEN 'wallet'
  WHEN type = 'complaint' THEN 'complaint'
  ELSE 'system'
END
WHERE category IS NULL
   OR category NOT IN ('payment', 'security', 'wallet', 'complaint', 'merchant', 'system');

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('transaction', 'security', 'wallet', 'complaint', 'system'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'notifications_category_check'
       AND conrelid = 'public.notifications'::regclass
  ) THEN
    ALTER TABLE public.notifications ADD CONSTRAINT notifications_category_check
      CHECK (category IN ('payment', 'security', 'wallet', 'complaint', 'merchant', 'system'));
  END IF;
END $$;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications"
ON public.notifications
FOR SELECT
USING (
  auth.uid() = user_id
  OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
);

DROP POLICY IF EXISTS "Users see own notifications" ON public.notifications;
CREATE POLICY "Users see own notifications"
ON public.notifications
FOR SELECT
USING (
  auth.uid() = user_id
  OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
);

DROP POLICY IF EXISTS "Users insert own notifications" ON public.notifications;
CREATE POLICY "Users insert own notifications"
ON public.notifications
FOR INSERT
WITH CHECK (true);

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications"
ON public.notifications
FOR UPDATE
USING (
  auth.uid() = user_id
  OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
)
WITH CHECK (
  auth.uid() = user_id
  OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
);

DROP POLICY IF EXISTS "Users delete own notifications" ON public.notifications;
CREATE POLICY "Users delete own notifications"
ON public.notifications
FOR DELETE
USING (
  auth.uid() = user_id
  OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
ON public.notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_reference
ON public.notifications(reference_id)
WHERE reference_id IS NOT NULL;
