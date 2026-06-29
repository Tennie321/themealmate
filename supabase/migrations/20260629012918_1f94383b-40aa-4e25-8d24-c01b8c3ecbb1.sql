ALTER TABLE public.user_goals ADD COLUMN IF NOT EXISTS start_weight_kg NUMERIC(6,1);
ALTER TABLE public.user_goals ADD COLUMN IF NOT EXISTS target_weight_kg NUMERIC(6,1);