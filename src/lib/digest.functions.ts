import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { generateText } from "ai";

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isMondayLocal(): boolean {
  return new Date().getDay() === 1;
}

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function adherenceGrade(pct: number): string {
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  return "F";
}

export type WeeklyDigest = {
  weekLabel: string;
  grade: string;
  adherencePct: number;
  daysLogged: number;
  proteinHitsThisWeek: number;
  proteinHitsLastWeek: number;
  weightDeltaKg: number | null;
  spendCents: number;
  topItem: { name: string; brand: string | null; image_url: string | null; count: number } | null;
  suggestion: string;
  alreadyShownToday: boolean;
  isMonday: boolean;
};

async function buildDigest(supabase: any, userId: string): Promise<WeeklyDigest> {
  const today = todayLocal();
  const start7 = daysAgoIso(7);
  const start14 = daysAgoIso(14);

  const [
    { data: checksThis },
    { data: checksLast },
    { data: weights },
    { data: plans },
    { data: profile },
    { data: tasteProfile },
  ] = await Promise.all([
    supabase
      .from("check_ins")
      .select("plan_date, adherence_pct, protein_actual, protein_target")
      .eq("user_id", userId)
      .gte("plan_date", start7)
      .lte("plan_date", today),
    supabase
      .from("check_ins")
      .select("plan_date, protein_actual, protein_target")
      .eq("user_id", userId)
      .gte("plan_date", start14)
      .lt("plan_date", start7),
    supabase
      .from("weight_logs")
      .select("logged_on, weight_kg")
      .eq("user_id", userId)
      .gte("logged_on", start7)
      .order("logged_on", { ascending: true }),
    supabase
      .from("meal_plans")
      .select("id, plan_date, total_cost_cents, plan_items(catalog_items(name, brand, image_url))")
      .eq("user_id", userId)
      .gte("plan_date", start7)
      .lte("plan_date", today),
    supabase
      .from("profiles")
      .select("last_digest_date")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("preferences")
      .select("taste_profile")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const thisWeek = (checksThis ?? []) as Array<{ adherence_pct: number | null; protein_actual: number | null; protein_target: number | null }>;
  const lastWeek = (checksLast ?? []) as Array<{ protein_actual: number | null; protein_target: number | null }>;

  const adherenceValues = thisWeek.map((c) => Number(c.adherence_pct ?? 0)).filter((v) => v > 0);
  const adherencePct = adherenceValues.length
    ? Math.round(adherenceValues.reduce((a, b) => a + b, 0) / adherenceValues.length)
    : 0;

  const proteinHit = (c: { protein_actual: number | null; protein_target: number | null }) =>
    Number(c.protein_target ?? 0) > 0 && Number(c.protein_actual ?? 0) >= Number(c.protein_target ?? 0) * 0.95;
  const proteinHitsThisWeek = thisWeek.filter(proteinHit).length;
  const proteinHitsLastWeek = lastWeek.filter(proteinHit).length;

  const wArr = (weights ?? []) as Array<{ weight_kg: number }>;
  const weightDeltaKg = wArr.length >= 2 ? Number((wArr[wArr.length - 1].weight_kg - wArr[0].weight_kg).toFixed(1)) : null;

  const plansArr = (plans ?? []) as Array<{ total_cost_cents: number | null; plan_items: Array<{ catalog_items: { name: string; brand: string | null; image_url: string | null } | null }> }>;
  const spendCents = plansArr.reduce((s, p) => s + Number(p.total_cost_cents ?? 0), 0);

  // Most-eaten across the week's plans (counts each appearance in plan_items)
  const tally = new Map<string, { name: string; brand: string | null; image_url: string | null; count: number }>();
  for (const p of plansArr) {
    for (const it of p.plan_items ?? []) {
      const ci = it.catalog_items;
      if (!ci) continue;
      const key = `${ci.brand ?? ""}::${ci.name}`;
      const prev = tally.get(key);
      if (prev) prev.count += 1;
      else tally.set(key, { name: ci.name, brand: ci.brand, image_url: ci.image_url, count: 1 });
    }
  }
  const topItem = [...tally.values()].sort((a, b) => b.count - a.count)[0] ?? null;

  // AI suggestion (best-effort; fall back to deterministic line)
  let suggestion = "Lock in one new high-protein breakfast this week and rotate it daily.";
  const apiKey = process.env.LOVABLE_API_KEY;
  if (apiKey) {
    try {
      const taste = (tasteProfile?.taste_profile as any) ?? {};
      const gateway = createLovableAiGatewayProvider(apiKey);
      const model = gateway("google/gemini-3-flash-preview");
      const sys = "You are a concise nutrition coach. Reply with ONE short sentence (max 20 words), no emojis, no quotes.";
      const prompt = `Suggest one specific actionable tweak for the week.
Stats: adherence ${adherencePct}%, protein goal hit ${proteinHitsThisWeek}/7 (was ${proteinHitsLastWeek}/7), weight delta ${weightDeltaKg ?? "n/a"} kg, weekly spend $${(spendCents / 100).toFixed(0)}.
Top item: ${topItem ? `${topItem.brand ?? ""} ${topItem.name} x${topItem.count}` : "none"}.
Taste signals: ${JSON.stringify(taste).slice(0, 600)}.`;
      const result = await generateText({ model, system: sys, messages: [{ role: "user", content: prompt }] });
      const txt = result.text?.trim();
      if (txt) suggestion = txt.replace(/^["']|["']$/g, "");
    } catch {
      // keep fallback
    }
  }

  return {
    weekLabel: `${start7} → ${today}`,
    grade: adherenceGrade(adherencePct),
    adherencePct,
    daysLogged: thisWeek.length,
    proteinHitsThisWeek,
    proteinHitsLastWeek,
    weightDeltaKg,
    spendCents,
    topItem,
    suggestion,
    alreadyShownToday: profile?.last_digest_date === today,
    isMonday: isMondayLocal(),
  };
}

export const getWeeklyDigest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }: any) => buildDigest(context.supabase, context.userId));

export const markDigestShown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }: any) => {
    await context.supabase
      .from("profiles")
      .update({ last_digest_date: todayLocal() })
      .eq("id", context.userId);
    return { ok: true };
  });