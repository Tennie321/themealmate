DROP VIEW IF EXISTS public.public_profiles;

CREATE OR REPLACE FUNCTION public.get_public_profiles(_ids uuid[])
RETURNS TABLE(id uuid, display_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.display_name FROM public.profiles p WHERE p.id = ANY(_ids);
$$;
REVOKE ALL ON FUNCTION public.get_public_profiles(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_profiles(uuid[]) TO authenticated;
