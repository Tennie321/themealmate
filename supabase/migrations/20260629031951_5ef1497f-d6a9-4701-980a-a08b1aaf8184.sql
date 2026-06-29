-- Restore broad column grant for authenticated; rely on RLS for row-level filtering
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT ON public.profiles TO authenticated;

-- Remove the cross-user broad SELECT policy entirely
DROP POLICY IF EXISTS "public profile basic readable" ON public.profiles;

-- Cross-user access goes through public_profiles view, which has SECURITY DEFINER semantics needed
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles AS
SELECT id, display_name FROM public.profiles;
ALTER VIEW public.public_profiles OWNER TO postgres;
GRANT SELECT ON public.public_profiles TO authenticated, anon;

-- Drop the now-unused helper
DROP FUNCTION IF EXISTS public.get_my_profile();
