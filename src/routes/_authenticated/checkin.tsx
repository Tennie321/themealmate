import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { getDashboard, getCheckinHistory } from "@/lib/data.functions";
import { submitCheckin } from "@/lib/meal-plan.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/checkin")({
  component: CheckinPage,
});

function CheckinPage() {
  const qc = useQueryClient();
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => getDashboard() });
  const history = useQuery({ queryKey: ["checkin-history"], queryFn: () => getCheckinHistory() });
  const [cal, setCal] = useState(0);
  const [pro, setPro] = useState(0);
  const [notes, setNotes] = useState("");

  const goals: any = dash.data?.goals;
  const plan: any = dash.data?.plan;
  const existing: any = dash.data?.checkin;

  useEffect(() => {
    if (plan) {
      setCal((c) => c || plan.total_calories || 0);
      setPro((p) => p || Math.round(plan.total_protein) || 0);
    }
  }, [plan]);

  const submit = useMutation({
    mutationFn: () => submitCheckin({ data: { planId: plan.id, caloriesActual: cal, proteinActual: pro, notes } } as any),
    onSuccess: () => {
      toast.success("Logged");
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["checkin-history"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Couldn't save"),
  });

  if (dash.isLoading) return <div className="p-10 grid place-items-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="max-w-md mx-auto px-5 pt-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">End of day</h1>
        <p className="text-muted-foreground text-sm mt-1">You said X. Here's what happened.</p>
      </div>

      {!plan && <p className="text-muted-foreground">No plan today — build one to check in.</p>}

      {plan && (
        <>
          <div className="bg-card border border-border rounded-3xl p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">You said</div>
                <div className="font-bold text-lg">{goals?.calorie_target} kcal</div>
                <div className="text-xs text-muted-foreground">{goals?.protein_target}g protein</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Plan said</div>
                <div className="font-bold text-lg">{plan.total_calories} kcal</div>
                <div className="text-xs text-muted-foreground">{Math.round(plan.total_protein)}g protein</div>
              </div>
            </div>

            <div className="border-t border-border pt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">Calories actually eaten</Label>
                  <Input type="number" value={cal} onChange={(e) => setCal(+e.target.value)} className="mt-1 h-11 rounded-xl" />
                </div>
                <div>
                  <Label className="text-sm">Protein (g)</Label>
                  <Input type="number" value={pro} onChange={(e) => setPro(+e.target.value)} className="mt-1 h-11 rounded-xl" />
                </div>
              </div>
              <div>
                <Label className="text-sm">Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What got in the way? What worked?" className="mt-1 rounded-xl" />
              </div>
              <Button onClick={() => submit.mutate()} disabled={submit.isPending} className="w-full h-12 rounded-2xl bg-hero-gradient text-white">
                {submit.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : existing ? "Update check-in" : "Submit check-in"}
              </Button>
            </div>
          </div>

          {existing?.reflection && (
            <div className="bg-secondary border border-border rounded-3xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <div className="text-xs uppercase tracking-widest text-muted-foreground">MealMate says</div>
              </div>
              <p className="text-sm leading-relaxed">{existing.reflection}</p>
              <div className="mt-3 text-xs text-muted-foreground">Adherence: <span className="font-bold text-foreground">{existing.adherence_pct}%</span></div>
            </div>
          )}
        </>
      )}

      {history.data && history.data.history.length > 0 && (
        <div>
          <h2 className="font-bold text-lg mb-3">Last 7 days</h2>
          <div className="bg-card border border-border rounded-3xl divide-y divide-border">
            {history.data.history.map((h: any) => (
              <div key={h.plan_date} className="px-4 py-3 flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">{new Date(h.plan_date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</div>
                  <div className="text-xs text-muted-foreground">{h.calories_actual}/{h.calories_target} kcal · {h.protein_actual}/{h.protein_target}g</div>
                </div>
                <div className={`text-sm font-bold ${h.adherence_pct >= 90 ? "text-primary" : h.adherence_pct >= 70 ? "text-foreground" : "text-destructive"}`}>{h.adherence_pct}%</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}