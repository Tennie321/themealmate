import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const getOnboardingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }: any) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("onboarded")
      .eq("id", context.userId)
      .maybeSingle();
    return { onboarded: !!data?.onboarded };
  });

export const saveGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { goal_type: string }) => input)
  .handler(async ({ data, context }: any) => {
    await context.supabase
      .from("user_goals")
      .upsert({ user_id: context.userId, goal_type: data.goal_type }, { onConflict: "user_id" });
    return { ok: true };
  });

export const saveBiometrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      sex: "male" | "female";
      age: number;
      height_cm: number;
      weight_kg: number;
      activity: string;
      tdee: number;
      calorie_target: number;
      protein_target: number;
      meal_targets?: Record<string, { cal: number; protein: number }> | null;
    }) => input,
  )
  .handler(async ({ data, context }: any) => {
    const upsert: any = {
      user_id: context.userId,
      biometrics: {
        sex: data.sex,
        age: data.age,
        height_cm: data.height_cm,
        weight_kg: data.weight_kg,
        activity: data.activity,
      },
      tdee: data.tdee,
      calorie_target: data.calorie_target,
      protein_target: data.protein_target,
    };
    if (data.meal_targets) upsert.meal_targets = data.meal_targets;
    await context.supabase
      .from("user_goals")
      .upsert(upsert, { onConflict: "user_id" });
    return { ok: true };
  });

export const saveStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { store_id: string }) => input)
  .handler(async ({ data, context }: any) => {
    await context.supabase
      .from("user_store")
      .upsert({ user_id: context.userId, store_id: data.store_id }, { onConflict: "user_id" });
    return { ok: true };
  });

export const saveBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { daily_budget_cents: number }) => input)
  .handler(async ({ data, context }: any) => {
    await context.supabase
      .from("user_goals")
      .upsert({ user_id: context.userId, daily_budget_cents: data.daily_budget_cents }, { onConflict: "user_id" });
    return { ok: true };
  });

export const savePreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { allergies: string[]; dislikes: string[]; diet_tags: string[]; favorite_brands?: string[]; single_serving_only?: boolean; health_preference?: "healthier" | "balanced" | "indulgent" }) => input,
  )
  .handler(async ({ data, context }: any) => {
    await context.supabase.from("preferences").upsert(
      {
        user_id: context.userId,
        allergies: data.allergies,
        dislikes: data.dislikes,
        diet_tags: data.diet_tags,
        favorite_brands: data.favorite_brands ?? [],
        ...(typeof data.single_serving_only === "boolean" ? { single_serving_only: data.single_serving_only } : {}),
        ...(data.health_preference ? { health_preference: data.health_preference } : {}),
      },
      { onConflict: "user_id" },
    );
    await context.supabase.from("profiles").update({ onboarded: true }).eq("id", context.userId);
    return { ok: true };
  });

export const setSingleServingOnly = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { value: boolean }) => input)
  .handler(async ({ data, context }: any) => {
    await context.supabase
      .from("preferences")
      .upsert(
        { user_id: context.userId, single_serving_only: data.value },
        { onConflict: "user_id" },
      );
    return { ok: true };
  });

export const setHealthPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { value: "healthier" | "balanced" | "indulgent" }) => input)
  .handler(async ({ data, context }: any) => {
    await context.supabase
      .from("preferences")
      .upsert(
        { user_id: context.userId, health_preference: data.value },
        { onConflict: "user_id" },
      );
    return { ok: true };
  });

export const setPlanMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { value: "surprise" | "comfort" }) => input)
  .handler(async ({ data, context }: any) => {
    await context.supabase
      .from("preferences")
      .upsert(
        { user_id: context.userId, plan_mode: data.value },
        { onConflict: "user_id" },
      );
    return { ok: true };
  });

export const getStores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }: any) => {
    const { data } = await context.supabase.from("stores").select("*").order("name");
    return { stores: data ?? [] };
  });

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }: any) => {
    const userId = context.userId;
    const planDate = todayLocal();
    const [{ data: goals }, { data: profile }, { data: plan }, { data: checkin }, { data: userStore }, { data: stores }, { data: prefs }] = await Promise.all([
      context.supabase.from("user_goals").select("*").eq("user_id", userId).maybeSingle(),
      context.supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      context.supabase
        .from("meal_plans")
        .select("*, plan_items(*, catalog_items(*))")
        .eq("user_id", userId)
        .eq("plan_date", planDate)
        .maybeSingle(),
      context.supabase.from("check_ins").select("*").eq("user_id", userId).eq("plan_date", planDate).maybeSingle(),
      context.supabase.from("user_store").select("store_id, stores(*)").eq("user_id", userId).maybeSingle(),
      context.supabase.from("stores").select("id, name, chain").order("name"),
      context.supabase.from("preferences").select("*").eq("user_id", userId).maybeSingle(),
    ]);
    return { goals, profile, plan, checkin, planDate, currentStore: userStore?.stores ?? null, stores: stores ?? [], preferences: prefs ?? null };
  });

export const getShoppingList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }: any) => {
    const userId = context.userId;
    const planDate = todayLocal();
    const { data: plan } = await context.supabase
      .from("meal_plans")
      .select("id, total_cost_cents")
      .eq("user_id", userId)
      .eq("plan_date", planDate)
      .maybeSingle();
    if (!plan) return { items: [], total_cents: 0 };
    const { data: list } = await context.supabase
      .from("shopping_lists")
      .select("id")
      .eq("plan_id", plan.id)
      .maybeSingle();
    if (!list) return { items: [], total_cents: 0 };
    const { data: items } = await context.supabase
      .from("shopping_list_items")
      .select("*, catalog_items(*), substituted:substituted_with_id(name, brand, price_cents, image_url, aisle)")
      .eq("list_id", list.id);
    return { items: items ?? [], total_cents: plan.total_cost_cents };
  });

export const getFavorites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }: any) => {
    const { data } = await context.supabase
      .from("favorites")
      .select("catalog_items(*)")
      .eq("user_id", context.userId);
    return { items: (data ?? []).map((d: any) => d.catalog_items).filter(Boolean) };
  });

export const getCheckinHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }: any) => {
    const { data } = await context.supabase
      .from("check_ins")
      .select("plan_date, adherence_pct, calories_actual, calories_target, protein_actual, protein_target")
      .eq("user_id", context.userId)
      .order("plan_date", { ascending: false })
      .limit(7);
    return { history: (data ?? []).reverse() };
  });