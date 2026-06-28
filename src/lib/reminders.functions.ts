import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const getReminderSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }: any) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("reminders_enabled, reminder_times, last_briefing_date")
      .eq("id", context.userId)
      .maybeSingle();
    return {
      enabled: data?.reminders_enabled ?? true,
      times: data?.reminder_times ?? { breakfast: "08:00", lunch: "12:30", dinner: "18:30", snack: "15:30", drink: "10:00" },
      briefingShownToday: data?.last_briefing_date === todayLocal(),
    };
  });

export const saveReminderSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { enabled?: boolean; times?: Record<string, string> }) => input)
  .handler(async ({ data, context }: any) => {
    const patch: any = {};
    if (data.enabled !== undefined) patch.reminders_enabled = data.enabled;
    if (data.times) patch.reminder_times = data.times;
    await context.supabase.from("profiles").update(patch).eq("id", context.userId);
    return { ok: true };
  });

export const markBriefingShown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }: any) => {
    await context.supabase
      .from("profiles")
      .update({ last_briefing_date: todayLocal() })
      .eq("id", context.userId);
    return { ok: true };
  });