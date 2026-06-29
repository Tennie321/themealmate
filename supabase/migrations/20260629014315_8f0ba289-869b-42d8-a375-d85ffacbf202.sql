
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan_tier TEXT NOT NULL DEFAULT 'free'
    CHECK (plan_tier IN ('free','pro','premium')),
  ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS plans_generated_on DATE,
  ADD COLUMN IF NOT EXISTS plans_generated_count INT NOT NULL DEFAULT 0;
