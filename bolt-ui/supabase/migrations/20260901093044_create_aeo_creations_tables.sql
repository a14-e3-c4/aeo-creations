/*
# Create aeo.creations core tables

## Overview
Creates the database schema for the aeo.creations AI Video Studio app.
This is a single-tenant app (no sign-in) — all data is intentionally shared/public.

## New Tables

### 1. generations
Stores all AI-generated images and videos (text-to-image, text-to-video, image-to-video).
- `id` — uuid primary key
- `type` — text: 'image' | 'video' | 'ai-video'
- `prompt` — text: the user's prompt
- `model` — text: which AI model was used
- `style` — text: visual style preset
- `aspect_ratio` — text: e.g. '16:9', '9:16', '1:1'
- `resolution` — text: e.g. '4K', '1080p', '720p'
- `width` — int: pixel width
- `height` — int: pixel height
- `effect` — text: Ken Burns effect name (for image-to-video)
- `duration` — float: video duration in seconds
- `media_url` — text: URL to the generated media (Supabase Storage or external)
- `thumbnail_url` — text: optional thumbnail URL
- `status` — text: 'completed' | 'failed' | 'pending'
- `metadata` — jsonb: extra data (seed, negative_prompt, etc.)
- `created_at` — timestamp

### 2. library
Stores uploaded media files (images and videos the user uploads).
- `id` — uuid primary key
- `filename` — text: original filename
- `type` — text: 'image' | 'video'
- `url` — text: URL to the file
- `size` — bigint: file size in bytes
- `created_at` — timestamp

### 3. usage_log
Tracks API usage for rate limiting and analytics.
- `id` — uuid primary key
- `action` — text: what was called (e.g. 'generate', 'ai-video', 'script')
- `model` — text: which model
- `status` — text: 'ok' | 'error'
- `created_at` — timestamp

## Security
- RLS enabled on all tables.
- All policies allow anon + authenticated CRUD (single-tenant, public data).
*/

CREATE TABLE IF NOT EXISTS generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'image',
  prompt text,
  model text,
  style text,
  aspect_ratio text,
  resolution text,
  width int,
  height int,
  effect text,
  duration float,
  media_url text,
  thumbnail_url text,
  status text NOT NULL DEFAULT 'completed',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE generations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_generations" ON generations;
CREATE POLICY "anon_select_generations" ON generations FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_generations" ON generations;
CREATE POLICY "anon_insert_generations" ON generations FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_generations" ON generations;
CREATE POLICY "anon_update_generations" ON generations FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_generations" ON generations;
CREATE POLICY "anon_delete_generations" ON generations FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  type text NOT NULL DEFAULT 'image',
  url text NOT NULL,
  size bigint DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_library" ON library;
CREATE POLICY "anon_select_library" ON library FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_library" ON library;
CREATE POLICY "anon_insert_library" ON library FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_library" ON library;
CREATE POLICY "anon_update_library" ON library FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_library" ON library;
CREATE POLICY "anon_delete_library" ON library FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  model text,
  status text NOT NULL DEFAULT 'ok',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_usage" ON usage_log;
CREATE POLICY "anon_select_usage" ON usage_log FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_usage" ON usage_log;
CREATE POLICY "anon_insert_usage" ON usage_log FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_usage" ON usage_log;
CREATE POLICY "anon_delete_usage" ON usage_log FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_library_created_at ON library (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_log_created_at ON usage_log (created_at DESC);
