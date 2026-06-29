-- 1) Profiles: drop cross-user readable policy; expose only display_name via a view
DROP POLICY IF EXISTS "profiles of post authors readable to authed" ON public.profiles;

CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = true) AS
SELECT id, display_name FROM public.profiles;

GRANT SELECT ON public.public_profiles TO authenticated, anon;

-- Allow the view's underlying select via a narrow policy that anyone authed can use,
-- but only exposes the two columns selected by the view.
CREATE POLICY "public display name readable"
  ON public.profiles FOR SELECT TO authenticated, anon
  USING (true);

-- Revoke direct column-level read of sensitive columns by re-granting only safe columns
-- to authenticated/anon. Owners still read their own full row through the
-- "own profile select" policy combined with the column grant below.
REVOKE SELECT ON public.profiles FROM authenticated, anon;
GRANT SELECT (id, display_name) ON public.profiles TO authenticated, anon;
-- Owners need full-column read for their own row; grant via SECURITY DEFINER helper.
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS public.profiles
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.profiles WHERE id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

-- Owner needs to update their full row — keep table-level UPDATE/INSERT grants to all columns.
GRANT INSERT, UPDATE ON public.profiles TO authenticated;

-- Also grant authenticated SELECT on full row via the existing "own profile select" RLS,
-- by issuing column grants for every column. We do this dynamically.
DO $$
DECLARE colnames text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ',') INTO colnames
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles';
  EXECUTE format('GRANT SELECT (%s) ON public.profiles TO authenticated', colnames);
END $$;
-- NOTE: column grants apply globally to the role. To restrict cross-user reads to only
-- display_name, we rely on the RLS policy "public display name readable" being limited
-- in practice by application code using the public_profiles view for cross-user lookups.
-- Drop the broad cross-user policy and reintroduce a narrower one:
DROP POLICY IF EXISTS "public display name readable" ON public.profiles;
-- Final policies: owners can read their full row; cross-user reads go through public_profiles view.

-- 2) Referrals: hide referred_email from authenticated reads
REVOKE SELECT ON public.referrals FROM authenticated, anon;
GRANT SELECT (id, referrer_id, referred_user_id, status, created_at, converted_at)
  ON public.referrals TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.referrals TO authenticated;

-- 3) user_badges: prevent self-awarding
DROP POLICY IF EXISTS "badges own" ON public.user_badges;
CREATE POLICY "badges own read"
  ON public.user_badges FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "badges own delete"
  ON public.user_badges FOR DELETE TO authenticated USING (auth.uid() = user_id);
-- No INSERT/UPDATE policies → only service_role can write.
