import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { generateText } from "ai";

function isPremium(p: any): boolean {
  if (!p) return false;
  if (p.plan_tier !== "premium") return false;
  if (!p.plan_expires_at) return true;
  return new Date(p.plan_expires_at).getTime() > Date.now();
}

async function loadContext(supabase: any, userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const [{ data: profile }, { data: goals }, { data: prefs }, { data: checkins }, { data: history }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, plan_tier, plan_expires_at")
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("user_goals").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("preferences").select("*").eq("user_id", userId).maybeSingle(),
      supabase
        .from("check_ins")
        .select("plan_date, adherence_pct, calories_actual, calories_target, protein_actual, protein_target")
        .eq("user_id", userId)
        .gte("plan_date", from)
        .order("plan_date", { ascending: false })
        .limit(7),
      supabase
        .from("chat_messages")
        .select("role, body, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(40),
    ]);
  return { profile, goals, prefs, checkins: checkins ?? [], history: history ?? [], today };
}

function buildSystemPrompt(ctx: any): string {
  const g = ctx.goals ?? {};
  const p = ctx.prefs ?? {};
  const name = ctx.profile?.display_name ?? "there";
  const taste = p.taste_profile ? JSON.stringify(p.taste_profile).slice(0, 1500) : "(no taste profile yet)";
  const checkinLines = ctx.checkins
    .map(
      (c: any) =>
        `• ${c.plan_date}: ${c.calories_actual ?? 0}/${c.calories_target ?? 0} cal · ${c.protein_actual ?? 0}/${c.protein_target ?? 0}g protein · ${c.adherence_pct ?? 0}% adherence`,
    )
    .join("\n");
  return [
    "You are MealMate Coach, a warm, sharp nutrition coach for a user using MealMate to hit calorie and protein goals with prepackaged grocery items.",
    "Style: concise, direct, encouraging, never preachy. Use plain English. Short paragraphs. Bullets when useful. Never give medical advice; suggest a professional for medical issues.",
    "Always ground answers in the user's data below. If you notice a pattern (e.g. low protein 3 days in a row), call it out and propose ONE concrete next step.",
    "When suggesting foods, prefer brands and labels that match their store and taste profile.",
    "",
    `User: ${name}`,
    `Goal type: ${g.goal_type ?? "unset"} · Calorie target: ${g.calorie_target ?? "?"} · Protein target: ${g.protein_target ?? "?"}g`,
    `Daily budget: ${g.budget_cents != null ? `$${(g.budget_cents / 100).toFixed(2)}` : "unset"}`,
    `Health preference: ${p.health_preference ?? "balanced"} · Single-serving mode: ${p.single_serving ? "on" : "off"}`,
    `Allergies/dislikes: ${(p.allergies ?? []).join(", ") || "none"}`,
    `Taste profile: ${taste}`,
    "",
    "Recent check-ins (last 7 days, newest first):",
    checkinLines || "(no check-ins yet — encourage them to log a day)",
    "",
    `Today is ${ctx.today}.`,
  ].join("\n");
}

export const getCoachState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }: any) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan_tier, plan_expires_at")
      .eq("id", userId)
      .maybeSingle();
    const premium = isPremium(profile);
    if (!premium) {
      return {
        premium: false,
        messages: [],
      };
    }
    const { data: history } = await supabase
      .from("chat_messages")
      .select("id, role, body, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(100);
    return { premium: true, messages: history ?? [] };
  });

export const sendCoachMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { body: string }) => input)
  .handler(async ({ data, context }: any) => {
    const { supabase, userId } = context;
    const body = (data.body ?? "").toString().trim().slice(0, 2000);
    if (!body) throw new Error("Message is empty");

    const { data: profile } = await supabase
      .from("profiles")
      .select("plan_tier, plan_expires_at")
      .eq("id", userId)
      .maybeSingle();
    if (!isPremium(profile)) {
      const err: any = new Error("The AI coach is a Premium feature. Upgrade to chat.");
      err.code = "UPGRADE_REQUIRED";
      throw err;
    }

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const ctx = await loadContext(supabase, userId);
    const system = buildSystemPrompt(ctx);

    // Persist user message first so RLS-scoped history stays in sync.
    const { error: insErr } = await supabase
      .from("chat_messages")
      .insert({ user_id: userId, role: "user", body });
    if (insErr) throw insErr;

    const messages = [
      ...ctx.history.map((m: any) => ({ role: m.role as "user" | "assistant", content: m.body })),
      { role: "user" as const, content: body },
    ];

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");
    let assistantText = "";
    try {
      const result = await generateText({ model, system, messages });
      assistantText = result.text?.trim() || "Sorry, I couldn't think of anything useful just now.";
    } catch (e: any) {
      assistantText = `I hit a snag reaching the model. ${e?.message ?? "Try again in a moment."}`;
    }

    await supabase
      .from("chat_messages")
      .insert({ user_id: userId, role: "assistant", body: assistantText });

    return { reply: assistantText };
  });