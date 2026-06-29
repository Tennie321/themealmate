
-- Lock down get_public_profiles: only service_role may execute (called from server-side admin client)
REVOKE EXECUTE ON FUNCTION public.get_public_profiles(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_profiles(uuid[]) TO service_role;

-- Restrict community reads to signed-in users so author UUIDs aren't publicly enumerable
DROP POLICY IF EXISTS "posts public read" ON public.posts;
CREATE POLICY "posts authenticated read" ON public.posts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "comments public read" ON public.post_comments;
CREATE POLICY "comments authenticated read" ON public.post_comments
  FOR SELECT TO authenticated USING (true);

REVOKE SELECT ON public.posts FROM anon;
REVOKE SELECT ON public.post_comments FROM anon;
