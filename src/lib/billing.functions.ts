import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FREE_DAILY_LIMIT = 3;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function resolveTier(p: any): "free" | "pro" | "premium" {
  const t = p?.plan_tier ?? "free";
  if (t === "free") return "free";
  if (!p?.plan_expires_at) return t;
  return new Date(p.plan_expires_at).getTime() > Date.now() ? t : "free";
}

export const getPlanStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }: any) => {
    const { supabase, userId } = context;
    const { data: p } = await supabase
      .from("profiles")
      .select("plan_tier, plan_expires_at, plans_generated_on, plans_generated_count")
      .eq("id", userId)
      .maybeSingle();
    const tier = resolveTier(p);
    const t = today();
    const used = p?.plans_generated_on === t ? p?.plans_generated_count ?? 0 : 0;
    return {
      tier,
      stored_tier: p?.plan_tier ?? "free",
      plan_expires_at: p?.plan_expires_at ?? null,
      generations_used_today: used,
      generations_limit: tier === "free" ? FREE_DAILY_LIMIT : null,
      generations_remaining: tier === "free" ? Math.max(0, FREE_DAILY_LIMIT - used) : null,
      can_generate: tier !== "free" || used < FREE_DAILY_LIMIT,
    };
  });

/**
 * Simulate a subscription upgrade. Wire Stripe later.
 * 7-day trial gives the chosen tier with expiry set 7 days out.
 */
export const simulateUpgrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tier: "free" | "pro" | "premium"; trial?: boolean }) => input)
  .handler(async ({ data, context }: any) => {
    const { supabase, userId } = context;
    const tier = data.tier;
    let expires: string | null = null;
    if (tier !== "free") {
      const days = data.trial ? 7 : 30;
      expires = new Date(Date.now() + days * 86400000).toISOString();
    }
    const { error } = await supabase
      .from("profiles")
      .update({ plan_tier: tier, plan_expires_at: expires })
      .eq("id", userId);
    if (error) throw error;
    return { ok: true, tier, plan_expires_at: expires };
  });