import { forwardRef } from "react";

export type ShareCardProps = {
  dateLabel: string;
  displayName: string;
  calEaten: number;
  calTarget: number;
  proEaten: number;
  proTarget: number;
  meals: { slot: string; name: string; cal: number; pro: number }[];
  tagline?: string;
};

const SLOT_LABEL: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
  drink: "Drink",
};

export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(function ShareCard(
  { dateLabel, displayName, calEaten, calTarget, proEaten, proTarget, meals, tagline },
  ref,
) {
  const calPct = calTarget > 0 ? Math.min(100, Math.round((calEaten / calTarget) * 100)) : 0;
  const proPct = proTarget > 0 ? Math.min(100, Math.round((proEaten / proTarget) * 100)) : 0;
  return (
    <div
      ref={ref}
      style={{
        width: 1080,
        height: 1920,
        background: "linear-gradient(160deg, #0f3d2e 0%, #1f7a4a 55%, #2fa766 100%)",
        color: "white",
        padding: 80,
        fontFamily: "Outfit, Inter, system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: "white", display: "grid", placeItems: "center" }}>
          <span style={{ color: "#1f7a4a", fontWeight: 800, fontSize: 36 }}>M</span>
        </div>
        <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: -0.5 }}>MealMate</div>
      </div>

      <div style={{ marginTop: 90 }}>
        <div style={{ fontSize: 28, opacity: 0.8, textTransform: "uppercase", letterSpacing: 4 }}>{dateLabel}</div>
        <div style={{ fontSize: 80, fontWeight: 800, marginTop: 16, lineHeight: 1.05 }}>{displayName}'s day</div>
        <div style={{ fontSize: 36, opacity: 0.9, marginTop: 18 }}>{tagline ?? "Eat this, get there."}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, marginTop: 70 }}>
        <Stat label="Calories" value={`${Math.round(calEaten)}`} sub={`of ${calTarget}`} pct={calPct} />
        <Stat label="Protein" value={`${Math.round(proEaten)}g`} sub={`of ${proTarget}g`} pct={proPct} />
      </div>

      <div style={{ marginTop: 70, background: "rgba(255,255,255,0.10)", borderRadius: 40, padding: 48, flex: 1 }}>
        <div style={{ fontSize: 32, fontWeight: 700, marginBottom: 28, opacity: 0.95 }}>Today's plate</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {meals.slice(0, 8).map((m, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 22, opacity: 0.7, textTransform: "uppercase", letterSpacing: 2 }}>
                  {SLOT_LABEL[m.slot] ?? m.slot}
                </span>
                <span style={{ fontSize: 30, fontWeight: 600, maxWidth: 720 }}>{m.name}</span>
              </div>
              <span style={{ fontSize: 24, opacity: 0.85, whiteSpace: "nowrap" }}>
                {Math.round(m.cal)} cal · {Math.round(m.pro)}g
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 48, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 26, opacity: 0.85 }}>
        <span>mealmate · AI meal planning</span>
        <span>#EatThisGetThere</span>
      </div>
    </div>
  );
});

function Stat({ label, value, sub, pct }: { label: string; value: string; sub: string; pct: number }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 32, padding: 36 }}>
      <div style={{ fontSize: 24, opacity: 0.8, textTransform: "uppercase", letterSpacing: 3 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 12 }}>
        <span style={{ fontSize: 78, fontWeight: 800, lineHeight: 1 }}>{value}</span>
        <span style={{ fontSize: 26, opacity: 0.8 }}>{sub}</span>
      </div>
      <div style={{ height: 14, background: "rgba(255,255,255,0.2)", borderRadius: 999, marginTop: 24, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "white", borderRadius: 999 }} />
      </div>
      <div style={{ marginTop: 10, fontSize: 22, opacity: 0.85 }}>{pct}% of goal</div>
    </div>
  );
}