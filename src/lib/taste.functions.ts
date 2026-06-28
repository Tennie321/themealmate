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