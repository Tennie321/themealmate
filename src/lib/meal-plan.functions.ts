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

type MealSlot = "breakfast" | "lunch" | "dinner" | "snack" | "drink";

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
        meal_slot: z.enum(["breakfast", "lunch", "dinner", "snack", "drink"]),
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
    if (meal_slot !== "drink") used.add(item.id);
  };

  const scoreLeanProtein = (item: Catalog, text: string) =>
    Number(item.protein_g) * 8 - Math.max(0, Number(item.calories) - 350) * 0.15 - Number(item.price_cents) / Math.max(1, budgetCents) + (hasAny(text, ["chicken", "turkey", "tuna", "salmon", "egg", "tofu", "shrimp", "beef"]) ? 25 : 0);
  const scoreBreakfast = (item: Catalog, text: string) =>
    Number(item.protein_g) * 5 + (hasAny(text, ["yogurt", "oikos", "skyr", "cottage", "egg", "oatmeal", "oats", "granola"]) ? 60 : 0) - Math.max(0, Number(item.calories) - 450) * 0.1;
  const scoreSnack = (item: Catalog, text: string) =>
    Number(item.protein_g) * 5 + (hasAny(text, ["bar", "jerky", "string cheese", "nuts", "hummus", "snack", "quest", "built", "rxbar"]) ? 55 : 0) - Math.max(0, Number(item.calories) - 350) * 0.15;
  const scoreCarbProduce = (item: Catalog, text: string) =>
    (hasAny(text, ["rice", "quinoa", "oatmeal", "oats", "tortilla", "potato", "banana", "apple", "berries", "vegetable", "salad", "fruit"]) ? 65 : 0) + Number(item.calories) * 0.15;

  const isDrink = (item: Catalog, text: string) => item.category === "drink" || hasAny(text, ["water", "coffee", "tea", "shake", "fairlife", "premier", "owyn", "celsius", "beverage"]);
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
  add(pickBest(catalog, used, (i, t) => isDrink(i, t) && (t.includes("water") || Number(i.calories) <= 20), (i) => 100 - Number(i.calories), true), "drink");
  add(pickBest(catalog, used, (i, t) => isDrink(i, t) && Number(i.protein_g) >= 10, (i) => Number(i.protein_g) * 10 - Number(i.calories) * 0.1, true), "drink");

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

async function loadCatalogForUser(supabase: any, userId: string): Promise<Catalog[]> {
  const { data: us } = await supabase.from("user_store").select("store_id").eq("user_id", userId).maybeSingle();
  let chain: string | null = null;
  if (us?.store_id) {
    const { data: store } = await supabase.from("stores").select("chain").eq("id", us.store_id).maybeSingle();
    chain = store?.chain ?? null;
  }
  let query = supabase.from("catalog_items").select("*").eq("in_stock", true);
  if (chain) query = query.eq("store_chain", chain);
  const { data } = await query;
  return (data as Catalog[]) ?? [];
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
    const catalog = await loadCatalogForUser(supabase, userId);
    if (catalog.length === 0) throw new Error("No catalog items available for your store yet.");

    // Hard-filter for allergies
    const allergies = new Set((prefs?.allergies ?? []).map((s: string) => s.toLowerCase()));
    const dislikes = new Set((prefs?.dislikes ?? []).map((s: string) => s.toLowerCase()));
    const dietTags = new Set((prefs?.diet_tags ?? []).map((s: string) => s.toLowerCase()));
    const singleOnly = prefs?.single_serving_only !== false; // default true
    let allowed = catalog.filter((c) => {
      const itemAllergens = c.allergens ?? [];
      const itemDiets = c.diet_tags ?? [];
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
- Always include: 1 breakfast, 1 lunch, 1 dinner, 1-2 snacks, and 2-3 drinks (water should appear once; add coffee/tea/protein shake as fits).
- Use the "category" field to slot items appropriately. Drinks go in meal_slot "drink".
- Prefer items marked fav=true and avoid repeating the same item twice unless it's a drink.
- ${singleOnly ? "Servings MUST always be exactly 1. Every item is one prepackaged single serving — never split or multiply. To hit macros, add more items, do not change servings." : "Servings are decimal (e.g. 1, 1.5, 2). Adjust servings to hit macros precisely."}
- Return positions as 0..N per meal_slot for stable ordering.

Return ONLY a JSON object with this EXACT shape — no prose, no markdown fences, no extra fields:
{
  "items": [
    { "catalog_item_id": "<id from catalog>", "meal_slot": "breakfast|lunch|dinner|snack|drink", "servings": 1.5, "position": 0 }
  ]
}
Do NOT nest items under "meals". Do NOT include name/calories/protein. Do NOT invent ids — only use ids from catalog.`;

    const userPrompt = `Goal: ${goals.goal_type}
Calorie target: ${goals.calorie_target} cal
Protein target: ${goals.protein_target} g
Daily budget: $${(goals.daily_budget_cents / 100).toFixed(2)}
Allergies (hard): ${(prefs?.allergies ?? []).join(", ") || "none"}
Diet tags: ${(prefs?.diet_tags ?? []).join(", ") || "none"}

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
      const validSlots = new Set(["breakfast", "lunch", "dinner", "snack", "drink"]);
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
        .filter(
          (c) =>
            c.id !== orig.id &&
            ((item.meal_slot === "drink" && c.category === "drink") ||
              (item.meal_slot !== "drink" && c.category !== "drink")),
        )
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