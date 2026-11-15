-- Mind maps for lessons: public read, teacher-only writes.
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS mind_map_url TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('lesson-mindmaps', 'lesson-mindmaps', true, 5242880, ARRAY['image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 5242880, allowed_mime_types = ARRAY['image/webp'];

DROP POLICY IF EXISTS "Public can read lesson mind maps" ON storage.objects;
CREATE POLICY "Public can read lesson mind maps"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'lesson-mindmaps');

DROP POLICY IF EXISTS "Teachers manage lesson mind maps" ON storage.objects;
CREATE POLICY "Teachers manage lesson mind maps"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'lesson-mindmaps' AND auth.jwt() ->> 'email' = 'ainapercky@gmail.com')
WITH CHECK (bucket_id = 'lesson-mindmaps' AND auth.jwt() ->> 'email' = 'ainapercky@gmail.com');

NOTIFY pgrst, 'reload schema';
