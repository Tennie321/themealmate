
# MealMate — Build Plan

"Eat this, get there." Mobile-first PWA-style web app with fresh greens + warm oranges, big readable typography, generous spacing.

## Stack
- TanStack Start (existing), Tailwind v4
- Lovable Cloud for auth + Postgres + RLS
- Lovable AI Gateway (`google/gemini-3-flash-preview`) for plan generation + taste learning
- Firecrawl connector (server-side) for catalog seeding from store websites

## Color palette (src/styles.css tokens)
- `--primary` fresh green ~ oklch(0.65 0.18 145)
- `--accent` warm orange ~ oklch(0.72 0.17 55)
- `--background` warm off-white ~ oklch(0.99 0.01 90)
- `--foreground` deep forest ~ oklch(0.22 0.04 150)
- Gradient `--gradient-hero` from primary → accent
- Font pair: Outfit (headings) + Figtree (body) via @fontsource

## Data model (Supabase migration)
- `profiles` (id→auth.users, display_name, created_at)
- `user_goals` (user_id, goal_type enum: cut/lean_bulk/maintain/custom, calorie_target, protein_target, daily_budget_cents, biometrics jsonb {sex, age, height_cm, weight_kg, activity_level}, tdee int)
- `preferences` (user_id, allergies text[], dislikes text[], diet_tags text[] e.g. vegetarian/halal, favorite_brands text[])
- `stores` (id, name, chain, address, lat, lng) — seeded with common chains
- `user_store` (user_id, store_id, is_primary)
- `catalog_items` (id, store_id, name, brand, category, aisle, upc, calories, protein_g, carbs_g, fat_g, serving_size, price_cents, image_url, tags text[], in_stock bool default true, source_url, last_seen_at)
- `meal_plans` (id, user_id, plan_date, total_calories, total_protein, total_cost_cents, status enum: active/completed)
- `plan_items` (id, plan_plan_id, meal_slot enum: breakfast/lunch/dinner/snack/drink, catalog_item_id, servings numeric, position int, is_locked bool)
- `favorites` (user_id, catalog_item_id, created_at)
- `taste_signals` (user_id, catalog_item_id, signal enum: liked/disliked/swapped_out/eaten, weight int, created_at) — feeds AI learning
- `check_ins` (id, user_id, plan_id, plan_date, calories_actual, protein_actual, adherence_pct, notes, created_at)
- `shopping_lists` (id, user_id, plan_id, status) + `shopping_list_items` (list_id, catalog_item_id, qty, checked bool, substituted_with_id nullable)

All tables: GRANT to authenticated + service_role, RLS scoped to `auth.uid()`. Stores + catalog readable by `anon` for browsing.

## Catalog seeding strategy
Per user-selected store, a server function uses Firecrawl to scrape that chain's online store/weekly-ad pages and an LLM normalizer extracts {name, brand, category, aisle, macros (from nutrition label), price, image_url}. Cached in `catalog_items` per store. Re-scrape on demand (button) and nightly stale check via `last_seen_at`. Seed migration ships ~150 hand-curated common items (Premier Protein, Fairlife, Oikos Pro, RXBAR, Kirkland chicken, etc.) tagged for major chains so the app works instantly before scraping completes.

## Routes (TanStack file-based, mobile-first)
```
src/routes/
  __root.tsx                 (shell, header, bottom nav for authed)
  index.tsx                  (landing: hero "Eat this, get there.", CTA)
  auth.tsx                   (email + Google login)
  onboarding.tsx             (multi-step layout with <Outlet/>)
  onboarding.goal.tsx        (cut/lean bulk/maintain/custom)
  onboarding.biometrics.tsx  (auto TDEE calc, calorie+protein targets prefilled)
  onboarding.store.tsx       (search nearby chains, pick primary)
  onboarding.budget.tsx      (daily $ slider)
  onboarding.preferences.tsx (allergies, dislikes, diet tags)
  _authenticated/route.tsx   (managed gate)
  _authenticated/dashboard.tsx       (today's plan: breakfast/lunch/dinner/snacks/drinks cards, macro+budget rings)
  _authenticated/meal.$slot.tsx      (meal detail, swap whole meal or individual items)
  _authenticated/swap.$itemId.tsx    (suggested alternates with macro deltas)
  _authenticated/shopping.tsx        (grouped by aisle, prices, check-off, "out of stock — swap" button)
  _authenticated/checkin.tsx         ("You said X — here's what happened" with adherence chart)
  _authenticated/favorites.tsx
  _authenticated/profile.tsx         (edit goals, store, budget, preferences, sign out)
```

## Server functions (`src/lib/*.functions.ts`)
- `generatePlan` — auth required. Inputs: date. Pulls user goals + prefs + favorites + taste_signals + store catalog. Calls Gemini with structured Output schema (zod) returning ordered plan_items hitting calorie/protein within ±5%, under budget, respecting allergies, weighted toward favorites/liked items. Persists plan + items + shopping_list.
- `swapItem` — given plan_item_id, returns 3–5 alternates from same store catalog with delta macros + price; on confirm replaces item, recomputes totals, updates shopping list, logs `swapped_out` taste signal.
- `swapMeal` — regenerate one slot only.
- `markOutOfStock` — flips `in_stock=false` on catalog_item for that store and triggers swap.
- `submitCheckin` — stores actuals, computes adherence, returns Gemini-written one-paragraph reflection.
- `refreshStoreCatalog` — Firecrawl + LLM normalize (rate-limited, button-triggered).
- `toggleFavorite`, `logTasteSignal`.

## AI prompt shape (plan generation)
System: "You are MealMate. Build a one-day plan using ONLY the provided catalog items. Hit calorie target ±5%, meet or exceed protein target, stay under budget. Always include 1 breakfast, 1 lunch, 1 dinner, 1–2 snacks, and ≥2 drinks (water always free; coffee/tea/protein shake when fits). Respect allergies as hard constraints. Prefer items in `favorites` and items with positive taste signals; avoid disliked items. Return JSON matching schema."
Tools: none — single structured-output call. `stepCountIs` N/A.

## Drinks logic
Catalog has a `drinks` category seeded with: water (free, 0 cal), black coffee, green tea, Premier Protein 30g, Fairlife Core Power 26g/42g. Prompt instructs ≥2 drinks per plan, water always included as the free baseline.

## Swap system UX
- Per meal card: "Swap meal" pill + per-ingredient row tap → swap sheet (Drawer) with alternates, each row showing Δcal / Δprotein / Δ$ chips colored green/red.
- Locked items (user pinned favorite) skipped in regeneration.

## Shopping list
- Auto-built from active plan, grouped by `aisle`, totals per aisle and grand total vs daily budget.
- Each row: image, name, brand, qty, price, checkbox.
- "Out of stock" button → calls `markOutOfStock` + `swapItem`, replacement appears in list with a small "substituted" badge.

## Budget tracking
- Daily ring on dashboard: spent (sum of plan_items prices) vs `daily_budget_cents`.
- Over-budget state: ring turns warm-orange, banner "Try a swap to save $X" linking to most-expensive item's swap sheet.

## End-of-day check-in
- Bottom-nav badge appears after 7pm local.
- Form: actual calories + protein (prefilled from checked shopping items), free-text notes.
- Result screen: "You said 2200 cal / 180g. You hit 2080 / 174g. 94% adherence." + Gemini-generated encouragement paragraph + 7-day adherence sparkline.

## Favorites + taste learning
- Heart icon everywhere → `favorites` table.
- Every swap, check-off, dislike emits a `taste_signals` row. `generatePlan` aggregates last 60 days of signals into a "preferred_brands / avoid" block injected into the prompt.

## Auth
Email/password + Google via `lovable.auth.signInWithOAuth("google")`. After signup, redirect to `/onboarding/goal`. After last onboarding step, redirect to `/dashboard` and auto-call `generatePlan` for today.

## Build order (single batch, end-to-end)
1. Enable Lovable Cloud + configure Google social auth.
2. Migration: enums, all tables, RLS, grants, seed stores + ~150 catalog items.
3. Provision `LOVABLE_API_KEY`; connect Firecrawl (ask user).
4. Design tokens in `src/styles.css`; install fonts; build shared layout (header + bottom nav).
5. Landing + auth pages.
6. Onboarding flow (5 steps) with auto TDEE (Mifflin-St Jeor).
7. `_authenticated` gate, dashboard skeleton with macro/budget rings.
8. `generatePlan` server fn + structured Output schema.
9. Meal detail + swap drawer + `swapItem`/`swapMeal`.
10. Shopping list page with aisle grouping + out-of-stock swap.
11. Check-in flow + adherence sparkline.
12. Favorites page + heart toggles.
13. `refreshStoreCatalog` (Firecrawl) wired to a "Refresh store" button in profile.
14. Profile / edit goals / sign out.
15. SEO + manifest + mobile viewport polish.

## Out of scope for v1 (call out to user)
- Real-time store inventory APIs (Kroger/Walmart) — using scraped + curated catalog with user-driven out-of-stock swaps instead.
- Native mobile app — this is a mobile-first web app.
- Payment / Stripe.
- Barcode scanning.

## Technical notes
- All AI + Firecrawl calls in `createServerFn` with `requireSupabaseAuth`; never expose `LOVABLE_API_KEY` or `FIRECRAWL_API_KEY` client-side.
- Catalog reads on public landing page use server publishable client with narrow anon SELECT policy.
- Plan generation persisted before returning so reloads are instant; dashboard loader uses `ensureQueryData`.
- Structured Output schema kept small (flat plan_items array) to avoid Gemini state limits.
- Validate all user inputs with zod (biometrics ranges, budget > 0, targets sane).
