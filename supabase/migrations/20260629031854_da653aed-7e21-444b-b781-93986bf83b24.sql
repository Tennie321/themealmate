-- Reset profile column grants: only id + display_name globally readable
REVOKE SELECT ON public.profiles FROM authenticated, anon;
GRANT SELECT (id, display_name) ON public.profiles TO authenticated, anon;
GRANT INSERT, UPDATE ON public.profiles TO authenticated;

-- Cross-user SELECT policy (limited to safe columns by column grants)
DROP POLICY IF EXISTS "public display name readable" ON public.profiles;
CREATE POLICY "public display name readable"
  ON public.profiles FOR SELECT TO authenticated, anon
  USING (true);

-- Owner full-row access via SECURITY DEFINER helper (column grants would otherwise block it)
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS public.profiles
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.profiles WHERE id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
