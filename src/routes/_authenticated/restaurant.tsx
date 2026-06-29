import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  analyzeRestaurantMenu,
  deleteCustomMeal,
  getRestaurantState,
  logCustomMeal,
} from "@/lib/restaurant.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Lock, Loader2, Sparkles, Trash2, Plus, Utensils, ChefHat } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/restaurant")({
  component: Restaurant,
});

type Pick = { name: string; calories: number; protein_g: number; why?: string };
type Analysis = {
  best_pick: Pick | null;
  alternates: Pick[];
  adjustment: string;
  notes?: string;
};

function MacroPill({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className={`rounded-2xl px-3 py-2 text-center ${accent ? "bg-primary/10 text-primary" : "bg-muted text-foreground"}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function PickCard({ p, onAdd, highlight }: { p: Pick; onAdd: () => void; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border p-3 ${highlight ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {highlight && (
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-primary font-semibold mb-1">
              <Sparkles className="w-3 h-3" /> Best pick
            </div>
          )}
          <p className="font-semibold leading-tight">{p.name}</p>
          {p.why && <p className="text-xs text-muted-foreground mt-1">{p.why}</p>}
        </div>
        <Button size="sm" variant={highlight ? "default" : "outline"} className="rounded-xl shrink-0" onClick={onAdd}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Log
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <MacroPill label="Cal" value={p.calories} />
        <MacroPill label="Protein" value={`${p.protein_g}g`} accent />
      </div>
    </div>
  );
}

function Restaurant() {
  const qc = useQueryClient();
  const state = useQuery({ queryKey: ["restaurant"], queryFn: () => getRestaurantState() });
  const [restaurant, setRestaurant] = useState("");
  const [menu, setMenu] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ name: "", calories: "", protein: "" });

  const premium = state.data?.premium === true;
  const remaining = state.data?.remaining;
  const logged = state.data?.logged ?? [];

  const analyze = useMutation({
    mutationFn: () =>
      analyzeRestaurantMenu({ data: { restaurant, menu } } as any),
    onSuccess: (res: any) => {
      setAnalysis(res.analysis ?? null);
      qc.invalidateQueries({ queryKey: ["restaurant"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't analyze that menu"),
  });

  const log = useMutation({
    mutationFn: (p: { name: string; calories: number; protein_g: number; source?: string }) =>
      logCustomMeal({ data: p } as any),
    onSuccess: () => {
      toast.success("Logged to today");
      qc.invalidateQueries({ queryKey: ["restaurant"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't log that"),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteCustomMeal({ data: { id } } as any),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["restaurant"] }),
  });

  function logPick(p: Pick) {
    log.mutate({ name: p.name, calories: p.calories, protein_g: p.protein_g, source: restaurant || "restaurant" });
  }

  function logManual() {
    const name = manual.name.trim();
    const cal = Number(manual.calories);
    const pro = Number(manual.protein);
    if (!name) return toast.error("Name?");
    log.mutate({ name, calories: cal || 0, protein_g: pro || 0, source: restaurant || "manual" });
    setManual({ name: "", calories: "", protein: "" });
    setManualOpen(false);
  }

  return (
    <div className="max-w-md mx-auto px-5 pt-6 pb-32">
      <header className="flex items-center gap-3">
        <Link to="/dashboard" className="text-muted-foreground"><ArrowLeft className="w-5 h-5" /></Link>
        <div className="flex-1">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Premium</p>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Restaurant Mode <ChefHat className="w-5 h-5 text-primary" />
          </h1>
        </div>
      </header>

      {state.isLoading ? (
        <div className="mt-10 grid place-items-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : !premium ? (
        <div className="mt-8 rounded-3xl bg-hero-gradient text-white p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-white/15 grid place-items-center mx-auto mb-3">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-lg">Unlock Restaurant Mode</h3>
          <p className="text-sm text-white/90 mt-1">
            Paste any menu and we'll pick the items that fit your remaining calories and protein for today.
          </p>
          <Button asChild className="mt-4 bg-white text-primary hover:bg-white/90 rounded-2xl w-full h-12 font-semibold">
            <Link to="/upgrade">See Premium plans</Link>
          </Button>
        </div>
      ) : (
        <>
          {remaining && (
            <div className="mt-4 rounded-2xl border border-border bg-card p-3 grid grid-cols-2 gap-2">
              <MacroPill label="Cal left today" value={remaining.calRemaining} />
              <MacroPill label="Protein left" value={`${remaining.proRemaining}g`} accent />
            </div>
          )}

          <section className="mt-5 space-y-2">
            <Input
              placeholder="Restaurant (optional)"
              value={restaurant}
              onChange={(e) => setRestaurant(e.target.value)}
              className="rounded-2xl h-11"
            />
            <Textarea
              placeholder="Paste the menu here — copy/paste from the restaurant's website or type out the dishes you're considering."
              value={menu}
              onChange={(e) => setMenu(e.target.value)}
              rows={8}
              className="rounded-2xl"
            />
            <Button
              onClick={() => analyze.mutate()}
              disabled={!menu.trim() || analyze.isPending}
              className="w-full h-12 rounded-2xl font-semibold"
            >
              {analyze.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Find my best pick
            </Button>
          </section>

          {analysis && (
            <section className="mt-6 space-y-3">
              {analysis.best_pick && (
                <PickCard p={analysis.best_pick} onAdd={() => logPick(analysis.best_pick!)} highlight />
              )}
              {(analysis.alternates ?? []).map((p, i) => (
                <PickCard key={i} p={p} onAdd={() => logPick(p)} />
              ))}
              {analysis.adjustment && (
                <div className="rounded-2xl bg-muted p-4">
                  <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">
                    <Utensils className="w-3 h-3" /> Adjust the rest of your day
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{analysis.adjustment}</p>
                </div>
              )}
            </section>
          )}

          <section className="mt-8">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Logged today</h2>
              <Button size="sm" variant="ghost" onClick={() => setManualOpen((v) => !v)} className="text-primary">
                <Plus className="w-4 h-4 mr-1" /> Quick add
              </Button>
            </div>

            {manualOpen && (
              <div className="mt-2 rounded-2xl border border-border bg-card p-3 space-y-2">
                <Input
                  placeholder="What did you eat?"
                  value={manual.name}
                  onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))}
                  className="rounded-xl"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Calories"
                    inputMode="numeric"
                    value={manual.calories}
                    onChange={(e) => setManual((m) => ({ ...m, calories: e.target.value }))}
                    className="rounded-xl"
                  />
                  <Input
                    placeholder="Protein (g)"
                    inputMode="numeric"
                    value={manual.protein}
                    onChange={(e) => setManual((m) => ({ ...m, protein: e.target.value }))}
                    className="rounded-xl"
                  />
                </div>
                <Button onClick={logManual} className="w-full rounded-xl">Log it</Button>
              </div>
            )}

            <div className="mt-3 space-y-2">
              {logged.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing logged from restaurants today.</p>
              ) : (
                logged.map((c: any) => (
                  <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.calories} cal · {c.protein_g}g protein{c.source ? ` · ${c.source}` : ""}
                      </p>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => del.mutate(c.id)}>
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}