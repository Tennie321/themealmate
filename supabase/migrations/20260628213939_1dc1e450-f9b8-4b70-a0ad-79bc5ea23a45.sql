
CREATE POLICY "post-images read all" ON storage.objects FOR SELECT USING (bucket_id = 'post-images');
CREATE POLICY "post-images upload own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'post-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "post-images delete own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'post-images' AND auth.uid()::text = (storage.foldername(name))[1]);
