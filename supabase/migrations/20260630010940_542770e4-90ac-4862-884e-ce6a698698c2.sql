
-- 1) post_likes: restrict SELECT to authenticated
DROP POLICY IF EXISTS "likes public read" ON public.post_likes;
CREATE POLICY "likes authenticated read" ON public.post_likes
  FOR SELECT TO authenticated USING (true);

-- 2) profiles: prevent self-escalation of privileged columns via trigger
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('role', true) <> 'service_role' THEN
    NEW.is_premium := OLD.is_premium;
    NEW.plan_tier := OLD.plan_tier;
    NEW.premium_expires_at := OLD.premium_expires_at;
    NEW.plan_expires_at := OLD.plan_expires_at;
    NEW.plans_generated_count := OLD.plans_generated_count;
    NEW.streak_freeze_count := OLD.streak_freeze_count;
    NEW.streak_freeze_reset_date := OLD.streak_freeze_reset_date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_privilege_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 3) referrals: remove SELECT exposure; keep write-own via separate policies
DROP POLICY IF EXISTS "own referrals" ON public.referrals;
CREATE POLICY "own referrals insert" ON public.referrals
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = referrer_id);
CREATE POLICY "own referrals update" ON public.referrals
  FOR UPDATE TO authenticated USING (auth.uid() = referrer_id) WITH CHECK (auth.uid() = referrer_id);
CREATE POLICY "own referrals delete" ON public.referrals
  FOR DELETE TO authenticated USING (auth.uid() = referrer_id);

-- Safe RPC that omits referred_email
CREATE OR REPLACE FUNCTION public.get_my_referrals()
RETURNS TABLE(status text, created_at timestamptz, converted_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.status, r.created_at, r.converted_at
  FROM public.referrals r
  WHERE r.referrer_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.get_my_referrals() TO authenticated;

-- 4) user_goals: server-side validation of biometrics integrity
CREATE OR REPLACE FUNCTION public.validate_user_goals()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.calorie_target IS NOT NULL AND (NEW.calorie_target < 800 OR NEW.calorie_target > 8000) THEN
    RAISE EXCEPTION 'calorie_target out of allowed range (800-8000)';
  END IF;
  IF NEW.protein_target IS NOT NULL AND (NEW.protein_target < 20 OR NEW.protein_target > 500) THEN
    RAISE EXCEPTION 'protein_target out of allowed range (20-500)';
  END IF;
  IF NEW.tdee IS NOT NULL AND (NEW.tdee < 800 OR NEW.tdee > 8000) THEN
    RAISE EXCEPTION 'tdee out of allowed range (800-8000)';
  END IF;
  IF NEW.daily_budget_cents IS NOT NULL AND (NEW.daily_budget_cents < 0 OR NEW.daily_budget_cents > 1000000) THEN
    RAISE EXCEPTION 'daily_budget_cents out of allowed range';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_goals_validate_insert ON public.user_goals;
DROP TRIGGER IF EXISTS user_goals_validate_update ON public.user_goals;
CREATE TRIGGER user_goals_validate_insert
  BEFORE INSERT ON public.user_goals
  FOR EACH ROW EXECUTE FUNCTION public.validate_user_goals();
CREATE TRIGGER user_goals_validate_update
  BEFORE UPDATE ON public.user_goals
  FOR EACH ROW EXECUTE FUNCTION public.validate_user_goals();
