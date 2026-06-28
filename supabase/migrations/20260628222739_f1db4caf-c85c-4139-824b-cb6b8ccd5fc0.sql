
ALTER TABLE public.preferences ADD COLUMN IF NOT EXISTS single_serving_only boolean NOT NULL DEFAULT true;
ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS is_single_serving boolean NOT NULL DEFAULT false;

-- Heuristic tagging
UPDATE public.catalog_items SET is_single_serving = true
WHERE category IN ('protein_bar','shake','drink','snack','frozen_meal','yogurt')
   OR name ILIKE '%bar%'
   OR name ILIKE '%shake%'
   OR name ILIKE '%pouch%'
   OR name ILIKE '%single%'
   OR name ILIKE '%cup%'
   OR name ILIKE '%stick%'
   OR name ILIKE '%jerky%'
   OR name ILIKE '%can%'
   OR name ILIKE '%bottle%'
   OR name ILIKE '%packet%'
   OR name ILIKE '%individual%'
   OR name ILIKE '%premier protein%'
   OR name ILIKE '%fairlife%'
   OR name ILIKE '%muscle milk%'
   OR name ILIKE '%owyn%'
   OR name ILIKE '%core power%'
   OR name ILIKE '%chobani%'
   OR name ILIKE '%oikos%'
   OR name ILIKE '%two good%'
   OR name ILIKE '%skyr%'
   OR name ILIKE '%string cheese%'
   OR name ILIKE '%babybel%'
   OR name ILIKE '%hard boiled%'
   OR name ILIKE '%microwave%'
   OR name ILIKE '%instant oat%'
   OR name ILIKE '%banana%'
   OR name ILIKE '%apple%'
   OR name ILIKE '%orange%'
   OR name ILIKE '%egg bite%';

UPDATE public.catalog_items SET is_single_serving = false
WHERE name ILIKE '%ground turkey%'
   OR name ILIKE '%ground beef%'
   OR name ILIKE '%chicken breast%'
   OR name ILIKE '%chicken thigh%'
   OR name ILIKE '%salmon fillet%'
   OR name ILIKE '%salmon filet%'
   OR name ILIKE '%tilapia%'
   OR name ILIKE '%tofu block%'
   OR name ILIKE '%tortilla%'
   OR name ILIKE '%hummus%'
   OR name ILIKE '%nut butter%'
   OR name ILIKE '%peanut butter%'
   OR name ILIKE '%almond butter%'
   OR name ILIKE '%rolled oat%'
   OR name ILIKE '%oats %'
   OR name ILIKE '%rice %'
   OR name ILIKE '%quinoa %'
   OR name ILIKE '%family size%'
   OR name ILIKE '%bulk%'
   OR name ILIKE '%lb%'
   OR name ILIKE '%pound%';
