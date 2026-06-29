import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BADGES: { key: string; label: string; description: string; check: (ctx: any) => boolean }[] = [
  { key: "first_log", label: "First Step", description: "Logged your first weight", check: (c) => c.weightCount >= 1 },
  { key: "streak_3", label: "3-Day Streak", description: "3 days of check-ins", check: (c) => c.checkinStreak >= 3 },
  { key: "streak_7", label: "On a Roll", description: "7-day check-in streak", check: (c) => c.checkinStreak >= 7 },
  { key: "streak_30", label: "Locked In", description: "30-day check-in streak", check: (c) => c.checkinStreak >= 30 },
  { key: "five_lbs", label: "5 lbs Down", description: "Lost 5 lbs from start", check: (c) => c.lostLbs >= 5 },
  { key: "ten_lbs", label: "10 lbs Down", description: "Lost 10 lbs from start", check: (c) => c.lostLbs >= 10 },
  { key: "halfway", label: "Halfway There", description: "Halfway to your goal weight", check: (c) => c.goalPct >= 50 },
  { key: "goal_hit", label: "Goal Crusher", description: "Reached your target weight", check: (c) => c.goalPct >= 100 },
  { key: "perfect_week", label: "Perfect Week", description: "7 days at 90%+ adherence", check: (c) => c.perfectWeek },
];

export const ALL_BADGES = BADGES.map((b) => ({ key: b.key, label: b.label, description: b.description }));

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function consecutiveStreakWithFreeze(
  dates: string[],
  freezeAvailable: number,
  freezeUsedOn: string | null,
): { streak: number; usedNewFreeze: boolean; freezeUsedOn: string | null } {
  if (dates.length === 0) return { streak: 0, usedNewFreeze: false, freezeUsedOn };
  const set = new Set(dates);
  const today = new Date();
  let streak = 0;
  let available = freezeAvailable;
  let usedNewFreeze = false;
  let newUsedOn = freezeUsedOn;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = dateKey(d);
    if (set.has(key)) {
      streak++;
      continue;
    }
    if (i === 0) continue; // grace for today (no check-in yet)
    if (freezeUsedOn && key === freezeUsedOn) {
      streak++;
      continue;
    }
    if (available > 0) {
      available--;
      usedNewFreeze = true;
      newUsedOn = key;
      streak++;
      continue;
    }
    break;
  }
  return { streak, usedNewFreeze, freezeUsedOn: newUsedOn };
}

export const logWeight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { weight_kg: number; logged_on?: string; note?: string }) => input)
  .handler(async ({ data, context }: any) => {
    const date = data.logged_on ?? new Date().toISOString().slice(0, 10);
    const { error } = await context.supabase
      .from("weight_logs")
      .upsert(
        { user_id: context.userId, weight_kg: data.weight_kg, logged_on: date, note: data.note ?? null },
        { onConflict: "user_id,logged_on" },
      );
    if (error) throw error;
    // Seed start_weight_kg if not yet set
    const { data: g } = await context.supabase
      .from("user_goals").select("start_weight_kg").eq("user_id", context.userId).maybeSingle();
    if (g && g.start_weight_kg == null) {
      await context.supabase
        .from("user_goals")
        .update({ start_weight_kg: data.weight_kg })
        .eq("user_id", context.userId);
    }
    return { ok: true };
  });

export const setTargetWeight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { target_weight_kg: number | null }) => input)
  .handler(async ({ data, context }: any) => {
    await context.supabase
      .from("user_goals")
      .upsert({ user_id: context.userId, target_weight_kg: data.target_weight_kg }, { onConflict: "user_id" });
    return { ok: true };
  });

export const deleteWeight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }: any) => {
    await context.supabase.from("weight_logs").delete().eq("id", data.id).eq("user_id", context.userId);
    return { ok: true };
  });

export const getProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }: any) => {
    const userId = context.userId;
    const today = new Date();
    const fromIso = new Date(today.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    const [{ data: goals }, { data: weights }, { data: checkins7 }, { data: allCheckinDates }, { data: badges }, { data: profile }] =
      await Promise.all([
        context.supabase.from("user_goals").select("*").eq("user_id", userId).maybeSingle(),
        context.supabase.from("weight_logs").select("*").eq("user_id", userId).order("logged_on", { ascending: true }),
        context.supabase
          .from("check_ins")
          .select("plan_date, adherence_pct, calories_actual, calories_target, protein_actual, protein_target")
          .eq("user_id", userId).gte("plan_date", fromIso).order("plan_date", { ascending: true }),
        context.supabase.from("check_ins").select("plan_date").eq("user_id", userId),
        context.supabase.from("user_badges").select("*").eq("user_id", userId),
        context.supabase
          .from("profiles")
          .select("streak_freeze_count, streak_freeze_reset_date, streak_freeze_used_on, plan_tier, plan_expires_at")
          .eq("id", userId).maybeSingle(),
      ]);

    // Free-tier: cap weight history to last 7 days.
    const isFree =
      !profile?.plan_tier ||
      profile.plan_tier === "free" ||
      (profile.plan_expires_at && new Date(profile.plan_expires_at).getTime() <= Date.now());
    const weightCutoffIso = new Date(today.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    const trimmedWeights = isFree
      ? (weights ?? []).filter((w: any) => String(w.logged_on) >= weightCutoffIso)
      : (weights ?? []);

    // Weekly renewal of streak freeze
    const todayKey = dateKey(today);
    let freezeCount = profile?.streak_freeze_count ?? 1;
    let freezeReset = profile?.streak_freeze_reset_date as string | null;
    let freezeUsedOn = profile?.streak_freeze_used_on as string | null;
    const needsReset =
      !freezeReset ||
      (new Date(todayKey).getTime() - new Date(freezeReset).getTime()) >= 7 * 86400000;
    if (needsReset) {
      freezeCount = 1;
      freezeReset = todayKey;
      freezeUsedOn = null;
      await context.supabase
        .from("profiles")
        .update({
          streak_freeze_count: freezeCount,
          streak_freeze_reset_date: freezeReset,
          streak_freeze_used_on: freezeUsedOn,
        })
        .eq("id", userId);
    }

    const start = goals?.start_weight_kg != null ? Number(goals.start_weight_kg) : (weights?.[0]?.weight_kg ?? null);
    const latest = weights && weights.length > 0 ? Number(weights[weights.length - 1].weight_kg) : null;
    const target = goals?.target_weight_kg != null ? Number(goals.target_weight_kg) : null;

    const KG_TO_LB = 2.20462;
    let toGoLbs: number | null = null;
    let lostLbs = 0;
    let goalPct = 0;
    if (start != null && target != null && latest != null) {
      const totalKg = Math.abs(start - target);
      const doneKg = (start > target ? (start - latest) : (latest - start));
      lostLbs = Math.max(0, (start - latest) * KG_TO_LB);
      goalPct = totalKg > 0 ? Math.min(100, Math.max(0, (doneKg / totalKg) * 100)) : 0;
      toGoLbs = Math.abs(latest - target) * KG_TO_LB;
    }

    const streakRes = consecutiveStreakWithFreeze(
      (allCheckinDates ?? []).map((c: any) => c.plan_date),
      freezeCount,
      freezeUsedOn,
    );
    const checkinStreak = streakRes.streak;
    if (streakRes.usedNewFreeze) {
      freezeCount = Math.max(0, freezeCount - 1);
      freezeUsedOn = streakRes.freezeUsedOn;
      await context.supabase
        .from("profiles")
        .update({
          streak_freeze_count: freezeCount,
          streak_freeze_used_on: freezeUsedOn,
        })
        .eq("id", userId);
    }

    // Weekly report card
    const c7 = checkins7 ?? [];
    const avgAdh = c7.length ? Math.round(c7.reduce((s: number, c: any) => s + (Number(c.adherence_pct) || 0), 0) / c7.length) : 0;
    const avgCal = c7.length ? Math.round(c7.reduce((s: number, c: any) => s + (Number(c.calories_actual) || 0), 0) / c7.length) : 0;
    const avgPro = c7.length ? Math.round(c7.reduce((s: number, c: any) => s + (Number(c.protein_actual) || 0), 0) / c7.length) : 0;
    const perfectDays = c7.filter((c: any) => (Number(c.adherence_pct) || 0) >= 90).length;
    const perfectWeek = c7.length >= 7 && perfectDays >= 7;
    let grade = "—";
    if (c7.length > 0) {
      if (avgAdh >= 95) grade = "A+";
      else if (avgAdh >= 90) grade = "A";
      else if (avgAdh >= 80) grade = "B";
      else if (avgAdh >= 70) grade = "C";
      else if (avgAdh >= 60) grade = "D";
      else grade = "F";
    }

    // Auto-award badges
    const ctx = { weightCount: weights?.length ?? 0, checkinStreak, lostLbs, goalPct, perfectWeek };
    const earnedKeys = new Set((badges ?? []).map((b: any) => b.badge_key));
    const newlyEarned: string[] = [];
    for (const b of BADGES) {
      if (!earnedKeys.has(b.key) && b.check(ctx)) newlyEarned.push(b.key);
    }
    if (newlyEarned.length) {
      await context.supabase
        .from("user_badges")
        .upsert(newlyEarned.map((k) => ({ user_id: userId, badge_key: k })), { onConflict: "user_id,badge_key" });
    }
    const allEarnedKeys = new Set([...earnedKeys, ...newlyEarned]);

    return {
      start_weight_kg: start,
      latest_weight_kg: latest,
      target_weight_kg: target,
      to_go_lbs: toGoLbs,
      lost_lbs: lostLbs,
      goal_pct: Math.round(goalPct),
      checkin_streak: checkinStreak,
      streak_freeze_count: freezeCount,
      streak_freeze_available: freezeCount > 0,
      weights: (weights ?? []).map((w: any) => ({ id: w.id, logged_on: w.logged_on, weight_kg: Number(w.weight_kg) })),
      tier: isFree ? "free" : profile?.plan_tier,
      weights_truncated: isFree && (weights?.length ?? 0) > trimmedWeights.length,
      week: {
        days: c7.length,
        avg_adherence: avgAdh,
        avg_calories: avgCal,
        avg_protein: avgPro,
        perfect_days: perfectDays,
        grade,
        series: c7.map((c: any) => ({
          date: c.plan_date,
          adherence: Number(c.adherence_pct) || 0,
          calories: Number(c.calories_actual) || 0,
        })),
      },
      badges: ALL_BADGES.map((b) => ({ ...b, earned: allEarnedKeys.has(b.key) })),
      newly_earned: newlyEarned,
    };
  });