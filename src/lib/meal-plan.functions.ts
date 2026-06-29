import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

type Catalog = {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  aisle: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  price_cents: number;
  serving_label: string;
  tags: string[];
  diet_tags: string[];
  allergens: string[];
  in_stock: boolean;
  is_single_serving?: boolean;
};

type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

type GeneratedPlanItem = {
  catalog_item_id: string;
  meal_slot: MealSlot;
  servings: number;
  position: number;
};

const PlanSchema = z.object({
  items: z
    .array(
      z.object({
        catalog_item_id: z.string(),
        meal_slot: z.enum(["breakfast", "lunch", "dinner", "snack"]),
        servings: z.number().min(0.25).max(5),
        position: z.number().int().min(0).max(20),
      }),
    )
    .min(5)
    .max(15),
});

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function textForItem(item: Catalog): string {
  return [item.name, item.brand, item.category, item.aisle, item.serving_label, ...(item.tags ?? []), ...(item.diet_tags ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function hasAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function pickBest(
  catalog: Catalog[],
  used: Set<string>,
  predicate: (item: Catalog, text: string) => boolean,
  score: (item: Catalog, text: string) => number,
  allowRepeat = false,
) {
  return catalog
    .filter((item) => (allowRepeat || !used.has(item.id)) && predicate(item, textForItem(item)))
    .sort((a, b) => score(b, textForItem(b)) - score(a, textForItem(a)))[0];
}

function buildReliablePlan(catalog: Catalog[], goals: any): GeneratedPlanItem[] {
  const targetCalories = Number(goals?.calorie_target ?? 2000);
  const targetProtein = Number(goals?.protein_target ?? 150);
  const budgetCents = Number(goals?.daily_budget_cents ?? 2000);
  const used = new Set<string>();
  const plan: GeneratedPlanItem[] = [];

  const add = (item: Catalog | undefined, meal_slot: MealSlot, servings = 1) => {
    if (!item) return;
    const safeServings = Math.max(0.25, Math.min(5, Math.round(servings * 4) / 4));
    plan.push({ catalog_item_id: item.id, meal_slot, servings: safeServings, position: plan.filter((p) => p.meal_slot === meal_slot).length });
    used.add(item.id);
  };

  const scoreLeanProtein = (item: Catalog, text: string) =>
    Number(item.protein_g) * 8 - Math.max(0, Number(item.calories) - 350) * 0.15 - Number(item.price_cents) / Math.max(1, budgetCents) + (hasAny(text, ["chicken", "turkey", "tuna", "salmon", "egg", "tofu", "shrimp", "beef"]) ? 25 : 0);
  const scoreBreakfast = (item: Catalog, text: string) =>
    Number(item.protein_g) * 5 + (hasAny(text, ["yogurt", "oikos", "skyr", "cottage", "egg", "oatmeal", "oats", "granola"]) ? 60 : 0) - Math.max(0, Number(item.calories) - 450) * 0.1;
  const scoreSnack = (item: Catalog, text: string) =>
    Number(item.protein_g) * 5 + (hasAny(text, ["bar", "jerky", "string cheese", "nuts", "hummus", "snack", "quest", "built", "rxbar"]) ? 55 : 0) - Math.max(0, Number(item.calories) - 350) * 0.15;
  const scoreCarbProduce = (item: Catalog, text: string) =>
    (hasAny(text, ["rice", "quinoa", "oatmeal", "oats", "tortilla", "potato", "banana", "apple", "berries", "vegetable", "salad", "fruit"]) ? 65 : 0) + Number(item.calories) * 0.15;

  const isProtein = (item: Catalog, text: string) => item.category === "protein" || item.category === "meal" || Number(item.protein_g) >= 15 || hasAny(text, ["protein", "chicken", "turkey", "tuna", "salmon", "egg", "tofu", "yogurt", "cottage", "skyr", "jerky"]);
  const isBreakfast = (item: Catalog, text: string) => hasAny(text, ["yogurt", "oikos", "skyr", "cottage", "egg", "oatmeal", "oats", "granola", "berries", "banana"]);
  const isSnack = (item: Catalog, text: string) => item.category === "snack" || hasAny(text, ["bar", "jerky", "string cheese", "nuts", "hummus", "snack", "quest", "built", "rxbar", "pure protein"]);
  const isCarbProduce = (item: Catalog, text: string) => item.category === "carb" || item.category === "produce" || hasAny(text, ["rice", "quinoa", "oatmeal", "oats", "tortilla", "potato", "banana", "apple", "berries", "vegetable", "salad", "fruit"]);

  add(pickBest(catalog, used, (i, t) => isBreakfast(i, t), scoreBreakfast), "breakfast");
  add(pickBest(catalog, used, (i, t) => isCarbProduce(i, t), scoreCarbProduce), "breakfast");
  add(pickBest(catalog, used, (i, t) => isProtein(i, t), scoreLeanProtein), "lunch");
  add(pickBest(catalog, used, (i, t) => isCarbProduce(i, t), scoreCarbProduce), "lunch");
  add(pickBest(catalog, used, (i, t) => isProtein(i, t), scoreLeanProtein), "dinner");
  add(pickBest(catalog, used, (i, t) => isCarbProduce(i, t), scoreCarbProduce), "dinner");
  add(pickBest(catalog, used, (i, t) => isSnack(i, t), scoreSnack), "snack");

  while (plan.length < 5) {
    const next = pickBest(catalog, used, () => true, (item) => Number(item.protein_g) * 4 + Number(item.calories) * 0.05);
    if (!next) break;
    add(next, plan.length % 2 === 0 ? "snack" : "lunch");
  }

  const byId = new Map(catalog.map((item) => [item.id, item]));
  const totals = () =>
    plan.reduce(
      (acc, item) => {
        const catalogItem = byId.get(item.catalog_item_id);
        if (!catalogItem) return acc;
        acc.calories += Number(catalogItem.calories) * item.servings;
        acc.protein += Number(catalogItem.protein_g) * item.servings;
        return acc;
      },
      { calories: 0, protein: 0 },
    );

  for (let guard = 0; guard < 16; guard += 1) {
    const total = totals();
    if (total.protein >= targetProtein && total.calories >= targetCalories * 0.93) break;

    const proteinNeeded = total.protein < targetProtein;
    const candidate = proteinNeeded
      ? pickBest(catalog, used, (i, t) => isProtein(i, t) || isSnack(i, t), (i, t) => Number(i.protein_g) * 10 - Number(i.calories) * 0.08 + (isSnack(i, t) ? 20 : 0))
      : pickBest(catalog, used, (i, t) => isCarbProduce(i, t) || isSnack(i, t), (i, t) => Number(i.calories) * 0.4 + Number(i.protein_g) * 2);

    if (candidate && plan.length < 15) {
      add(candidate, proteinNeeded ? "snack" : "dinner", 1);
      continue;
    }

    const adjustable = plan
      .map((item) => ({ item, catalogItem: byId.get(item.catalog_item_id) }))
      .filter((entry): entry is { item: GeneratedPlanItem; catalogItem: Catalog } => Boolean(entry.catalogItem) && entry.item.servings < 3)
      .sort((a, b) => (proteinNeeded ? Number(b.catalogItem.protein_g) - Number(a.catalogItem.protein_g) : Number(b.catalogItem.calories) - Number(a.catalogItem.calories)))[0];
    if (!adjustable) break;
    adjustable.item.servings = Math.min(3, Math.round((adjustable.item.servings + 0.5) * 4) / 4);
  }

  for (let guard = 0; guard < 10 && totals().calories > targetCalories * 1.12; guard += 1) {
    const reducible = plan
      .map((item) => ({ item, catalogItem: byId.get(item.catalog_item_id) }))
      .filter((entry): entry is { item: GeneratedPlanItem; catalogItem: Catalog } => Boolean(entry.catalogItem) && entry.item.servings > 0.5)
      .sort((a, b) => Number(b.catalogItem.calories) / Math.max(1, Number(b.catalogItem.protein_g)) - Number(a.catalogItem.calories) / Math.max(1, Number(a.catalogItem.protein_g)))[0];
    if (!reducible) break;
    reducible.item.servings = Math.max(0.5, Math.round((reducible.item.servings - 0.25) * 4) / 4);
  }

  return plan.map((item, index) => ({ ...item, position: plan.filter((p, idx) => p.meal_slot === item.meal_slot && idx < index).length }));
}

async function loadCatalogForUser(
  supabase: any,
  userId: string,
): Promise<{ catalog: Catalog[]; storeName: string | null; storeChain: string | null }> {
  const { data: us } = await supabase.from("user_store").select("store_id").eq("user_id", userId).maybeSingle();
  let chain: string | null = null;
  let storeName: string | null = null;
  if (us?.store_id) {
    const { data: store } = await supabase
      .from("stores")
      .select("chain,name")
      .eq("id", us.store_id)
      .maybeSingle();
    chain = store?.chain ?? null;
    storeName = store?.name ?? null;
  }
  let query = supabase.from("catalog_items").select("*").eq("in_stock", true);
  if (chain) query = query.eq("store_chain", chain);
  const { data } = await query;
  return { catalog: (data as Catalog[]) ?? [], storeName, storeChain: chain };
}

export const generatePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { date?: string; regenerate?: boolean; storeId?: string }) => input ?? {})
  .handler(async ({ data, context }: any) => {
    const supabase = context.supabase;
    const userId = context.userId;
    const planDate = data.date ?? todayLocal();

    // If user picked a store for today, persist it first so loadCatalogForUser sees it
    if (data.storeId) {
      await supabase
        .from("user_store")
        .upsert({ user_id: userId, store_id: data.storeId }, { onConflict: "user_id" });
    }

    const [{ data: goals }, { data: prefs }, { data: favs }, { data: signals }] = await Promise.all([
      supabase.from("user_goals").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("preferences").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("favorites").select("catalog_item_id").eq("user_id", userId),
      supabase
        .from("taste_signals")
        .select("catalog_item_id, signal")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    if (!goals) throw new Error("Please complete onboarding first.");
    const { catalog, storeName, storeChain } = await loadCatalogForUser(supabase, userId);
    if (catalog.length === 0) throw new Error("No catalog items available for your store yet.");

    // Hard-filter for allergies
    const allergies = new Set((prefs?.allergies ?? []).map((s: string) => s.toLowerCase()));
    const dislikes = new Set((prefs?.dislikes ?? []).map((s: string) => s.toLowerCase()));
    const dietTags = new Set((prefs?.diet_tags ?? []).map((s: string) => s.toLowerCase()));
    const singleOnly = prefs?.single_serving_only !== false; // default true
    const healthPref: "healthier" | "balanced" | "indulgent" =
      (prefs?.health_preference as any) ?? "balanced";
    let allowed = catalog.filter((c) => {
      const itemAllergens = c.allergens ?? [];
      const itemDiets = c.diet_tags ?? [];
      if (c.category === "drink") return false;
      if (itemAllergens.some((a) => allergies.has((a ?? "").toLowerCase()))) return false;
      if (dislikes.has((c.name ?? "").toLowerCase())) return false;
      if (dietTags.has("vegetarian") && !itemDiets.includes("vegetarian") && !itemDiets.includes("vegan")) return false;
      if (dietTags.has("vegan") && !itemDiets.includes("vegan")) return false;
      if (singleOnly && c.is_single_serving === false) return false;
      return true;
    });
    if (allowed.length < 8) allowed = catalog; // fallback

    const favIds = new Set((favs ?? []).map((f: any) => f.catalog_item_id));
    const likedIds = new Set(
      (signals ?? []).filter((s: any) => s.signal === "liked" || s.signal === "eaten").map((s: any) => s.catalog_item_id),
    );
    const dislikedIds = new Set(
      (signals ?? []).filter((s: any) => s.signal === "disliked").map((s: any) => s.catalog_item_id),
    );

    // Trim catalog to ~80 items, prioritizing favs / liked / variety per category
    const ranked = allowed
      .map((c) => ({
        c,
        score:
          (favIds.has(c.id) ? 5 : 0) +
          (likedIds.has(c.id) ? 2 : 0) +
          (dislikedIds.has(c.id) ? -10 : 0) +
          Math.random() * 0.5,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 80)
      .map((x) => x.c);

    const catalogForPrompt = ranked.map((c) => ({
      id: c.id,
      name: c.name,
      brand: c.brand,
      category: c.category,
      kcal: c.calories,
      p: c.protein_g,
      c: c.carbs_g,
      f: c.fat_g,
      cents: c.price_cents,
      serving: c.serving_label,
      fav: favIds.has(c.id),
    }));

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI gateway is not configured.");
    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

    const systemPrompt = `You are MealMate, a packaged-food meal planner. Build ONE day of meals using ONLY items from the provided catalog by id.

RULES:
- Hit calorie target within ±7% and meet or exceed protein target.
- Stay at or under the daily budget when possible.
- Always include: 1 breakfast, 1 lunch, 1 dinner, and 1-2 snacks. Do NOT include drinks — the plan covers food only.
- Use the "category" field to slot items appropriately. Skip items in the "drink" category entirely.
- Prefer items marked fav=true and avoid repeating the same item twice.
- ${singleOnly
      ? "GRAB-AND-GO MODE: Every item must be a ready-to-eat single package the user can buy at the store, open, and eat in full as one serving — no cooking, no portioning, no measuring. The calorie/protein numbers shown are for eating the WHOLE package. Servings MUST always be exactly 1. Never split, multiply, or assume the user will only eat part of it. To hit macros, ADD another grab-and-go item — never adjust servings. Forbid raw/bulk ingredients (raw chicken breast, ground beef, dry rice, tortilla packs, tubs of yogurt, jars of nut butter, blocks of tofu). Use prepackaged single units: protein shakes, single-serve Greek yogurt cups, string cheese, hard-boiled egg packs, jerky sticks, protein bars, microwave rice cups, microwave egg bites, fruit, single-serve hummus + pretzel cups, ready-to-eat salad bowls, frozen single-serve meals, deli single sandwiches."
      : "Servings are decimal (e.g. 1, 1.5, 2). Adjust servings to hit macros precisely."}
- HEALTH BIAS: ${
      healthPref === "healthier"
        ? "Strongly prefer whole foods, lean proteins, fruit, veg, plain Greek yogurt, oats, eggs, nuts, and minimally-processed items. Avoid candy, chips, sugary drinks, sweetened cereals, and ultra-processed snacks. Cap added sugar across the day."
        : healthPref === "indulgent"
          ? "It's OK to include tastier, more indulgent picks (flavored bars, sweet yogurts, chips, cookies, sweetened drinks) as long as calorie and protein targets are still hit."
          : "Balanced mix: mostly whole-food, lean choices, with room for a tasty bar/snack/treat per day."
    }
- Return positions as 0..N per meal_slot for stable ordering.

COHERENCE RULES (very important — meals must actually sound and taste good together):
- Each meal slot (breakfast/lunch/dinner) should read like a real meal a person would sit down and eat, not a random pile of packaged snacks. Build it around ONE clear protein anchor + a complementary carb/produce side that flavor-wise belongs with it (e.g. chicken + rice + veg; turkey + tortilla + fruit; salmon + quinoa; eggs + oatmeal + berries; Greek yogurt + granola + fruit).
- Foods in the same meal must be flavor-congruent. Do NOT combine clashing items (e.g. tuna + chocolate protein bar, jerky + yogurt, cottage cheese + salsa-flavored chips). Sweet stays with sweet, savory with savory.
- Do NOT fill meals with protein bars / shakes / jerky to hit macros. Bars and shakes are SNACK or DRINK only (max 1 bar per day total). Lunch and dinner must be food-based (a real protein + side), never "bar + bar + shake".
- If the user's taste profile or favorites point to one specific protein bar brand, use ONLY that bar (don't mix Quest + Built + RXBAR in one day). Same rule for shakes — pick one brand the user prefers and stick with it.
- Snacks should feel intentional: one bar OR one yogurt OR one piece of fruit + nuts — not three bars stacked.
- Even when single-serving is on, treat each slot as a composed mini-meal: anchor protein + 1 supporting item that pairs with it, not just two unrelated packages. The pairing must still make sense as something you'd eat together (e.g. egg bites + fruit cup; ready-made chicken bowl + apple; turkey-and-cheese wrap + Greek yogurt). No clashing combos.
- Prefer variety across the day: don't repeat the same protein source at lunch and dinner; don't stack two yogurts; don't pick two bars.

Return ONLY a JSON object with this EXACT shape — no prose, no markdown fences, no extra fields:
{
  "items": [
    { "catalog_item_id": "<id from catalog>", "meal_slot": "breakfast|lunch|dinner|snack", "servings": 1.5, "position": 0 }
  ]
}
Do NOT nest items under "meals". Do NOT include name/calories/protein. Do NOT invent ids — only use ids from catalog.`;

    const userPrompt = `Goal: ${goals.goal_type}
Calorie target: ${goals.calorie_target} cal
Protein target: ${goals.protein_target} g
Daily budget: $${(goals.daily_budget_cents / 100).toFixed(2)}
Allergies (hard): ${(prefs?.allergies ?? []).join(", ") || "none"}
Diet tags: ${(prefs?.diet_tags ?? []).join(", ") || "none"}
${Array.isArray(prefs?.taste_profile) && prefs.taste_profile.length
  ? `Taste profile (use these to bias picks toward what the user actually likes):\n${prefs.taste_profile.map((t: any) => `- ${t.question} → ${t.answer}`).join("\n")}\n`
  : ""}

Catalog (id, name, brand, category, cal/serving, protein g, carbs g, fat g, cents, serving, fav):
${catalogForPrompt
  .map(
    (c) =>
      `${c.id} | ${c.name}${c.brand ? " (" + c.brand + ")" : ""} | ${c.category} | ${c.kcal}cal P${c.p} C${c.c} F${c.f} | ${c.cents}¢ | ${c.serving}${c.fav ? " | FAV" : ""}`,
  )
  .join("\n")}`;

    let parsed: { items: GeneratedPlanItem[] };
    try {
      const result: any = await (generateText as any)({
        model,
        system: systemPrompt,
        prompt: userPrompt,
        experimental_output: Output.object({ schema: PlanSchema }),
      });
      const extractJson = (raw: string): any => {
        // Strip any markdown fence variants (```json, ``` , ` ` `json with stray spaces)
        const cleaned = raw.replace(/`+\s*json/gi, "").replace(/`+/g, "").trim();
        const match = cleaned.match(/\{[\s\S]*\}/);
        try { return JSON.parse(match ? match[0] : cleaned); } catch { return null; }
      };
      let candidate: any =
        result?.experimental_output ??
        result?.output ??
        extractJson(result?.text ?? "");
      // Normalize: support nested {meals:[{meal_slot, items:[{id,...}]}]} shape too
      if (candidate && !Array.isArray(candidate.items) && Array.isArray(candidate.meals)) {
        const flat: any[] = [];
        for (const m of candidate.meals) {
          const slot = m.meal_slot ?? m.slot;
          const its = Array.isArray(m.items) ? m.items : [];
          its.forEach((it: any, idx: number) => {
            flat.push({
              catalog_item_id: it.catalog_item_id ?? it.id,
              meal_slot: slot,
              servings: Number(it.servings ?? 1),
              position: Number(it.position ?? idx),
            });
          });
        }
        candidate = { items: flat };
      }
      if (!candidate || !Array.isArray(candidate.items) || candidate.items.length === 0) {
        throw new Error("Model did not return any meal items.");
      }
      // Coerce id field if model used "id"
      candidate.items = candidate.items
        .map((it: any) => ({
          catalog_item_id: it.catalog_item_id ?? it.id,
          meal_slot: it.meal_slot ?? it.slot,
          servings: Number(it.servings ?? 1),
          position: Number(it.position ?? 0),
        }))
        .filter((it: any) => it.catalog_item_id && it.meal_slot);
      const validSlots = new Set(["breakfast", "lunch", "dinner", "snack"]);
      parsed = {
        items: candidate.items.filter((it: any) => validSlots.has(it.meal_slot)),
      };
    } catch (e: any) {
      console.warn("AI plan generation returned unusable output; using catalog planner fallback", e?.message ?? e);
      parsed = { items: buildReliablePlan(ranked.length >= 5 ? ranked : allowed, goals) };
    }

    // Validate ids exist in catalog
    const byId = new Map(catalog.map((c) => [c.id, c]));
    let items = parsed.items.filter((i) => byId.has(i.catalog_item_id));
    if (items.length < 5) items = buildReliablePlan(ranked.length >= 5 ? ranked : allowed, goals).filter((i) => byId.has(i.catalog_item_id));
    if (items.length === 0) throw new Error("No valid store items available for a meal plan.");

    // Hard server-side coherence pass: protein shakes/bars/jerky never count as lunch or dinner.
    // Relocate them to snack (bars/jerky) or drink (shakes). Then, if lunch/dinner ended up empty,
    // promote the best real-food protein anchor from the catalog into that slot.
    {
      const isShakeText = (t: string) => /shake|fairlife|premier|owyn|core power|orgain|muscle milk|protein drink/i.test(t);
      const isBarText = (t: string) => /\bbar\b|quest|built|rxbar|barebells|pure protein|think!|kind|clif|one bar/i.test(t);
      const isJerkyText = (t: string) => /jerky|chomps|epic bar|meat stick|biltong/i.test(t);
      const isRealFoodProtein = (c: Catalog, t: string) =>
        c.category === "protein" &&
        !isShakeText(t) && !isBarText(t) && !isJerkyText(t);

      const relocated: typeof items = [];
      for (const it of items) {
        const c = byId.get(it.catalog_item_id)!;
        const t = `${c.name} ${c.brand ?? ""}`;
        let slot = it.meal_slot;
        if (slot === "lunch" || slot === "dinner") {
          if (isShakeText(t) || isBarText(t) || isJerkyText(t)) slot = "snack";
        }
        relocated.push({ ...it, meal_slot: slot });
      }

      // Cap bars at 1 per day
      let barCount = 0;
      const capped = relocated.filter((it) => {
        const c = byId.get(it.catalog_item_id)!;
        const t = `${c.name} ${c.brand ?? ""}`;
        if (isBarText(t)) { barCount++; return barCount <= 1; }
        return true;
      });

      // Ensure lunch + dinner each have a real-food protein anchor
      const slotsWithRealProtein = new Set(
        capped
          .filter((it) => {
            const c = byId.get(it.catalog_item_id)!;
            return isRealFoodProtein(c, `${c.name} ${c.brand ?? ""}`);
          })
          .map((it) => it.meal_slot),
      );
      const usedIds = new Set(capped.map((i) => i.catalog_item_id));
      const anchorPool = singleOnly ? allowed : catalog;
      for (const slot of ["lunch", "dinner"] as const) {
        if (slotsWithRealProtein.has(slot)) continue;
        const anchor = anchorPool.find(
          (c) =>
            !usedIds.has(c.id) &&
            (!singleOnly || c.is_single_serving !== false) &&
            isRealFoodProtein(c, `${c.name} ${c.brand ?? ""}`),
        );
        if (anchor) {
          capped.push({ catalog_item_id: anchor.id, meal_slot: slot, servings: 1, position: 0 });
          usedIds.add(anchor.id);
        }
      }

      // Re-number positions per slot
      const bySlot = new Map<string, number>();
      items = capped.map((it) => {
        const n = bySlot.get(it.meal_slot) ?? 0;
        bySlot.set(it.meal_slot, n + 1);
        return { ...it, position: n };
      });
    }

    // Enforce single-serving when the user requires it: clamp every item to exactly 1 serving.
    if (singleOnly) {
      items = items.map((i) => ({ ...i, servings: 1 }));
    }

    let totalCal = 0;
    let totalProtein = 0;
    let totalCost = 0;
    for (const it of items) {
      const c = byId.get(it.catalog_item_id)!;
      totalCal += c.calories * it.servings;
      totalProtein += Number(c.protein_g) * it.servings;
      totalCost += c.price_cents * it.servings;
    }

    // Upsert plan
    const { data: existing } = await supabase
      .from("meal_plans")
      .select("id")
      .eq("user_id", userId)
      .eq("plan_date", planDate)
      .maybeSingle();

    let planId: string;
    if (existing?.id) {
      planId = existing.id;
      await supabase.from("plan_items").delete().eq("plan_id", planId);
      await supabase
        .from("meal_plans")
        .update({
          total_calories: Math.round(totalCal),
          total_protein: Math.round(totalProtein * 10) / 10,
          total_cost_cents: Math.round(totalCost),
          status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", planId);
    } else {
      const { data: created, error } = await supabase
        .from("meal_plans")
        .insert({
          user_id: userId,
          plan_date: planDate,
          total_calories: Math.round(totalCal),
          total_protein: Math.round(totalProtein * 10) / 10,
          total_cost_cents: Math.round(totalCost),
          status: "active",
        })
        .select("id")
        .single();
      if (error) throw error;
      planId = created.id;
    }

    await supabase.from("plan_items").insert(
      items.map((i) => ({
        plan_id: planId,
        user_id: userId,
        meal_slot: i.meal_slot,
        catalog_item_id: i.catalog_item_id,
        servings: i.servings,
        position: i.position,
      })),
    );

    // Rebuild shopping list
    const { data: list } = await supabase
      .from("shopping_lists")
      .upsert({ user_id: userId, plan_id: planId, status: "open" }, { onConflict: "plan_id" })
      .select("id")
      .single();
    if (list?.id) {
      await supabase.from("shopping_list_items").delete().eq("list_id", list.id);
      // Aggregate by catalog_item_id
      const agg = new Map<string, number>();
      for (const it of items) agg.set(it.catalog_item_id, (agg.get(it.catalog_item_id) ?? 0) + it.servings);
      await supabase.from("shopping_list_items").insert(
        Array.from(agg.entries()).map(([cid, qty]) => ({
          list_id: list.id,
          user_id: userId,
          catalog_item_id: cid,
          qty: Math.round(qty * 100) / 100,
        })),
      );
    }

    return { planId, totalCal: Math.round(totalCal), totalProtein: Math.round(totalProtein), totalCost: Math.round(totalCost) };
  });

export const swapItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planItemId: string; replacementId?: string }) => input)
  .handler(async ({ data, context }: any) => {
    const supabase = context.supabase;
    const userId = context.userId;
    const { data: item } = await supabase
      .from("plan_items")
      .select("*, catalog_items(*)")
      .eq("id", data.planItemId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!item) throw new Error("Item not found");

    if (!data.replacementId) {
      // Return suggestions: same meal_slot, similar calories ±30%, in stock
      const orig = item.catalog_items;
      const catalog = await loadCatalogForUser(supabase, userId);
      const alternates = catalog
        .filter((c) => c.id !== orig.id && c.category !== "drink")
        .map((c) => ({
          ...c,
          deltaCal: Math.round(c.calories - orig.calories),
          deltaProtein: Math.round(Number(c.protein_g) - Number(orig.protein_g)),
          deltaPrice: c.price_cents - orig.price_cents,
        }))
        .sort((a, b) => Math.abs(a.deltaCal) - Math.abs(b.deltaCal))
        .slice(0, 8);
      return { alternates };
    }

    // Perform swap
    await supabase.from("plan_items").update({ catalog_item_id: data.replacementId }).eq("id", data.planItemId);
    await supabase.from("taste_signals").insert({
      user_id: userId,
      catalog_item_id: item.catalog_item_id,
      signal: "swapped_out",
    });
    // Recompute plan totals
    await recomputePlanTotals(supabase, item.plan_id);
    return { ok: true };
  });

async function recomputePlanTotals(supabase: any, planId: string) {
  const { data: items } = await supabase
    .from("plan_items")
    .select("servings, catalog_items(calories, protein_g, price_cents)")
    .eq("plan_id", planId);
  let cal = 0, p = 0, cost = 0;
  for (const it of items ?? []) {
    cal += it.catalog_items.calories * Number(it.servings);
    p += Number(it.catalog_items.protein_g) * Number(it.servings);
    cost += it.catalog_items.price_cents * Number(it.servings);
  }
  await supabase
    .from("meal_plans")
    .update({
      total_calories: Math.round(cal),
      total_protein: Math.round(p * 10) / 10,
      total_cost_cents: Math.round(cost),
      updated_at: new Date().toISOString(),
    })
    .eq("id", planId);
}

export const markOutOfStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { listItemId: string }) => input)
  .handler(async ({ data, context }: any) => {
    const supabase = context.supabase;
    const userId = context.userId;
    const { data: li } = await supabase
      .from("shopping_list_items")
      .select("*, catalog_items(*)")
      .eq("id", data.listItemId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!li) throw new Error("Not found");
    // Mark item as out of stock for this catalog row (catalog is shared but writes go via service_role on Lovable Cloud; users update via signal)
    await supabase.from("taste_signals").insert({
      user_id: userId,
      catalog_item_id: li.catalog_item_id,
      signal: "swapped_out",
    });
    return { ok: true, alternates: await fetchSwapAlternates(supabase, userId, li.catalog_items) };
  });

async function fetchSwapAlternates(supabase: any, userId: string, orig: any) {
  const catalog = await loadCatalogForUser(supabase, userId);
  return catalog
    .filter((c) => c.id !== orig.id && c.category === orig.category)
    .map((c) => ({
      ...c,
      deltaCal: Math.round(c.calories - orig.calories),
      deltaProtein: Math.round(Number(c.protein_g) - Number(orig.protein_g)),
      deltaPrice: c.price_cents - orig.price_cents,
    }))
    .slice(0, 6);
}

export const substituteListItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { listItemId: string; replacementId: string }) => input)
  .handler(async ({ data, context }: any) => {
    const supabase = context.supabase;
    await supabase
      .from("shopping_list_items")
      .update({ substituted_with_id: data.replacementId })
      .eq("id", data.listItemId)
      .eq("user_id", context.userId);
    return { ok: true };
  });

export const toggleListItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { listItemId: string; checked: boolean }) => input)
  .handler(async ({ data, context }: any) => {
    await context.supabase
      .from("shopping_list_items")
      .update({ checked: data.checked })
      .eq("id", data.listItemId)
      .eq("user_id", context.userId);
    return { ok: true };
  });

export const toggleFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { catalogItemId: string; favorite: boolean }) => input)
  .handler(async ({ data, context }: any) => {
    const supabase = context.supabase;
    if (data.favorite) {
      await supabase
        .from("favorites")
        .upsert({ user_id: context.userId, catalog_item_id: data.catalogItemId }, { onConflict: "user_id,catalog_item_id" });
      await supabase
        .from("taste_signals")
        .insert({ user_id: context.userId, catalog_item_id: data.catalogItemId, signal: "favorited" });
    } else {
      await supabase
        .from("favorites")
        .delete()
        .eq("user_id", context.userId)
        .eq("catalog_item_id", data.catalogItemId);
    }
    return { ok: true };
  });

export const toggleConsumed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planItemId: string; consumed: boolean }) => input)
  .handler(async ({ data, context }: any) => {
    await context.supabase
      .from("plan_items")
      .update({ consumed: data.consumed })
      .eq("id", data.planItemId)
      .eq("user_id", context.userId);
    return { ok: true };
  });

export const setSlotConsumed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planId: string; mealSlot: "breakfast" | "lunch" | "dinner" | "snack"; consumed: boolean }) => input)
  .handler(async ({ data, context }: any) => {
    await context.supabase
      .from("plan_items")
      .update({ consumed: data.consumed })
      .eq("plan_id", data.planId)
      .eq("meal_slot", data.mealSlot)
      .eq("user_id", context.userId);
    return { ok: true };
  });

export const submitCheckin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planId: string; caloriesActual: number; proteinActual: number; notes?: string }) => input)
  .handler(async ({ data, context }: any) => {
    const supabase = context.supabase;
    const userId = context.userId;
    const { data: plan } = await supabase
      .from("meal_plans")
      .select("*, user_goals:user_id(*)")
      .eq("id", data.planId)
      .maybeSingle();
    const { data: goals } = await supabase.from("user_goals").select("*").eq("user_id", userId).maybeSingle();
    if (!plan || !goals) throw new Error("Missing plan or goals");

    const calPct = Math.min(100, Math.round((data.caloriesActual / goals.calorie_target) * 100));
    const proPct = Math.min(100, Math.round((data.proteinActual / goals.protein_target) * 100));
    const adherence = Math.round((calPct + proPct) / 2);

    // AI reflection
    let reflection = "";
    try {
      const apiKey = process.env.LOVABLE_API_KEY;
      if (apiKey) {
        const gateway = createLovableAiGatewayProvider(apiKey);
        const result = await generateText({
          model: gateway("google/gemini-3-flash-preview"),
          system:
            "You are MealMate, an encouraging accountability coach. Write ONE short paragraph (2-3 sentences) about the user's day. Be specific with numbers, warm but honest. No lists.",
          prompt: `Target: ${goals.calorie_target} cal / ${goals.protein_target}g protein.
Actual: ${data.caloriesActual} cal / ${data.proteinActual}g protein.
Adherence: ${adherence}%.
User notes: ${data.notes || "(none)"}`,
        });
        reflection = result.text;
      }
    } catch {
      reflection = `You hit ${adherence}% of your goals today. Tomorrow's a new plan.`;
    }

    const { data: row } = await supabase
      .from("check_ins")
      .upsert(
        {
          user_id: userId,
          plan_id: data.planId,
          plan_date: plan.plan_date,
          calories_actual: data.caloriesActual,
          protein_actual: data.proteinActual,
          calories_target: goals.calorie_target,
          protein_target: goals.protein_target,
          adherence_pct: adherence,
          notes: data.notes ?? null,
          reflection,
        },
        { onConflict: "user_id,plan_date" },
      )
      .select("*")
      .single();

    await supabase.from("meal_plans").update({ status: "completed" }).eq("id", data.planId);
    return { checkin: row, reflection };
  });