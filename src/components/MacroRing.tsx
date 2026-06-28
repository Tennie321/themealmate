import { cn } from "@/lib/utils";

export function MacroRing({
  value,
  target,
  label,
  unit,
  size = 120,
  stroke = 10,
  color = "primary",
}: {
  value: number;
  target: number;
  label: string;
  unit: string;
  size?: number;
  stroke?: number;
  color?: "primary" | "accent" | "destructive";
}) {
  const pct = Math.min(1, target > 0 ? value / target : 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct);
  const strokeColor =
    color === "accent" ? "var(--citrus)" : color === "destructive" ? "var(--destructive)" : "var(--primary)";
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} stroke="var(--muted)" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          stroke={strokeColor}
          className={cn("transition-all duration-700")}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-2xl font-bold leading-none">{Math.round(value)}</div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
          / {target}{unit}
        </div>
        <div className="text-[10px] font-semibold text-muted-foreground mt-0.5">{label}</div>
      </div>
    </div>
  );
}