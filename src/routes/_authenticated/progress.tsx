import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getProgress, logWeight, setTargetWeight, deleteWeight } from "@/lib/progress.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine, BarChart, Bar } from "recharts";
import { Loader2, Plus, Target, Trash2, Trophy, Flame, ArrowLeft, Snowflake } from "lucide-react";
import { toast } from "sonner";
import { ProgressSkeleton } from "@/components/skeletons";

export const Route = createFileRoute("/_authenticated/progress")({
  component: Progress,
});

const KG_TO_LB = 2.20462;
const LB_TO_KG = 1 / KG_TO_LB;
const kgToLb = (kg: number) => kg * KG_TO_LB;

function Progress() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["progress"], queryFn: () => getProgress() });
  const [logOpen, setLogOpen] = useState(false);
  const [targetOpen, setTargetOpen] = useState(false);

  useEffect(() => {
    const newly = q.data?.newly_earned ?? [];
    if (newly.length) toast.success(`🏆 New badge unlocked!`);
  }, [q.data?.newly_earned]);

  if (q.isLoading) return <ProgressSkeleton />;

  const d = q.data!;
  const latestLb = d.latest_weight_kg != null ? kgToLb(d.latest_weight_kg) : null;
  const targetLb = d.target_weight_kg != null ? kgToLb(d.target_weight_kg) : null;
  const startLb = d.start_weight_kg != null ? kgToLb(d.start_weight_kg) : null;
  const toGo = d.to_go_lbs != null ? Math.round(d.to_go_lbs) : null;

  const chartData = d.weights.map((w: any) => ({
    date: w.logged_on.slice(5),
    lb: Math.round(kgToLb(w.weight_kg) * 10) / 10,
  }));

  return (
    <div className="max-w-md mx-auto px-5 pt-8 pb-6">
      <header className="flex items-center gap-3">
        <Link to="/profile" className="text-muted-foreground"><ArrowLeft className="w-5 h-5" /></Link>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Progress</p>
          <h1 className="text-2xl font-bold">Your report</h1>
        </div>
      </header>

      {/* Countdown */}
      <section className="mt-6 rounded-3xl p-6 text-white bg-hero-gradient">
        {targetLb != null && latestLb != null && toGo != null ? (
          <>
            <div className="text-xs uppercase tracking-[0.25em] opacity-80">{d.goal_pct}% there</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-6xl font-extrabold leading-none">{toGo}</span>
              <span className="text-2xl font-semibold opacity-90">LBS TO GO</span>
            </div>
            <div className="mt-4 h-2.5 bg-white/25 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full" style={{ width: `${d.goal_pct}%` }} />
            </div>
            <div className="mt-3 flex justify-between text-xs opacity-90">
              <span>Start {startLb ? Math.round(startLb) : "—"} lb</span>
              <span>Now {Math.round(latestLb)} lb</span>
              <span>Goal {Math.round(targetLb)} lb</span>
            </div>
          </>
        ) : (
          <>
            <Target className="w-6 h-6 mb-2" />
            <div className="text-xl font-bold">Set a goal weight</div>
            <p className="text-sm opacity-90 mt-1">Track the countdown to where you want to be.</p>
            <Button onClick={() => setTargetOpen(true)} className="mt-3 bg-white text-primary hover:bg-white/90 rounded-2xl">
              Set target
            </Button>
          </>
        )}
      </section>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button onClick={() => setLogOpen(true)} className="h-12 rounded-2xl font-semibold">
          <Plus className="w-4 h-4 mr-1" /> Log weight
        </Button>
        <Button onClick={() => setTargetOpen(true)} variant="outline" className="h-12 rounded-2xl">
          <Target className="w-4 h-4 mr-1" /> Edit target
        </Button>
      </div>

      {/* Weight chart */}
      <section className="mt-5 bg-card border border-border rounded-3xl p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Weight trend</h2>
          <span className="text-xs text-muted-foreground">{d.weights.length} entr{d.weights.length === 1 ? "y" : "ies"}</span>
        </div>
        {d.weights_truncated && (
          <div className="mt-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs p-3 flex items-center justify-between">
            <span>Showing last 7 days. Upgrade for full history.</span>
            <a href="/upgrade" className="font-semibold underline">Upgrade</a>
          </div>
        )}
        {chartData.length >= 2 ? (
          <div className="mt-3 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" domain={["dataMin - 2", "dataMax + 2"]} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                {targetLb != null && (
                  <ReferenceLine y={Math.round(targetLb * 10) / 10} stroke="hsl(var(--primary))" strokeDasharray="4 4" label={{ value: "Goal", fontSize: 10, fill: "hsl(var(--primary))" }} />
                )}
                <Line type="monotone" dataKey="lb" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Log at least two weights to see your trend.</p>
        )}

        {d.weights.length > 0 && (
          <ul className="mt-4 divide-y divide-border max-h-48 overflow-y-auto">
            {[...d.weights].reverse().map((w: any) => (
              <li key={w.id} className="py-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{w.logged_on}</span>
                <span className="font-medium">{kgToLb(w.weight_kg).toFixed(1)} lb</span>
                <button
                  className="text-muted-foreground hover:text-destructive"
                  onClick={async () => {
                    await deleteWeight({ data: { id: w.id } } as any);
                    qc.invalidateQueries({ queryKey: ["progress"] });
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Weekly report card */}
      <section className="mt-5 bg-card border border-border rounded-3xl p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">This week</h2>
          <div className="text-3xl font-extrabold text-primary leading-none">{d.week.grade}</div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3 text-center">
          <Stat label="Adherence" value={`${d.week.avg_adherence}%`} />
          <Stat label="Avg cal" value={`${d.week.avg_calories}`} />
          <Stat label="Avg protein" value={`${d.week.avg_protein}g`} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-center">
          <Stat label="Perfect days" value={`${d.week.perfect_days}/7`} />
          <Stat
            label="Streak"
            value={
              <span className="inline-flex items-center gap-1">
                {d.checkin_streak}d
                <Snowflake
                  className={`w-3.5 h-3.5 ${d.streak_freeze_available ? "text-sky-500" : "text-muted-foreground/40"}`}
                />
              </span>
            }
            icon={<Flame className="w-4 h-4 text-orange-500" />}
          />
        </div>
        {d.week.series.length > 0 && (
          <div className="mt-4 h-28">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.week.series.map((s: any) => ({ date: s.date.slice(5), adh: Math.round(s.adherence) }))}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis hide domain={[0, 100]} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <ReferenceLine y={90} stroke="hsl(var(--primary))" strokeDasharray="3 3" />
                <Bar dataKey="adh" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {d.week.days === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">Do an end-of-day check-in to start your report card.</p>
        )}
      </section>

      {/* Badges */}
      <section className="mt-5 bg-card border border-border rounded-3xl p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-bold flex items-center gap-2"><Trophy className="w-4 h-4 text-primary" /> Badges</h2>
          <span className="text-xs text-muted-foreground">
            {d.badges.filter((b: any) => b.earned).length} / {d.badges.length}
          </span>
        </div>
        {d.badges.every((b: any) => !b.earned) && (
          <div className="mt-3 rounded-2xl bg-secondary/60 p-3 text-sm">
            <p className="font-semibold">No badges yet — easy first wins:</p>
            <ul className="mt-1.5 space-y-1 text-muted-foreground text-[13px]">
              <li className="flex items-center justify-between gap-2">
                <span>Log your weight</span>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setLogOpen(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Log
                </Button>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span>Set a target weight</span>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setTargetOpen(true)}>
                  <Target className="w-3.5 h-3.5 mr-1" /> Set
                </Button>
              </li>
              <li>Check in 3 days in a row to unlock your first streak badge.</li>
            </ul>
          </div>
        )}
        <div className="mt-3 grid grid-cols-3 gap-3">
          {d.badges.map((b: any) => (
            <div
              key={b.key}
              className={`rounded-2xl p-3 text-center border ${b.earned ? "border-primary bg-secondary" : "border-border opacity-50"}`}
            >
              <div className={`w-10 h-10 mx-auto rounded-full grid place-items-center ${b.earned ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                <Trophy className="w-5 h-5" />
              </div>
              <div className="text-[11px] font-semibold mt-1.5 leading-tight">{b.label}</div>
              <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">{b.description}</div>
            </div>
          ))}
        </div>
      </section>

      <LogWeightSheet open={logOpen} onClose={() => setLogOpen(false)} latestLb={latestLb ?? undefined} />
      <TargetSheet open={targetOpen} onClose={() => setTargetOpen(false)} currentLb={targetLb ?? undefined} />
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-secondary/50 py-3">
      <div className="text-xl font-bold flex items-center justify-center gap-1">{icon}{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function LogWeightSheet({ open, onClose, latestLb }: { open: boolean; onClose: () => void; latestLb?: number }) {
  const qc = useQueryClient();
  const [lb, setLb] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setLb(latestLb ? latestLb.toFixed(1) : ""); }, [open, latestLb]);

  async function submit() {
    const v = parseFloat(lb);
    if (!v || v < 50 || v > 700) { toast.error("Enter a valid weight in pounds"); return; }
    setBusy(true);
    try {
      await logWeight({ data: { weight_kg: Math.round(v * LB_TO_KG * 100) / 100 } } as any);
      qc.invalidateQueries({ queryKey: ["progress"] });
      toast.success("Logged");
      onClose();
    } catch (e: any) { toast.error(e.message ?? "Couldn't save"); }
    finally { setBusy(false); }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader><SheetTitle>Log today's weight</SheetTitle></SheetHeader>
        <div className="mt-4">
          <label className="text-xs text-muted-foreground">Weight (lb)</label>
          <Input
            type="number" inputMode="decimal" step="0.1"
            value={lb} onChange={(e) => setLb(e.target.value)}
            className="mt-1 rounded-2xl h-12 text-lg"
            placeholder="165.0"
          />
        </div>
        <Button onClick={submit} disabled={busy} className="mt-4 w-full h-12 rounded-2xl font-semibold">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
        </Button>
      </SheetContent>
    </Sheet>
  );
}

function TargetSheet({ open, onClose, currentLb }: { open: boolean; onClose: () => void; currentLb?: number }) {
  const qc = useQueryClient();
  const [lb, setLb] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setLb(currentLb ? currentLb.toFixed(0) : ""); }, [open, currentLb]);

  async function submit() {
    const v = parseFloat(lb);
    if (!v || v < 50 || v > 700) { toast.error("Enter a valid target in pounds"); return; }
    setBusy(true);
    try {
      await setTargetWeight({ data: { target_weight_kg: Math.round(v * LB_TO_KG * 100) / 100 } } as any);
      qc.invalidateQueries({ queryKey: ["progress"] });
      toast.success("Target set");
      onClose();
    } catch (e: any) { toast.error(e.message ?? "Couldn't save"); }
    finally { setBusy(false); }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader><SheetTitle>Goal weight</SheetTitle></SheetHeader>
        <div className="mt-4">
          <label className="text-xs text-muted-foreground">Target weight (lb)</label>
          <Input
            type="number" inputMode="decimal" step="1"
            value={lb} onChange={(e) => setLb(e.target.value)}
            className="mt-1 rounded-2xl h-12 text-lg"
            placeholder="150"
          />
        </div>
        <Button onClick={submit} disabled={busy} className="mt-4 w-full h-12 rounded-2xl font-semibold">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save target"}
        </Button>
      </SheetContent>
    </Sheet>
  );
}