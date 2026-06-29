
-- Zero-Thinking food schema additions
ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS is_natural_single_serve boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_pre_portioned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_cooking boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cooking_method text,
  ADD COLUMN IF NOT EXISTS cooking_time_minutes integer,
  ADD COLUMN IF NOT EXISTS servings_per_package numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS macro_confidence text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS zero_thinking_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS how_to_eat text;

-- Heuristic: anything obviously "bulk/raw" is NOT eligible
-- Step 1: default everything to eligible, then strip out the bulk/raw stuff
UPDATE public.catalog_items SET zero_thinking_eligible = true;

UPDATE public.catalog_items
SET zero_thinking_eligible = false,
    macro_confidence = 'low'
WHERE
  -- raw proteins
  lower(name) ~ '(raw |fresh |whole )?(chicken breast|chicken thigh|chicken tender|ground beef|ground turkey|ground chicken|steak|sirloin|ribeye|pork chop|pork loin|salmon fillet|tilapia|cod fillet|tuna steak|shrimp|scallop|lamb chop|rotisserie chicken|whole chicken)'
  -- bulk grains/legumes
  OR lower(name) ~ '\b(rice|pasta|spaghetti|penne|macaroni|noodle|oats|oatmeal|quinoa|couscous|barley|lentil|chickpea|black bean|kidney bean|pinto bean|navy bean|farro|bulgur)\b'
     AND lower(name) !~ '(cup|packet|single|instant|microwav|ready)'
  -- bulk produce
  OR lower(name) ~ '\b(potato|sweet potato|squash|broccoli|cauliflower|spinach|kale|lettuce|cabbage|onion|garlic|bell pepper|cucumber|zucchini|asparagus|tomato)\b'
     AND lower(name) !~ '(baby|cup|pack|single|pre-?cut|salad kit|microwav|ready)'
  -- bulk dairy / tubs
  OR lower(name) ~ '(yogurt tub|cottage cheese tub|hummus tub|guacamole tub|salsa jar|peanut butter jar|nut butter jar|cheese block|deli meat \(bulk\)|butter stick|cooking oil|olive oil|coconut oil)'
  -- bulk pantry
  OR lower(name) ~ '(flour|sugar|honey jar|jam jar|jelly jar|syrup bottle|protein powder|whey powder|casein)'
  -- generic bulk indicators
  OR lower(serving_label) ~ '\b(oz|ounce|gram|grams|gm|tbsp|tablespoon|tsp|teaspoon|ml|cup of|1/2 cup|1/4 cup|3/4 cup)\b'
     AND lower(serving_label) !~ '(1 cup|1 fl oz can|fl oz bottle|fl oz can)';

-- Mark obvious natural single-serve produce
UPDATE public.catalog_items
SET is_natural_single_serve = true, macro_confidence = 'high', zero_thinking_eligible = true
WHERE lower(name) ~ '\b(1 medium |1 large |1 small |medium |large )?(banana|apple|orange|pear|peach|nectarine|plum|kiwi|avocado|egg|hard.?boiled egg)\b'
  AND lower(name) !~ '(juice|sauce|chip|smoothie)';

-- Mark labeled prepackaged items as pre_portioned (heuristic)
UPDATE public.catalog_items
SET is_pre_portioned = true, macro_confidence = 'exact', zero_thinking_eligible = true
WHERE zero_thinking_eligible = true
  AND (
    is_single_serving = true
    OR lower(name) ~ '(bar|cup|pouch|packet|stick|bottle|can|bag|carton|sandwich|wrap|burrito|pizza|meal|bowl|shake|drink|kit|pack|tray|sleeve|box)'
    OR lower(serving_label) ~ '(1 bar|1 cup|1 bottle|1 can|1 packet|1 pouch|1 stick|1 bag|1 sandwich|1 wrap|1 meal|1 tray|1 pack)'
  );

-- Set cooking flags from category/name hints
UPDATE public.catalog_items
SET requires_cooking = true, cooking_method = 'microwave', cooking_time_minutes = 4
WHERE lower(name) ~ '(frozen|lean cuisine|stouffer|healthy choice|amy''?s|el monterey|hot pocket|microwav|cup noodle|ramen|mac.?and.?cheese cup|chili cup|soup cup|oatmeal packet)'
  AND zero_thinking_eligible = true;

UPDATE public.catalog_items
SET requires_cooking = true, cooking_method = 'toaster', cooking_time_minutes = 3
WHERE lower(name) ~ '(waffle|toaster pastry|pop.?tart|english muffin|bagel|toast)'
  AND zero_thinking_eligible = true;
