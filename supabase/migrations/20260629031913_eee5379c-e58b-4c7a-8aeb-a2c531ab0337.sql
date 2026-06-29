-- Restore broad SELECT grant to authenticated/anon; cross-user exposure is controlled by RLS instead
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT (id, display_name) ON public.profiles TO anon;

-- Remove the broad cross-user SELECT policy; only owners can SELECT directly
DROP POLICY IF EXISTS "public display name readable" ON public.profiles;

-- Cross-user lookups (e.g. comment authors) go through this view, which exposes only safe cols
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = false) AS
SELECT id, display_name FROM public.profiles;
GRANT SELECT ON public.public_profiles TO authenticated, anon;

-- Drop the now-unused helper function and its linter warning
DROP FUNCTION IF EXISTS public.get_my_profile();
