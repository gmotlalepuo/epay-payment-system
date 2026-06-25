-- Mobile/web profile expansion: avatar, DOB, and address fields.
-- Safe to run multiple times in Supabase SQL editor.

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS address_line1 TEXT,
  ADD COLUMN IF NOT EXISTS address_line2 TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_date_of_birth_not_future'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_date_of_birth_not_future
      CHECK (date_of_birth IS NULL OR date_of_birth <= CURRENT_DATE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_profile_text_lengths'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_profile_text_lengths
      CHECK (
        (address_line1 IS NULL OR length(address_line1) <= 160)
        AND (address_line2 IS NULL OR length(address_line2) <= 160)
        AND (city IS NULL OR length(city) <= 80)
        AND (state IS NULL OR length(state) <= 80)
        AND (postal_code IS NULL OR length(postal_code) <= 32)
        AND (country IS NULL OR length(country) <= 80)
        AND (avatar_url IS NULL OR length(avatar_url) <= 1000)
      );
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-avatars', 'profile-avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can view profile avatars" ON storage.objects;
CREATE POLICY "Users can view profile avatars"
ON storage.objects
FOR SELECT
USING (bucket_id = 'profile-avatars');

DROP POLICY IF EXISTS "Users can upload own profile avatar" ON storage.objects;
CREATE POLICY "Users can upload own profile avatar"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'profile-avatars'
  AND auth.uid()::TEXT = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can update own profile avatar" ON storage.objects;
CREATE POLICY "Users can update own profile avatar"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'profile-avatars'
  AND auth.uid()::TEXT = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'profile-avatars'
  AND auth.uid()::TEXT = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can delete own profile avatar" ON storage.objects;
CREATE POLICY "Users can delete own profile avatar"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'profile-avatars'
  AND auth.uid()::TEXT = (storage.foldername(name))[1]
);

COMMIT;
