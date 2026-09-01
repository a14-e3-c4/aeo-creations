CREATE TABLE public.creations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  kind text NOT NULL CHECK (kind IN ('image','video','script')),
  title text,
  prompt text NOT NULL DEFAULT '',
  model text,
  aspect_ratio text,
  resolution text,
  storage_path text,
  poster_path text,
  content text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.creations TO authenticated;
GRANT SELECT, INSERT ON public.creations TO anon;
GRANT ALL ON public.creations TO service_role;

ALTER TABLE public.creations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read guest creations or own"
ON public.creations FOR SELECT
USING (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Insert guest or own"
ON public.creations FOR INSERT
WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Owners update their own"
ON public.creations FOR UPDATE
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owners delete their own"
ON public.creations FOR DELETE
USING (user_id = auth.uid());

CREATE INDEX creations_created_at_idx ON public.creations (created_at DESC);
CREATE INDEX creations_user_idx ON public.creations (user_id);

CREATE POLICY "Read creations bucket"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'creations');

CREATE POLICY "Upload to creations bucket"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'creations');
