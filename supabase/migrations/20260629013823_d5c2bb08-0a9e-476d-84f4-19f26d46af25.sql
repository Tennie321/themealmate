ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS streak_freeze_count INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS streak_freeze_reset_date DATE;