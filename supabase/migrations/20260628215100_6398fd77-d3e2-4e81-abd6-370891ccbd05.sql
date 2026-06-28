
-- Restrict profiles public read to authors of posts only
DROP POLICY IF EXISTS "profiles public read" ON public.profiles;

CREATE POLICY "profiles readable for post authors"
ON public.profiles FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.posts p WHERE p.user_id = profiles.id)
);

-- Add explicit UPDATE policy on post-images storage to mirror INSERT ownership scoping
DROP POLICY IF EXISTS "post-images owner update" ON storage.objects;
CREATE POLICY "post-images owner update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'post-images' AND (auth.uid())::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'post-images' AND (auth.uid())::text = (storage.foldername(name))[1]);
