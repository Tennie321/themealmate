DROP POLICY IF EXISTS "post-images read all" ON storage.objects;
CREATE POLICY "post-images read authenticated" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'post-images');