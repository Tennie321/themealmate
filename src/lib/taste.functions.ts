import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const QuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        id: z.string(),
        question: z.string(),
        options: z.array(z.string()).min(2).max(6),
      }),
    )
    .min(4)
    .max(6),
});

const FALLBACK = [
  { id: "cuisine", question: "Which flavors do you reach for most?", options: ["Mexican / Tex-Mex", "Italian / Mediterranean", "Asian (Thai, Japanese, Korean)", "American comfort", "Indian / Middle Eastern", "I'll eat anything"] },
  { id: "breakfast_style", question: "What's your ideal breakfast?", options: ["Greek yogurt + fruit", "Eggs + toast", "Oatmeal / overnight oats", "Protein shake on the go", "Savory (wrap, sandwich)"] },
  { id: "spice", question: "How spicy do you like food?", options: ["No spice", "Mild", "Medium", "Bring the heat"] },
  { id: "cooking", question: "How much do you want to cook?", options: ["Zero — grab and go only", "Microwave / 5 min max", "10–15 min easy prep", "I enjoy cooking"] },
  { id: "snacks", question: "Snack style?", options: ["Protein bars", "Jerky / meat snacks", "Greek yogurt cups", "Nuts / trail mix", "Cheese + crackers", "Fruit"] },
  { id: "drinks", question: "Favorite daily drinks (besides water)?", options: ["Coffee", "Tea", "Protein shake", "Sparkling water / Celsius", "Just water"] },
];

export const generateTasteQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }: any) => {
    const { data: goals } = await context.supabase
      .from("user_goals")
      .select("goal_type, calorie_target, protein_target")
      .eq("user_id", context.userId)
      .maybeSingle();
    const { data: prefs } = await context.supabase
      .from("preferences")
      .select("allergies, dislikes, diet_tags")
      .eq("user_id", context.userId)
      .maybeSingle();

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { questions: FALLBACK };

    try {
      const gateway = createLovableAiGatewayProvider(apiKey);
      const model = gateway("google/gemini-3-flash-preview");
      const result: any = await (generateText as any)({
        model,
        system: `You are a meal-planning coach. Generate 5 short multiple-choice questions to learn the user's food taste so we can pick prepackaged grocery items they'll actually eat. Questions must be practical (cuisine preference, breakfast style, snack style, cooking effort, drink habits, texture/flavor likes). Each question needs 4-6 short option strings. Return JSON only.`,
        prompt: `Goal: ${goals?.goal_type ?? "maintain"} | ${goals?.calorie_target ?? 2000}cal / ${goals?.protein_target ?? 150}g protein
Allergies: ${(prefs?.allergies ?? []).join(", ") || "none"}
Diet tags: ${(prefs?.diet_tags ?? []).join(", ") || "none"}
Dislikes: ${(prefs?.dislikes ?? []).join(", ") || "none"}`,
        experimental_output: Output.object({ schema: QuestionsSchema }),
      });
      const extract = (raw: string) => {
        const cleaned = raw.replace(/`+\s*json/gi, "").replace(/`+/g, "").trim();
        const m = cleaned.match(/\{[\s\S]*\}/);
        try { return JSON.parse(m ? m[0] : cleaned); } catch { return null; }
      };
      const out = result?.experimental_output ?? result?.output ?? extract(result?.text ?? "");
      if (out?.questions?.length) return { questions: out.questions };
    } catch (e) {
      console.warn("taste question gen failed", e);
    }
    return { questions: FALLBACK };
  });

export const saveTasteProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { answers: { id: string; question: string; answer: string }[] }) => input)
  .handler(async ({ data, context }: any) => {
    await context.supabase
      .from("preferences")
      .upsert(
        { user_id: context.userId, taste_profile: data.answers },
        { onConflict: "user_id" },
      );
    return { ok: true };
  });

export const submitPlanFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { reasons: string[]; note?: string }) => input)
  .handler(async ({ data, context }: any) => {
    const reasons = (data.reasons ?? []).filter((r: string) => typeof r === "string" && r.trim().length);
    const note = (data.note ?? "").trim();
    if (reasons.length === 0 && !note) return { ok: true };

    const { data: prefs } = await context.supabase
      .from("preferences")
      .select("taste_profile")
      .eq("user_id", context.userId)
      .maybeSingle();
    const existing = Array.isArray(prefs?.taste_profile) ? prefs!.taste_profile : [];

    const answerText = [reasons.join("; "), note].filter(Boolean).join(" — ");
    const entry = {
      id: `feedback_${Date.now()}`,
      question: "What was wrong with the previous meal plan? (avoid this next time)",
      answer: answerText,
    };
    // Keep at most the 8 most recent feedback entries plus all non-feedback taste answers
    const nonFeedback = existing.filter((e: any) => !String(e?.id ?? "").startsWith("feedback_"));
    const feedback = existing.filter((e: any) => String(e?.id ?? "").startsWith("feedback_"));
    const trimmedFeedback = [...feedback, entry].slice(-8);

    await context.supabase
      .from("preferences")
      .upsert(
        { user_id: context.userId, taste_profile: [...nonFeedback, ...trimmedFeedback] },
        { onConflict: "user_id" },
      );
    return { ok: true };
  });

const CUISINE_KEYWORDS: Record<string, string[]> = {
  Mexican: ["taco", "burrito", "salsa", "guacamole", "queso", "tortilla", "chipotle", "fajita", "enchilada", "carnitas", "elote"],
  Asian: ["teriyaki", "soy", "ramen", "sushi", "kimchi", "miso", "thai", "korean", "japanese", "sesame", "dumpling", "edamame", "stir fry"],
  Italian: ["pasta", "marinara", "alfredo", "pizza", "parm", "lasagna", "italian", "pesto", "ravioli", "spaghetti"],
  Mediterranean: ["hummus", "tzatziki", "greek", "feta", "olive", "tabouli", "falafel", "pita", "mediterranean"],
  American: ["burger", "bbq", "ranch", "buffalo", "mac and cheese", "hot dog", "cheddar", "country"],
  Indian: ["tikka", "masala", "curry", "naan", "tandoori", "biryani", "paneer", "indian"],
  "Middle Eastern": ["shawarma", "kebab", "tabbouleh", "baba"],
};

function detectCuisine(text: string): string | null {
  const t = text.toLowerCase();
  for (const [name, words] of Object.entries(CUISINE_KEYWORDS)) {
    if (words.some((w) => t.includes(w))) return name;
  }
  return null;
}

export const getTasteInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }: any) => {
    const [{ data: signals }, { data: favs }, { data: recentPlans }] = await Promise.all([
      context.supabase
        .from("taste_signals")
        .select("catalog_item_id, signal, created_at, catalog_items(name, brand, category)")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(300),
      context.supabase
        .from("favorites")
        .select("catalog_item_id, catalog_items(name, brand, category)")
        .eq("user_id", context.userId)
        .limit(100),
      context.supabase
        .from("meal_plans")
        .select("plan_date, plan_items(meal_slot, catalog_items(name, brand, category))")
        .eq("user_id", context.userId)
        .order("plan_date", { ascending: false })
        .limit(14),
    ]);

    const loveCount: Record<string, { item: any; n: number }> = {};
    const avoidCount: Record<string, { item: any; n: number }> = {};
    const cuisine: Record<string, number> = {};
    const slotProtein: Record<string, Record<string, number>> = { breakfast: {}, lunch: {}, dinner: {}, snack: {} };

    for (const f of favs ?? []) {
      const ci = (f as any).catalog_items;
      if (!ci) continue;
      const key = `${ci.brand ?? ""} ${ci.name}`.trim();
      loveCount[key] = { item: ci, n: (loveCount[key]?.n ?? 0) + 3 };
      const cz = detectCuisine(`${ci.name} ${ci.brand ?? ""}`);
      if (cz) cuisine[cz] = (cuisine[cz] ?? 0) + 2;
    }
    for (const s of signals ?? []) {
      const ci = (s as any).catalog_items;
      if (!ci) continue;
      const key = `${ci.brand ?? ""} ${ci.name}`.trim();
      const positive = ["liked", "eaten", "swapped_in", "favorited"].includes((s as any).signal);
      const negative = ["disliked", "swapped_out", "skipped"].includes((s as any).signal);
      if (positive) loveCount[key] = { item: ci, n: (loveCount[key]?.n ?? 0) + 1 };
      if (negative) avoidCount[key] = { item: ci, n: (avoidCount[key]?.n ?? 0) + 1 };
      const cz = detectCuisine(`${ci.name} ${ci.brand ?? ""}`);
      if (cz) cuisine[cz] = (cuisine[cz] ?? 0) + (positive ? 1 : negative ? -1 : 0);
    }
    for (const p of recentPlans ?? []) {
      for (const pi of (p as any).plan_items ?? []) {
        const ci = pi.catalog_items;
        if (!ci) continue;
        if (ci.category === "protein" || /chicken|turkey|tuna|salmon|beef|pork|tofu|egg|shrimp|jerky/i.test(ci.name)) {
          const tag = (ci.name.match(/chicken|turkey|tuna|salmon|beef|pork|tofu|egg|shrimp|jerky/i) ?? ["other"])[0].toLowerCase();
          slotProtein[pi.meal_slot] = slotProtein[pi.meal_slot] ?? {};
          slotProtein[pi.meal_slot][tag] = (slotProtein[pi.meal_slot][tag] ?? 0) + 1;
        }
      }
    }

    const top = (rec: Record<string, { item: any; n: number }>, k: number) =>
      Object.values(rec)
        .sort((a, b) => b.n - a.n)
        .slice(0, k)
        .map((x) => ({ name: x.item.name, brand: x.item.brand, category: x.item.category, n: x.n }));

    const cuisineRanking = Object.entries(cuisine)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([name, score]) => ({ name, score }));

    return {
      loves: top(loveCount, 8),
      avoids: top(avoidCount, 6),
      cuisineRanking,
      slotProtein,
      totalSignals: (signals ?? []).length,
    };
  });