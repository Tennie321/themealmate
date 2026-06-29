ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS streak_freeze_used_on DATE;