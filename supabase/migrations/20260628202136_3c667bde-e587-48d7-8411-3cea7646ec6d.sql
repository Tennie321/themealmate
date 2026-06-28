
-- ENUMS
CREATE TYPE public.goal_type AS ENUM ('cut','lean_bulk','maintain','custom');
CREATE TYPE public.meal_slot AS ENUM ('breakfast','lunch','dinner','snack','drink');
CREATE TYPE public.plan_status AS ENUM ('active','completed','archived');
CREATE TYPE public.taste_signal AS ENUM ('liked','disliked','swapped_out','eaten','favorited');
CREATE TYPE public.shopping_status AS ENUM ('open','completed');

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  onboarded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- USER GOALS
CREATE TABLE public.user_goals (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_type public.goal_type NOT NULL DEFAULT 'maintain',
  calorie_target INT NOT NULL DEFAULT 2200,
  protein_target INT NOT NULL DEFAULT 160,
  daily_budget_cents INT NOT NULL DEFAULT 1500,
  biometrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  tdee INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_goals TO authenticated;
GRANT ALL ON public.user_goals TO service_role;
ALTER TABLE public.user_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own goals" ON public.user_goals FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- PREFERENCES
CREATE TABLE public.preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  allergies TEXT[] NOT NULL DEFAULT '{}',
  dislikes TEXT[] NOT NULL DEFAULT '{}',
  diet_tags TEXT[] NOT NULL DEFAULT '{}',
  favorite_brands TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.preferences TO authenticated;
GRANT ALL ON public.preferences TO service_role;
ALTER TABLE public.preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prefs" ON public.preferences FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- STORES (public)
CREATE TABLE public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  chain TEXT NOT NULL,
  website TEXT,
  city TEXT,
  state TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stores TO anon, authenticated;
GRANT ALL ON public.stores TO service_role;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stores public read" ON public.stores FOR SELECT USING (true);

-- USER STORE
CREATE TABLE public.user_store (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_store TO authenticated;
GRANT ALL ON public.user_store TO service_role;
ALTER TABLE public.user_store ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own user_store" ON public.user_store FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- CATALOG ITEMS (public read; service writes via server fn)
CREATE TABLE public.catalog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_chain TEXT NOT NULL, -- references stores.chain (denormalized for fast queries)
  name TEXT NOT NULL,
  brand TEXT,
  category TEXT NOT NULL, -- protein, carb, fat, produce, dairy, drink, snack, condiment, meal
  aisle TEXT NOT NULL DEFAULT 'General',
  calories INT NOT NULL,
  protein_g NUMERIC(6,2) NOT NULL DEFAULT 0,
  carbs_g NUMERIC(6,2) NOT NULL DEFAULT 0,
  fat_g NUMERIC(6,2) NOT NULL DEFAULT 0,
  serving_label TEXT NOT NULL DEFAULT '1 serving',
  price_cents INT NOT NULL DEFAULT 0,
  image_url TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  diet_tags TEXT[] NOT NULL DEFAULT '{}', -- vegetarian, vegan, gluten_free, dairy_free, halal, kosher
  allergens TEXT[] NOT NULL DEFAULT '{}', -- dairy, gluten, soy, peanut, treenut, egg, fish, shellfish
  in_stock BOOLEAN NOT NULL DEFAULT true,
  source_url TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX catalog_chain_idx ON public.catalog_items(store_chain);
CREATE INDEX catalog_category_idx ON public.catalog_items(category);
GRANT SELECT ON public.catalog_items TO anon, authenticated;
GRANT ALL ON public.catalog_items TO service_role;
ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog public read" ON public.catalog_items FOR SELECT USING (true);

-- MEAL PLANS
CREATE TABLE public.meal_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_date DATE NOT NULL,
  total_calories INT NOT NULL DEFAULT 0,
  total_protein NUMERIC(7,2) NOT NULL DEFAULT 0,
  total_cost_cents INT NOT NULL DEFAULT 0,
  status public.plan_status NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, plan_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_plans TO authenticated;
GRANT ALL ON public.meal_plans TO service_role;
ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own plans" ON public.meal_plans FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- PLAN ITEMS
CREATE TABLE public.plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.meal_plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meal_slot public.meal_slot NOT NULL,
  catalog_item_id UUID NOT NULL REFERENCES public.catalog_items(id) ON DELETE RESTRICT,
  servings NUMERIC(5,2) NOT NULL DEFAULT 1,
  position INT NOT NULL DEFAULT 0,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX plan_items_plan_idx ON public.plan_items(plan_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_items TO authenticated;
GRANT ALL ON public.plan_items TO service_role;
ALTER TABLE public.plan_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own plan items" ON public.plan_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- FAVORITES
CREATE TABLE public.favorites (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  catalog_item_id UUID NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, catalog_item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorites TO authenticated;
GRANT ALL ON public.favorites TO service_role;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own favs" ON public.favorites FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- TASTE SIGNALS
CREATE TABLE public.taste_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  catalog_item_id UUID NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  signal public.taste_signal NOT NULL,
  weight INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX taste_user_idx ON public.taste_signals(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.taste_signals TO authenticated;
GRANT ALL ON public.taste_signals TO service_role;
ALTER TABLE public.taste_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own signals" ON public.taste_signals FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- CHECK INS
CREATE TABLE public.check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.meal_plans(id) ON DELETE SET NULL,
  plan_date DATE NOT NULL,
  calories_actual INT NOT NULL DEFAULT 0,
  protein_actual NUMERIC(7,2) NOT NULL DEFAULT 0,
  calories_target INT NOT NULL DEFAULT 0,
  protein_target INT NOT NULL DEFAULT 0,
  adherence_pct INT NOT NULL DEFAULT 0,
  notes TEXT,
  reflection TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, plan_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.check_ins TO authenticated;
GRANT ALL ON public.check_ins TO service_role;
ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own checkins" ON public.check_ins FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- SHOPPING LISTS
CREATE TABLE public.shopping_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.meal_plans(id) ON DELETE CASCADE,
  status public.shopping_status NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(plan_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_lists TO authenticated;
GRANT ALL ON public.shopping_lists TO service_role;
ALTER TABLE public.shopping_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own lists" ON public.shopping_lists FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.shopping_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES public.shopping_lists(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  catalog_item_id UUID NOT NULL REFERENCES public.catalog_items(id) ON DELETE RESTRICT,
  qty NUMERIC(5,2) NOT NULL DEFAULT 1,
  checked BOOLEAN NOT NULL DEFAULT false,
  substituted_with_id UUID REFERENCES public.catalog_items(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sli_list_idx ON public.shopping_list_items(list_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_list_items TO authenticated;
GRANT ALL ON public.shopping_list_items TO service_role;
ALTER TABLE public.shopping_list_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own list items" ON public.shopping_list_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- AUTO-CREATE PROFILE TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- SEED STORES
INSERT INTO public.stores (name, chain, website) VALUES
  ('Walmart Supercenter', 'walmart', 'https://www.walmart.com'),
  ('Target', 'target', 'https://www.target.com'),
  ('Kroger', 'kroger', 'https://www.kroger.com'),
  ('Trader Joe''s', 'trader_joes', 'https://www.traderjoes.com'),
  ('Whole Foods Market', 'whole_foods', 'https://www.wholefoodsmarket.com'),
  ('Costco', 'costco', 'https://www.costco.com'),
  ('Publix', 'publix', 'https://www.publix.com'),
  ('Aldi', 'aldi', 'https://www.aldi.us'),
  ('Safeway', 'safeway', 'https://www.safeway.com'),
  ('H-E-B', 'heb', 'https://www.heb.com');
