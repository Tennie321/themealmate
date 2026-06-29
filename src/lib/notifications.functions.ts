import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Kind = "streak_at_risk" | "plan_tomorrow" | "comeback_3d";

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function computeStreak(dates: string[]): number {
  if (!dates.length) return 0;
  const set = new Set(dates);
  const today = new Date();
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const k = dateKey(d);
    if (set.has(k)) {
      streak++;
      continue;
    }
    if (i === 0) continue; // grace for today
    break;
  }
  return streak;
}

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }: any) => {
    const { data } = await context.supabase
      .from("notifications")
      .select("*")
      .eq("user_id", context.userId)
      .order("sent_at", { ascending: false })
      .limit(30);
    return { items: data ?? [] };
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }: any) => {
    await context.supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", context.userId)
      .eq("id", data.id);
    return { ok: true };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }: any) => {
    await context.supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", context.userId)
      .eq("read", false);
    return { ok: true };
  });

/**
 * Evaluate smart reminders. Called by the client on app open / focus.
 * The client passes its local hour and date keys so we respect the user's timezone.
 * Returns the notifications that were freshly created this call.
 */
export const evaluateSmartReminders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { localHour: number; todayLocal: string; tomorrowLocal: string }) => input)
  .handler(async ({ data, context }: any) => {
    const userId = context.userId;
    const { localHour, todayLocal, tomorrowLocal } = data;

    // Pull what we need in parallel.
    const [
      { data: allCheckins },
      { data: todayCheckin },
      { data: tomorrowPlan },
      { data: recentNotifs },
      { data: lastPlan },
    ] = await Promise.all([
      context.supabase.from("check_ins").select("plan_date").eq("user_id", userId),
      context.supabase.from("check_ins").select("id").eq("user_id", userId).eq("plan_date", todayLocal).maybeSingle(),
      context.supabase.from("meal_plans").select("id").eq("user_id", userId).eq("plan_date", tomorrowLocal).maybeSingle(),
      context.supabase
        .from("notifications")
        .select("kind, sent_at")
        .eq("user_id", userId)
        .gte("sent_at", new Date(Date.now() - 3 * 86400000).toISOString()),
      context.supabase
        .from("meal_plans")
        .select("plan_date, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const recent = (recentNotifs ?? []) as { kind: string; sent_at: string }[];
    const sentTodayKinds = new Set(
      recent
        .filter((n) => n.sent_at.slice(0, 10) === todayLocal)
        .map((n) => n.kind),
    );
    const lastByKind: Record<string, number> = {};
    for (const n of recent) {
      const t = new Date(n.sent_at).getTime();
      if (!lastByKind[n.kind] || t > lastByKind[n.kind]) lastByKind[n.kind] = t;
    }

    const toInsert: { user_id: string; kind: Kind; title: string; body: string }[] = [];

    // 1) Streak at risk: 5+ day streak, no check-in today, after 9pm local
    const streak = computeStreak((allCheckins ?? []).map((c: any) => c.plan_date));
    if (
      streak >= 5 &&
      !todayCheckin &&
      localHour >= 21 &&
      !sentTodayKinds.has("streak_at_risk")
    ) {
      toInsert.push({
        user_id: userId,
        kind: "streak_at_risk",
        title: `🔥 ${streak}-day streak!`,
        body: "Don't forget to check in before bed.",
      });
    }

    // 2) No plan for tomorrow yet, after 10pm local
    if (
      !tomorrowPlan &&
      localHour >= 22 &&
      !sentTodayKinds.has("plan_tomorrow")
    ) {
      toInsert.push({
        user_id: userId,
        kind: "plan_tomorrow",
        title: "Plan tomorrow in 30 seconds",
        body: "Wake up with a plan ready.",
      });
    }

    // 3) Comeback: no plan created in 3+ days. Throttle to once every 3 days.
    const lastPlanAt = lastPlan?.created_at ? new Date(lastPlan.created_at).getTime() : 0;
    const daysSincePlan = lastPlanAt
      ? Math.floor((Date.now() - lastPlanAt) / 86400000)
      : 999;
    const lastComeback = lastByKind["comeback_3d"] ?? 0;
    const daysSinceComeback = (Date.now() - lastComeback) / 86400000;
    if (daysSincePlan >= 3 && daysSinceComeback >= 3) {
      toInsert.push({
        user_id: userId,
        kind: "comeback_3d",
        title: "Your meal plan is waiting",
        body: "Tap to pick up where you left off.",
      });
    }

    if (toInsert.length === 0) return { created: [] };

    const { data: inserted } = await context.supabase
      .from("notifications")
      .insert(toInsert)
      .select("*");

    return { created: inserted ?? [] };
  });