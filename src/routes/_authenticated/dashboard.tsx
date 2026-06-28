import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getDashboard } from "@/lib/data.functions";
import { getOnboardingStatus } from "@/lib/data.functions";
import { generatePlan, swapItem, toggleFavorite } from "@/lib/meal-plan.functions";
import { MacroRing } from "@/components/MacroRing";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Heart, RefreshCw, Sparkles, ShoppingBasket, ChevronRight, Loader2, Coffee, Sun, Moon, Cookie, Droplets } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

const SECTION_META: Record<string, { label: string; icon: any }> = {
  breakfast: { label: "Breakfast", icon: Sun },
  lunch: { label: "Lunch", icon: Sun },
  dinner: { label: "Dinner", icon: Moon },
  snack: { label: "Snacks", icon: Cookie },
  drink: { label: "Drinks", icon: Droplets },
};

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const onb = useQuery({ queryKey: ["onb"], queryFn: () => getOnboardingStatus() });
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => getDashboard() });
  const [swapTarget, setSwapTarget] = useState<any>(null);

  useEffect(() => {
    if (onb.data && !onb.data.onboarded) navigate({ to: "/onboarding" });
  }, [onb.data, navigate]);

  const generate = useMutation({
    mutationFn: () => generatePlan({ data: {} } as any),
    onSuccess: () => {
      toast.success("Plan ready");
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["shopping"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Couldn't build plan"),
  });

  const fav = useMutation({
    mutationFn: (item_id: string) => toggleFavorite({ data: { item_id } } as any),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard"] }),
  });

  if (dash.isLoading || onb.isLoading) {
    return <div className="p-6 flex items-center justify-center h-[60vh]"><Loader2 className="animate-spin" /></div>;
  }

  const goals = dash.data?.goals;
  const plan = dash.data?.plan;
  const items: any[] = plan?.plan_items ?? [];

  const totals = items.filter((i) => !i.consumed_at || i.consumed_at).reduce(
    (acc, it) => {
      acc.cal += (it.calories ?? 0) * (it.servings ?? 1);
      acc.pro += (it.protein_g ?? 0) * (it.servings ?? 1);
      acc.cost += (it.cost_cents ?? 0);
      return acc;
    },
    { cal: 0, pro: 0, cost: 0 },
  );

  const sections = ["breakfast", "lunch", "dinner", "snack", "drink"] as const;

  return (
    <div className="max-w-md mx-auto px-5 pt-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Today</p>
          <h1 className="text-2xl font-bold">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</h1>
        </div>
        <button
          onClick={async () => { await supabase.auth.signOut(); }}
          className="text-xs text-muted-foreground"
        >
          Sign out
        </button>
      </header>

      <section className="mt-6 bg-card border border-border rounded-3xl p-5">
        <div className="flex justify-around items-center">
          <MacroRing value={totals.cal} target={goals?.calorie_target ?? 0} label="kcal" unit="" color="primary" />
          <MacroRing value={totals.pro} target={goals?.protein_target ?? 0} label="protein" unit="g" color="accent" />
        </div>
        <div className="mt-4 flex items-center justify-between text-sm">
          <div>
            <div className="text-muted-foreground text-xs">Spent today</div>
            <div className="font-semibold">{fmt(totals.cost)} <span className="text-muted-foreground font-normal">of {fmt(goals?.daily_budget_cents ?? 0)}</span></div>
          </div>
          <Link to="/shopping" className="text-primary text-sm font-semibold flex items-center gap-1">
            Shopping list <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {!plan && (
        <div className="mt-6 bg-hero-gradient rounded-3xl p-6 text-white">
          <Sparkles className="w-6 h-6 mb-2" />
          <h2 className="text-xl font-bold">No plan yet for today</h2>
          <p className="text-white/85 text-sm mt-1">We'll pick real packaged items from your store that hit your macros and budget.</p>
          <Button
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            className="mt-4 bg-white text-primary hover:bg-white/90 rounded-2xl w-full h-12 font-semibold"
          >
            {generate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Build today's plan"}
          </Button>
        </div>
      )}

      {plan && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-lg">Your meals</h2>
            <button
              onClick={() => generate.mutate()}
              disabled={generate.isPending}
              className="text-xs text-muted-foreground flex items-center gap-1"
            >
              {generate.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Regenerate
            </button>
          </div>

          {sections.map((sec) => {
            const list = items.filter((i) => i.section === sec);
            if (list.length === 0) return null;
            const meta = SECTION_META[sec];
            const Icon = meta.icon;
            return (
              <div key={sec} className="bg-card border border-border rounded-3xl overflow-hidden">
                <div className="px-5 pt-4 pb-2 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-secondary grid place-items-center text-primary">
                    <Icon className="w-4 h-4" />
                  </div>
                  <h3 className="font-semibold">{meta.label}</h3>
                </div>
                <ul className="divide-y divide-border">
                  {list.map((it) => (
                    <li key={it.id} className="px-5 py-3 flex gap-3 items-start">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium leading-tight">{it.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {it.brand ? `${it.brand} · ` : ""}{Math.round((it.calories ?? 0) * (it.servings ?? 1))} kcal · {Math.round((it.protein_g ?? 0) * (it.servings ?? 1))}g protein {it.servings && it.servings !== 1 ? `· ×${it.servings}` : ""}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{fmt(it.cost_cents ?? 0)}</div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <button onClick={() => it.catalog_item_id && fav.mutate(it.catalog_item_id)} className="text-muted-foreground hover:text-destructive">
                          <Heart className="w-4 h-4" />
                        </button>
                        <button onClick={() => setSwapTarget(it)} className="text-xs font-semibold text-primary">Swap</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          <Link
            to="/shopping"
            className="block bg-card border border-border rounded-3xl p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-secondary grid place-items-center text-primary">
                <ShoppingBasket className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold">Shopping list</div>
                <div className="text-xs text-muted-foreground">Organized by aisle</div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </Link>
        </div>
      )}

      <SwapSheet target={swapTarget} onClose={() => setSwapTarget(null)} />
    </div>
  );
}

function SwapSheet({ target, onClose }: { target: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const swap = useMutation({
    mutationFn: () => swapItem({ data: { plan_item_id: target.id, reason } } as any),
    onSuccess: () => {
      toast.success("Swapped");
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["shopping"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Couldn't swap"),
  });
  return (
    <Sheet open={!!target} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle>Swap {target?.name}</SheetTitle>
        </SheetHeader>
        <div className="space-y-3 mt-4">
          {["Don't like it", "Don't have time", "Want something lighter", "Want more protein", "Out of stock"].map((r) => (
            <button
              key={r}
              onClick={() => setReason(r)}
              className={`w-full text-left px-4 py-3 rounded-2xl border ${reason === r ? "border-primary bg-secondary" : "border-border"}`}
            >
              {r}
            </button>
          ))}
          <Button
            onClick={() => swap.mutate()}
            disabled={swap.isPending}
            className="w-full h-12 rounded-2xl bg-hero-gradient text-white"
          >
            {swap.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Find me something else"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}