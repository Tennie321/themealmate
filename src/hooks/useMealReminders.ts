import { useEffect, useRef } from "react";

type Item = { id: string; meal_slot: string; consumed: boolean; catalog_items?: { name?: string } };

function parseTimeToday(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
}

function notify(title: string, body: string) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "/favicon.ico", tag: title });
  } catch {
    /* ignore */
  }
}

export function useMealReminders({
  enabled,
  items,
  times,
}: {
  enabled: boolean;
  items: Item[];
  times: Record<string, string>;
}) {
  const fired = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    if (!("Notification" in window)) return;

    const today = new Date().toDateString();
    const slots = ["breakfast", "lunch", "dinner", "snack", "drink"] as const;
    const timeouts: number[] = [];

    for (const slot of slots) {
      const t = times[slot];
      if (!t) continue;
      const fireAt = parseTimeToday(t);
      const delay = fireAt - Date.now();
      if (delay < -5 * 60 * 1000) continue; // skip if more than 5 min past
      const key = `${today}-${slot}`;
      if (fired.current.has(key)) continue;

      const id = window.setTimeout(() => {
        const pending = items.filter((i) => i.meal_slot === slot && !i.consumed);
        if (pending.length === 0) return;
        const names = pending.map((p) => p.catalog_items?.name).filter(Boolean).slice(0, 3).join(", ");
        const label = slot.charAt(0).toUpperCase() + slot.slice(1);
        notify(`${label} time`, names ? `Don't forget: ${names}` : `${pending.length} item${pending.length > 1 ? "s" : ""} pending`);
        fired.current.add(key);
      }, Math.max(0, delay));
      timeouts.push(id);
    }

    return () => timeouts.forEach((id) => clearTimeout(id));
  }, [enabled, items, times]);
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  return await Notification.requestPermission();
}