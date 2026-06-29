DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker = true) AS
SELECT id, display_name FROM public.profiles;
GRANT SELECT ON public.public_profiles TO authenticated, anon;

-- The view needs an RLS policy on profiles that lets anyone read id+display_name.
-- Column grants prevent leakage of other columns through the view.
-- For anon: column grant already limits to (id, display_name).
-- For authenticated: column grants currently include all (broad SELECT). Restrict cross-user reads
-- by adding a policy that allows reading any profile but rely on the view to project safe cols.
CREATE POLICY "public profile basic readable"
  ON public.profiles FOR SELECT TO authenticated, anon
  USING (true);

-- Re-restrict authenticated column grants so other users only see id+display_name directly too.
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, display_name) ON public.profiles TO authenticated;

-- Owners still need full row access. Add helper RPC.
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS SETOF public.profiles
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.profiles WHERE id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
