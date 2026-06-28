import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getDashboard } from "@/lib/data.functions";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, LogOut, Settings, LineChart, Heart } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => getDashboard() });
  if (dash.isLoading) return <div className="p-10 grid place-items-center"><Loader2 className="animate-spin" /></div>;
  const goals: any = dash.data?.goals;
  const bio = goals?.biometrics ?? {};

  return (
    <div className="max-w-md mx-auto px-5 pt-8 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-hero-gradient grid place-items-center text-white font-bold text-xl">M</div>
        <div>
          <h1 className="text-2xl font-bold">My plan</h1>
          <p className="text-xs text-muted-foreground">Your targets and preferences</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-3xl p-5 space-y-3">
        <Row label="Goal" value={goals?.goal_type ?? "—"} />
        <Row label="Calorie target" value={goals?.calorie_target ? `${goals.calorie_target} cal` : "—"} />
        <Row label="Protein target" value={goals?.protein_target ? `${goals.protein_target} g` : "—"} />
        <Row label="TDEE" value={goals?.tdee ? `${goals.tdee} cal` : "—"} />
        <Row label="Daily budget" value={goals?.daily_budget_cents != null ? `$${(goals.daily_budget_cents / 100).toFixed(2)}` : "—"} />
      </div>

      <div className="bg-card border border-border rounded-3xl p-5 space-y-3">
        <Row label="Sex" value={bio.sex ?? "—"} />
        <Row label="Age" value={bio.age ?? "—"} />
        <Row label="Height" value={bio.height_cm ? (() => { const totalIn = Math.round(bio.height_cm / 2.54); return `${Math.floor(totalIn / 12)}′ ${totalIn % 12}″`; })() : "—"} />
        <Row label="Weight" value={bio.weight_kg ? `${Math.round(bio.weight_kg * 2.2046226218)} lb` : "—"} />
        <Row label="Activity" value={bio.activity ?? "—"} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/progress"><Button variant="outline" className="w-full h-12 rounded-2xl"><LineChart className="w-4 h-4 mr-2" /> Progress</Button></Link>
        <Link to="/favorites"><Button variant="outline" className="w-full h-12 rounded-2xl"><Heart className="w-4 h-4 mr-2" /> Saved</Button></Link>
      </div>

      <Link to="/onboarding">
        <Button variant="outline" className="w-full h-12 rounded-2xl">
          <Settings className="w-4 h-4 mr-2" /> Re-run setup
        </Button>
      </Link>

      <Button
        variant="ghost"
        onClick={async () => { await supabase.auth.signOut(); }}
        className="w-full h-12 rounded-2xl text-destructive hover:text-destructive"
      >
        <LogOut className="w-4 h-4 mr-2" /> Sign out
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium capitalize">{String(value).replace(/_/g, " ")}</span>
    </div>
  );
}