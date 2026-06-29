CREATE TABLE IF NOT EXISTS public.custom_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  calories INT NOT NULL DEFAULT 0,
  protein_g NUMERIC(6,1) NOT NULL DEFAULT 0,
  source TEXT,
  logged_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_meals TO authenticated;
GRANT ALL ON public.custom_meals TO service_role;
ALTER TABLE public.custom_meals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own custom meals" ON public.custom_meals;
CREATE POLICY "own custom meals" ON public.custom_meals
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS custom_meals_user_day_idx
  ON public.custom_meals(user_id, logged_on);
