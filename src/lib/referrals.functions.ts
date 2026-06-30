import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PREMIUM_DAYS_PER_CONVERSION = 7;

/** Stats for the inviting user. */
export const getReferralStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }: any) => {
    const { supabase, userId } = context;
    const [{ data: rows }, { data: profile }] = await Promise.all([
      supabase.rpc("get_my_referrals"),
      supabase.from("profiles").select("is_premium, premium_expires_at").eq("id", userId).maybeSingle(),
    ]);
    const all = rows ?? [];
    const signed = all.filter((r: any) => r.status === "signed_up" || r.status === "converted").length;
    const converted = all.filter((r: any) => r.status === "converted").length;
    return {
      user_id: userId,
      total: all.length,
      signed_up: signed,
      converted,
      premium_until: profile?.premium_expires_at ?? null,
      is_premium:
        !!profile?.is_premium &&
        (!profile?.premium_expires_at || new Date(profile.premium_expires_at).getTime() > Date.now()),
      reward_days_per_invite: PREMIUM_DAYS_PER_CONVERSION,
    };
  });

/** Called once after sign-up if the user landed via ?ref=<referrer_id>. */
export const recordReferralSignup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { referrerId: string }) => input)
  .handler(async ({ data, context }: any) => {
    const { userId } = context;
    const referrerId = (data.referrerId ?? "").trim();
    if (!referrerId || referrerId === userId) return { ok: false, reason: "invalid" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Make sure the referrer exists
    const { data: ref } = await supabaseAdmin.from("profiles").select("id").eq("id", referrerId).maybeSingle();
    if (!ref) return { ok: false, reason: "unknown_referrer" };
    // Skip if this user already has a referral row
    const { data: existing } = await supabaseAdmin
      .from("referrals").select("id").eq("referred_user_id", userId).maybeSingle();
    if (existing) return { ok: true, alreadyRecorded: true };
    const { error } = await supabaseAdmin.from("referrals").insert({
      referrer_id: referrerId,
      referred_user_id: userId,
      status: "signed_up",
    });
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  });

/** Called after the referred user builds their first plan. Idempotent. */
export const markReferralConverted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }: any) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("referrals")
      .select("id, referrer_id, status")
      .eq("referred_user_id", userId)
      .maybeSingle();
    if (!row || row.status === "converted") return { ok: true, converted: false };
    await supabaseAdmin
      .from("referrals")
      .update({ status: "converted", converted_at: new Date().toISOString() })
      .eq("id", row.id);
    // Extend referrer's premium by 7 days
    const { data: p } = await supabaseAdmin
      .from("profiles").select("premium_expires_at").eq("id", row.referrer_id).maybeSingle();
    const base =
      p?.premium_expires_at && new Date(p.premium_expires_at).getTime() > Date.now()
        ? new Date(p.premium_expires_at).getTime()
        : Date.now();
    const newExpiry = new Date(base + PREMIUM_DAYS_PER_CONVERSION * 86400000).toISOString();
    await supabaseAdmin
      .from("profiles")
      .update({ is_premium: true, premium_expires_at: newExpiry })
      .eq("id", row.referrer_id);
    return { ok: true, converted: true };
  });