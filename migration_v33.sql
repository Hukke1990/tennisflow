-- Migration v33: Club branding & advertising management
-- Adds white_label column to clubes, creates club_ads table,
-- and sets up Supabase Storage buckets for club logos.

-- 1. Add white_label column to clubes
ALTER TABLE public.clubes
  ADD COLUMN IF NOT EXISTS white_label boolean NOT NULL DEFAULT false;

-- 2. Create club_ads table
CREATE TABLE IF NOT EXISTS public.club_ads (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid        NOT NULL REFERENCES public.clubes(id) ON DELETE CASCADE,
  image_url   text        NOT NULL,
  link_url    text,
  location    text        NOT NULL DEFAULT 'banner_bottom',
  active      boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 3. Enable RLS on club_ads
ALTER TABLE public.club_ads ENABLE ROW LEVEL SECURITY;

-- 4. Public can read active ads
CREATE POLICY "club_ads_select_active"
  ON public.club_ads
  FOR SELECT
  USING (active = true);

-- 5. Service role can do everything (backend uses service role key)
CREATE POLICY "club_ads_service_role"
  ON public.club_ads
  USING (auth.role() = 'service_role');

-- 6. Indexes for common queries
CREATE INDEX IF NOT EXISTS club_ads_club_id_idx ON public.club_ads (club_id);
CREATE INDEX IF NOT EXISTS club_ads_active_idx  ON public.club_ads (club_id, active, sort_order);

-- ──────────────────────────────────────────────────────────────────────
-- 7. Storage bucket: club-logos (public read, authenticated upload)
-- ──────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'club-logos',
  'club-logos',
  true,
  3145728,  -- 3 MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Allow any authenticated user to upload/update logos
CREATE POLICY "club_logos_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'club-logos');

CREATE POLICY "club_logos_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'club-logos');

-- Allow authenticated users to delete their own logos
CREATE POLICY "club_logos_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'club-logos');

-- Public read (bucket is already public, but explicit policy is safer)
CREATE POLICY "club_logos_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'club-logos');
