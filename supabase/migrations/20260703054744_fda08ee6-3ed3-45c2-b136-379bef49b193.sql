
-- Add missing SELECT policy on referrals for referrers
CREATE POLICY "own referrals select" ON public.referrals
  FOR SELECT TO authenticated
  USING (auth.uid() = referrer_id);

-- Convert get_my_referrals to SECURITY INVOKER (RLS now permits the read)
CREATE OR REPLACE FUNCTION public.get_my_referrals()
 RETURNS TABLE(status text, created_at timestamp with time zone, converted_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  SELECT r.status, r.created_at, r.converted_at
  FROM public.referrals r
  WHERE r.referrer_id = auth.uid();
$function$;

-- get_public_profiles is only invoked by trusted server code using service_role.
-- Lock it down so anon/authenticated cannot call it directly.
REVOKE ALL ON FUNCTION public.get_public_profiles(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_profiles(uuid[]) TO service_role;
