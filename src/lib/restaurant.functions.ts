import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { generateText } from "ai";

function isPremium(p: any): boolean {
  if (!p || p.plan_tier !== "premium") return false;
  if (!p.plan_expires_at) return true;
  return new Date(p.plan_expires_at).getTime() > Date.now();
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function loadRemaining(supabase: any, userId: string) {
  const today = todayStr();
  const [{ data: goals }, { data: plan }, { data: ci }, { data: customs }] = await Promise.all([
    supabase.from("user_goals").select("calorie_target, protein_target").eq("user_id", userId).maybeSingle(),
    supabase
      .from("meal_plans")
      .select("id, plan_items(calories, protein_g, consumed)")
      .eq("user_id", userId)
      .eq("plan_date", today)
      .maybeSingle(),
    supabase
      .from("check_ins")
      .select("calories_actual, protein_actual")
      .eq("user_id", userId)
      .eq("plan_date", today)
      .maybeSingle(),
    supabase
      .from("custom_meals")
      .select("calories, protein_g")
      .eq("user_id", userId)
      .eq("logged_on", today),
  ]);

  const calTarget = goals?.calorie_target ?? 2000;
  const proTarget = goals?.protein_target ?? 150;
  let calEaten = 0;
  let proEaten = 0;
  for (const it of plan?.plan_items ?? []) {
    if (it.consumed) {
      calEaten += Number(it.calories ?? 0);
      proEaten += Number(it.protein_g ?? 0);
    }
  }
  if (ci) {
    calEaten = Math.max(calEaten, Number(ci.calories_actual ?? 0));
    proEaten = Math.max(proEaten, Number(ci.protein_actual ?? 0));
  }
  for (const c of customs ?? []) {
    calEaten += Number(c.calories ?? 0);
    proEaten += Number(c.protein_g ?? 0);
  }
  return {
    today,
    calTarget,
    proTarget,
    calEaten: Math.round(calEaten),
    proEaten: Math.round(proEaten),
    calRemaining: Math.max(0, calTarget - Math.round(calEaten)),
    proRemaining: Math.max(0, proTarget - Math.round(proEaten)),
  };
}

export const getRestaurantState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }: any) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan_tier, plan_expires_at")
      .eq("id", userId)
      .maybeSingle();
    const premium = isPremium(profile);
    const remaining = await loadRemaining(supabase, userId);
    const { data: logged } = await supabase
      .from("custom_meals")
      .select("id, name, calories, protein_g, source, created_at")
      .eq("user_id", userId)
      .eq("logged_on", remaining.today)
      .order("created_at", { ascending: false });
    return { premium, remaining, logged: logged ?? [] };
  });

export const analyzeRestaurantMenu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurant?: string; menu: string }) => input)
  .handler(async ({ data, context }: any) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan_tier, plan_expires_at")
      .eq("id", userId)
      .maybeSingle();
    if (!isPremium(profile)) {
      const err: any = new Error("Restaurant mode is a Premium feature.");
      err.code = "UPGRADE_REQUIRED";
      throw err;
    }
    const menu = (data.menu ?? "").toString().trim().slice(0, 8000);
    if (!menu) throw new Error("Paste the menu first.");
    const restaurant = (data.restaurant ?? "").toString().trim().slice(0, 120);

    const remaining = await loadRemaining(supabase, userId);
    const { data: prefs } = await supabase
      .from("preferences")
      .select("allergies, health_preference, taste_profile")
      .eq("user_id", userId)
      .maybeSingle();

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const system = [
      "You are MealMate's Restaurant Mode. Help the user pick menu items that fit their REMAINING calorie and protein targets for today.",
      "Estimate cal/protein conservatively using typical chain-restaurant values. Never invent items; only recommend things that appear in the menu text provided.",
      "Respond ONLY in this JSON shape, no prose, no markdown:",
      `{"best_pick":{"name":"","calories":0,"protein_g":0,"why":""},"alternates":[{"name":"","calories":0,"protein_g":0,"why":""}],"adjustment":"how to adjust dinner / rest of day if they eat the best pick","notes":""}`,
      "Keep alternates to 2-3 items. 'why' is one short sentence. 'adjustment' is one short paragraph.",
    ].join("\n");

    const prompt = [
      `Restaurant: ${restaurant || "(unspecified)"}`,
      `Remaining today: ${remaining.calRemaining} cal, ${remaining.proRemaining}g protein (target ${remaining.calTarget}/${remaining.proTarget}, already eaten ${remaining.calEaten}/${remaining.proEaten}).`,
      `Health preference: ${prefs?.health_preference ?? "balanced"}.`,
      `Allergies/dislikes: ${(prefs?.allergies ?? []).join(", ") || "none"}.`,
      `Taste profile: ${prefs?.taste_profile ? JSON.stringify(prefs.taste_profile).slice(0, 800) : "(none)"}`,
      "",
      "MENU (verbatim, use only items found here):",
      menu,
    ].join("\n");

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");
    const result = await generateText({ model, system, messages: [{ role: "user", content: prompt }] });
    const text = (result.text ?? "").trim();
    // Extract JSON
    let parsed: any = null;
    try {
      const m = text.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : JSON.parse(text);
    } catch {
      parsed = { best_pick: null, alternates: [], adjustment: text, notes: "" };
    }
    return { remaining, restaurant, analysis: parsed };
  });

export const logCustomMeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; calories: number; protein_g: number; source?: string }) => input)
  .handler(async ({ data, context }: any) => {
    const { supabase, userId } = context;
    const name = (data.name ?? "").toString().trim().slice(0, 200);
    if (!name) throw new Error("Name required");
    const calories = Math.max(0, Math.round(Number(data.calories) || 0));
    const protein_g = Math.max(0, Math.round((Number(data.protein_g) || 0) * 10) / 10);
    const source = (data.source ?? "restaurant").toString().slice(0, 120);
    const { error } = await supabase
      .from("custom_meals")
      .insert({ user_id: userId, name, calories, protein_g, source });
    if (error) throw error;
    return { ok: true };
  });

export const deleteCustomMeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }: any) => {
    await context.supabase.from("custom_meals").delete().eq("id", data.id).eq("user_id", context.userId);
    return { ok: true };
  });