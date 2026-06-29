-- 1. Per-meal targets on user_goals
ALTER TABLE public.user_goals
  ADD COLUMN IF NOT EXISTS meal_targets JSONB
  DEFAULT '{"breakfast":{"cal":0,"protein":0},"lunch":{"cal":0,"protein":0},"dinner":{"cal":0,"protein":0},"snack":{"cal":0,"protein":0}}'::jsonb;

-- 2. Referrals: hide referred_email from the referrer
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.referrals FROM authenticated;
GRANT SELECT (id, referrer_id, referred_user_id, status, created_at, converted_at)
  ON public.referrals TO authenticated;
-- All inserts/updates go through supabaseAdmin (service_role), so authenticated needs no write grants.

-- 3. user_badges: only system can award badges
REVOKE INSERT, UPDATE ON public.user_badges FROM authenticated, anon;
-- Existing SELECT and DELETE policies + grants stay so users can read/remove their own badges.
GRANT SELECT, DELETE ON public.user_badges TO authenticated;
GRANT ALL ON public.user_badges TO service_role;
