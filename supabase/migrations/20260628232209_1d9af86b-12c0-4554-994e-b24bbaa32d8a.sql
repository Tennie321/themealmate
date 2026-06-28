
-- Fix profiles_public_via_post_authors: restrict to authenticated users
DROP POLICY IF EXISTS "profiles readable for post authors" ON public.profiles;
CREATE POLICY "profiles of post authors readable to authed"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.user_id = profiles.id));

-- Also scope own-profile policies to authenticated (explicit intent)
DROP POLICY IF EXISTS "own profile select" ON public.profiles;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "own profile update" ON public.profiles;
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "own profile insert" ON public.profiles;
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Scope sensitive user tables to authenticated role explicitly
DROP POLICY IF EXISTS "own goals" ON public.user_goals;
CREATE POLICY "own goals" ON public.user_goals FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own prefs" ON public.preferences;
CREATE POLICY "own prefs" ON public.preferences FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own plans" ON public.meal_plans;
CREATE POLICY "own plans" ON public.meal_plans FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own plan items" ON public.plan_items;
CREATE POLICY "own plan items" ON public.plan_items FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own signals" ON public.taste_signals;
CREATE POLICY "own signals" ON public.taste_signals FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own lists" ON public.shopping_lists;
CREATE POLICY "own lists" ON public.shopping_lists FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own list items" ON public.shopping_list_items;
CREATE POLICY "own list items" ON public.shopping_list_items FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own checkins" ON public.check_ins;
CREATE POLICY "own checkins" ON public.check_ins FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own favs" ON public.favorites;
CREATE POLICY "own favs" ON public.favorites FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
