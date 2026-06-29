import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getDashboard } from "@/lib/data.functions";
import { getOnboardingStatus } from "@/lib/data.functions";
import { generatePlan, swapItem, toggleFavorite, toggleConsumed, setSlotConsumed } from "@/lib/meal-plan.functions";
import { submitPlanFeedback } from "@/lib/taste.functions";
import { MacroRing } from "@/components/MacroRing";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Heart, RefreshCw, Sparkles, ShoppingBasket, ChevronRight, Loader2, Sun, Moon, Cookie, Share2, Store as StoreIcon, Check } from "lucide-react";
import { saveStore } from "@/lib/data.functions";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getReminderSettings, markBriefingShown } from "@/lib/reminders.functions";
import { useMealReminders, requestNotificationPermission } from "@/hooks/useMealReminders";
import { MorningBriefing } from "@/components/MorningBriefing";
import { FoodImage } from "@/components/FoodImage";
import { StoreLogo } from "@/components/StoreLogo";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

const SECTION_META: Record<string, { label: string; icon: any }> = {
  breakfast: { label: "Breakfast", icon: Sun },
  lunch: { label: "Lunch", icon: Sun },
  dinner: { label: "Dinner", icon: Moon },
  snack: { label: "Snacks", icon: Cookie },
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
  const reminders = useQuery({ queryKey: ["reminders"], queryFn: () => getReminderSettings() });
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  const [newPlanOpen, setNewPlanOpen] = useState(false);
  const [feedbackReasons, setFeedbackReasons] = useState<string[]>([]);
  const [feedbackNote, setFeedbackNote] = useState("");

  useEffect(() => {
    if (onb.data && !onb.data.onboarded) navigate({ to: "/onboarding" });
  }, [onb.data, navigate]);

  // Show morning briefing once per day when plan is loaded
  useEffect(() => {
    if (!dash.data || !reminders.data) return;
    if (reminders.data.briefingShownToday) return;
    setBriefingOpen(true);
  }, [dash.data, reminders.data]);

  // Ask for notification permission once when reminders are enabled
  useEffect(() => {
    if (reminders.data?.enabled) {
      requestNotificationPermission();
    }
  }, [reminders.data?.enabled]);

  const generate = useMutation({
    mutationFn: (vars?: { storeId?: string }) =>
      generatePlan({ data: { regenerate: true, storeId: vars?.storeId } } as any),
    onSuccess: () => {
      toast.success("Plan ready");
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["shopping"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Couldn't build plan"),
  });

  const makeNewPlan = useMutation({
    mutationFn: async () => {
      if (feedbackReasons.length || feedbackNote.trim()) {
        await submitPlanFeedback({
          data: { reasons: feedbackReasons, note: feedbackNote.trim() || undefined },
        } as any);
      }
      return generatePlan({ data: { regenerate: true } } as any);
    },
    onSuccess: () => {
      toast.success("New plan ready — tuned to your feedback");
      setNewPlanOpen(false);
      setFeedbackReasons([]);
      setFeedbackNote("");
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["shopping"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Couldn't build plan"),
  });

  const pickStore = useMutation({
    mutationFn: async (storeId: string) => {
      await saveStore({ data: { store_id: storeId } } as any);
    },
    onSuccess: () => {
      setStorePickerOpen(false);
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["shopping"] });
    },
  });

  const fav = useMutation({
    mutationFn: (catalogItemId: string) => toggleFavorite({ data: { catalogItemId, favorite: true } } as any),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard"] }),
  });

  const consume = useMutation({
    mutationFn: (vars: { planItemId: string; consumed: boolean }) =>
      toggleConsumed({ data: vars } as any),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["dashboard"] });
      const prev = qc.getQueryData<any>(["dashboard"]);
      if (prev?.plan?.plan_items) {
        qc.setQueryData(["dashboard"], {
          ...prev,
          plan: {
            ...prev.plan,
            plan_items: prev.plan.plan_items.map((p: any) =>
              p.id === vars.planItemId ? { ...p, consumed: vars.consumed } : p,
            ),
          },
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["dashboard"], ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["dashboard"] }),
  });

  const consumeSlot = useMutation({
    mutationFn: (vars: { planId: string; mealSlot: string; consumed: boolean }) =>
      setSlotConsumed({ data: vars } as any),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["dashboard"] });
      const prev = qc.getQueryData<any>(["dashboard"]);
      if (prev?.plan?.plan_items) {
        qc.setQueryData(["dashboard"], {
          ...prev,
          plan: {
            ...prev.plan,
            plan_items: prev.plan.plan_items.map((p: any) =>
              p.meal_slot === vars.mealSlot ? { ...p, consumed: vars.consumed } : p,
            ),
          },
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["dashboard"], ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["dashboard"] }),
  });

  if (dash.isLoading || onb.isLoading) {
    return <div className="p-6 flex items-center justify-center h-[60vh]"><Loader2 className="animate-spin" /></div>;
  }

  const goals: any = dash.data?.goals;
  const plan: any = dash.data?.plan;
  const items: any[] = plan?.plan_items ?? [];
  const currentStore: any = dash.data?.currentStore;
  const stores: any[] = dash.data?.stores ?? [];

  const totals = items.reduce(
    (acc, it) => {
      const ci = it.catalog_items ?? {};
      const s = Number(it.servings ?? 1);
      acc.cal += Number(ci.calories ?? 0) * s;
      acc.pro += Number(ci.protein_g ?? 0) * s;
      acc.cost += Number(ci.price_cents ?? 0) * s;
      return acc;
    },
    { cal: 0, pro: 0, cost: 0 },
  );

  const eaten = items.reduce(
    (acc, it) => {
      if (!it.consumed) return acc;
      const ci = it.catalog_items ?? {};
      const s = Number(it.servings ?? 1);
      acc.cal += Number(ci.calories ?? 0) * s;
      acc.pro += Number(ci.protein_g ?? 0) * s;
      return acc;
    },
    { cal: 0, pro: 0 },
  );
  const calTarget = goals?.calorie_target ?? 0;
  const proTarget = goals?.protein_target ?? 0;
  const calRemaining = Math.max(0, calTarget - eaten.cal);
  const proRemaining = Math.max(0, proTarget - eaten.pro);
  const calPct = calTarget > 0 ? Math.min(100, (eaten.cal / calTarget) * 100) : 0;

  const sections = ["breakfast", "lunch", "dinner", "snack"] as const;

  useMealReminders({
    enabled: !!reminders.data?.enabled && !!plan,
    items,
    times: reminders.data?.times ?? {},
  });

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

      <button
        onClick={() => setStorePickerOpen(true)}
        className="mt-4 w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-card border border-border"
      >
        <div className="flex items-center gap-3 min-w-0">
          {currentStore ? (
            <StoreLogo website={currentStore.website} chain={currentStore.chain} name={currentStore.name} size={36} />
          ) : (
            <div className="w-9 h-9 rounded-xl bg-secondary grid place-items-center text-primary shrink-0">
              <StoreIcon className="w-4 h-4" />
            </div>
          )}
          <div className="text-left min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Shopping at</div>
            <div className="font-semibold truncate">{currentStore?.name ?? "Pick a store"}</div>
          </div>
        </div>
        <span className="text-xs text-primary font-semibold">Change</span>
      </button>

      <section className="mt-6 bg-card border border-border rounded-3xl p-5">
        <div className="flex justify-around items-center">
          <MacroRing value={eaten.cal} target={calTarget} label="eaten" unit="" color="primary" />
          <MacroRing value={eaten.pro} target={proTarget} label="protein" unit="g" color="accent" />
        </div>
        {plan && (
          <div className="mt-5">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="font-semibold">{Math.round(eaten.cal)} eaten</span>
              <span className="text-muted-foreground">{Math.round(calRemaining)} cal left · {Math.max(0, Math.round(proRemaining))}g protein left</span>
            </div>
            <Progress value={calPct} className="h-2" />
            <div className="mt-1 text-[11px] text-muted-foreground">
              Planned today: {Math.round(totals.cal)} cal · {Math.round(totals.pro)}g protein
            </div>
          </div>
        )}
        <div className="mt-4 flex items-center justify-between text-sm">
          <div>
            <div className="text-muted-foreground text-xs">Spent today</div>
            <div className="font-semibold">{fmt(totals.cost)} <span className="text-muted-foreground font-normal">of {fmt(goals?.daily_budget_cents ?? 0)}</span></div>
          </div>
          <Link to="/shopping" className="text-primary text-sm font-semibold flex items-center gap-1">
            Shopping list <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
        {plan && (
          <Link
            to="/share"
            className="mt-4 flex items-center justify-center gap-2 w-full h-11 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm"
          >
            <Share2 className="w-4 h-4" /> Share my day
          </Link>
        )}
      </section>

      {!plan && (
        <div className="mt-6 bg-hero-gradient rounded-3xl p-6 text-white">
          <Sparkles className="w-6 h-6 mb-2" />
          <h2 className="text-xl font-bold">No plan yet for today</h2>
          <p className="text-white/85 text-sm mt-1">We'll pick real packaged items from {currentStore?.name ?? "your store"} that hit your macros and budget.</p>
          <Button
            onClick={() => generate.mutate(undefined)}
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
              onClick={() => setNewPlanOpen(true)}
              disabled={generate.isPending || makeNewPlan.isPending}
              className="text-xs font-semibold text-primary flex items-center gap-1"
            >
              {(generate.isPending || makeNewPlan.isPending) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Make new plan
            </button>
          </div>

          {sections.map((sec) => {
            const list = items.filter((i) => i.meal_slot === sec).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
            if (list.length === 0) return null;
            const meta = SECTION_META[sec];
            const Icon = meta.icon;
            const allConsumed = list.every((i) => i.consumed);
            const secTotals = list.reduce((acc, it) => {
              const ci = it.catalog_items ?? {};
              const s = Number(it.servings ?? 1);
              acc.cal += Number(ci.calories ?? 0) * s;
              acc.pro += Number(ci.protein_g ?? 0) * s;
              return acc;
            }, { cal: 0, pro: 0 });
            return (
              <div key={sec} className="bg-card border border-border rounded-3xl overflow-hidden">
                <div className="px-5 pt-4 pb-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-secondary grid place-items-center text-primary">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{meta.label}</h3>
                      <p className="text-[11px] text-muted-foreground">{Math.round(secTotals.cal)} cal · {Math.round(secTotals.pro)}g protein</p>
                    </div>
                  </div>
                  <button
                    onClick={() => consumeSlot.mutate({ planId: plan.id, mealSlot: sec, consumed: !allConsumed })}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${allConsumed ? "bg-primary text-primary-foreground border-primary" : "border-border text-primary hover:bg-secondary"}`}
                    aria-label={allConsumed ? `Mark all ${meta.label} as not eaten` : `Mark all ${meta.label} as eaten`}
                  >
                    {allConsumed ? (<span className="inline-flex items-center gap-1"><Check className="w-3 h-3" /> All eaten</span>) : "Ate it all"}
                  </button>
                </div>
                <ul className="divide-y divide-border">
                  {list.map((it) => (
                    <li key={it.id} className="px-5 py-3 flex gap-3 items-start">
                      <Checkbox
                        checked={!!it.consumed}
                        onCheckedChange={(c) => consume.mutate({ planItemId: it.id, consumed: !!c })}
                        className="mt-1"
                        aria-label={`Mark ${it.catalog_items?.name} as eaten`}
                      />
                      <FoodImage
                        name={it.catalog_items?.name}
                        category={it.catalog_items?.category}
                        imageUrl={it.catalog_items?.image_url}
                        size="md"
                      />
                      <div className="flex-1 min-w-0">
                        <div className={`font-medium leading-tight ${it.consumed ? "line-through text-muted-foreground" : ""}`}>{it.catalog_items?.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {it.catalog_items?.brand ? `${it.catalog_items.brand} · ` : ""}{Math.round((it.catalog_items?.calories ?? 0) * Number(it.servings ?? 1))} cal · {Math.round(Number(it.catalog_items?.protein_g ?? 0) * Number(it.servings ?? 1))}g protein {Number(it.servings) !== 1 ? `· ×${it.servings}` : ""}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{fmt(Number(it.catalog_items?.price_cents ?? 0) * Number(it.servings ?? 1))}</div>
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

      <Sheet open={storePickerOpen} onOpenChange={setStorePickerOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[80vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Where are you shopping today?</SheetTitle>
          </SheetHeader>
          <p className="text-xs text-muted-foreground mt-1">Pick a store and we'll rebuild today's plan with what's in stock there.</p>
          <div className="mt-4 space-y-2 pb-4">
            {stores.map((s) => {
              const active = currentStore?.id === s.id;
              return (
                <button
                  key={s.id}
                  disabled={pickStore.isPending || generate.isPending}
                  onClick={async () => {
                    await pickStore.mutateAsync(s.id);
                    generate.mutate({ storeId: s.id });
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-2xl border ${active ? "border-primary bg-secondary" : "border-border"}`}
                >
                  <StoreLogo website={s.website} chain={s.chain} name={s.name} size={40} />
                  <div className="flex-1 min-w-0 text-left">
                    <div className="font-medium truncate">{s.name}</div>
                    {s.chain && <div className="text-xs text-muted-foreground truncate">{s.chain}</div>}
                  </div>
                  {active && <Check className="w-4 h-4 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      <MorningBriefing
        open={briefingOpen}
        onClose={async () => {
          setBriefingOpen(false);
          try { await markBriefingShown(); } catch { /* ignore */ }
          qc.invalidateQueries({ queryKey: ["reminders"] });
        }}
        items={items}
        calTarget={calTarget}
        proTarget={proTarget}
        budgetCents={goals?.daily_budget_cents ?? 0}
        spentCents={totals.cost}
        times={reminders.data?.times ?? {}}
      />
    </div>
  );
}

function SwapSheet({ target, onClose }: { target: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [alternates, setAlternates] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!target) { setAlternates(null); return; }
    setLoading(true);
    swapItem({ data: { planItemId: target.id } } as any)
      .then((r: any) => setAlternates(r.alternates ?? []))
      .catch((e: any) => toast.error(e.message ?? "Couldn't load options"))
      .finally(() => setLoading(false));
  }, [target]);

  async function pick(id: string) {
    try {
      await swapItem({ data: { planItemId: target.id, replacementId: id } } as any);
      toast.success("Swapped");
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["shopping"] });
      onClose();
    } catch (e: any) { toast.error(e.message ?? "Couldn't swap"); }
  }

  return (
    <Sheet open={!!target} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[80vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Swap {target?.catalog_items?.name}</SheetTitle>
        </SheetHeader>
        <div className="space-y-2 mt-4">
          {loading && <div className="grid place-items-center py-10"><Loader2 className="animate-spin" /></div>}
          {alternates?.map((alt) => (
            <button
              key={alt.id}
              onClick={() => pick(alt.id)}
              className="w-full text-left px-4 py-3 rounded-2xl border border-border hover:border-primary flex items-start gap-3"
            >
              <FoodImage name={alt.name} category={alt.category} imageUrl={alt.image_url} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="font-medium">{alt.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {alt.brand ?? ""} · {alt.calories} cal · {alt.protein_g}g protein · {fmt(alt.price_cents)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {alt.deltaCal >= 0 ? `+${alt.deltaCal}` : alt.deltaCal} cal · {alt.deltaProtein >= 0 ? `+${alt.deltaProtein}` : alt.deltaProtein}g protein
                </div>
              </div>
            </button>
          ))}
          {alternates && alternates.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No alternates available.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}