-- Add link_url support to notifications so in-app alert items can open detail pages or related views.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS link_url TEXT;
