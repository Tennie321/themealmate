import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDashboard, setSingleServingOnly, setHealthPreference, setPlanMode } from "@/lib/data.functions";
import { getReminderSettings, saveReminderSettings } from "@/lib/reminders.functions";
import { requestNotificationPermission } from "@/hooks/useMealReminders";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, LogOut, Settings, LineChart, Heart, Bell, Sparkles, MessageCircle, ChefHat } from "lucide-react";
import { toast } from "sonner";
import { TasteQuestions } from "@/components/TasteQuestions";
import { TasteInsights } from "@/components/TasteInsights";
import { ProfileSkeleton } from "@/components/skeletons";
import { InviteFriends } from "@/components/InviteFriends";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const qc = useQueryClient();
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => getDashboard() });
  const reminders = useQuery({ queryKey: ["reminders"], queryFn: () => getReminderSettings() });
  const save = useMutation({
    mutationFn: (vars: { enabled?: boolean; times?: Record<string, string> }) =>
      saveReminderSettings({ data: vars } as any),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["reminders"] }); },
  });
  const ssMut = useMutation({
    mutationFn: (value: boolean) => setSingleServingOnly({ data: { value } } as any),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["dashboard"] }); },
  });
  const hpMut = useMutation({
    mutationFn: (value: "healthier" | "balanced" | "indulgent") =>
      setHealthPreference({ data: { value } } as any),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["dashboard"] }); },
  });
  const pmMut = useMutation({
    mutationFn: (value: "surprise" | "comfort") => setPlanMode({ data: { value } } as any),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["dashboard"] }); },
  });
  if (dash.isLoading) return <ProfileSkeleton />;
  const goals: any = dash.data?.goals;
  const bio = goals?.biometrics ?? {};
  const prefs: any = (dash.data as any)?.preferences;
  const singleServing = prefs?.single_serving_only !== false;
  const healthPref: "healthier" | "balanced" | "indulgent" = prefs?.health_preference ?? "balanced";
  const planMode: "surprise" | "comfort" = prefs?.plan_mode ?? "surprise";
  const times = reminders.data?.times ?? { breakfast: "08:00", lunch: "12:30", dinner: "18:30", snack: "15:30" };
  const enabled = reminders.data?.enabled ?? true;

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

      <div className="bg-card border border-border rounded-3xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="font-semibold text-sm">Single-serving only</div>
            <p className="text-xs text-muted-foreground mt-1">
              {singleServing
                ? "On — every planned item is one prepackaged serving. No weighing, no counting."
                : "Off — bulk items are allowed and you'll count servings yourself."}
            </p>
          </div>
          <Switch
            checked={singleServing}
            onCheckedChange={(v) => ssMut.mutate(v)}
          />
        </div>
      </div>

      <div className="bg-card border border-border rounded-3xl p-5">
        <div className="font-semibold text-sm">Healthy vs less healthy</div>
        <p className="text-xs text-muted-foreground mt-1">Bias what the AI picks for you.</p>
        <div className="grid grid-cols-3 gap-2 mt-3">
          {([
            { id: "healthier", label: "Healthier", body: "Whole foods" },
            { id: "balanced", label: "Balanced", body: "Mix" },
            { id: "indulgent", label: "Less strict", body: "Tastier OK" },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => hpMut.mutate(opt.id)}
              className={`p-3 rounded-2xl border-2 text-left transition ${healthPref === opt.id ? "border-primary bg-secondary" : "border-border bg-card"}`}
            >
              <div className="font-semibold text-sm">{opt.label}</div>
              <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">{opt.body}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-3xl p-5">
        <div className="font-semibold text-sm">Plan mode</div>
        <p className="text-xs text-muted-foreground mt-1">How adventurous should your daily plan be?</p>
        <div className="grid grid-cols-2 gap-2 mt-3">
          {([
            { id: "surprise", label: "Surprise me", body: "New foods you'll likely enjoy" },
            { id: "comfort", label: "Stick with what works", body: "Lean on your favorites" },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => pmMut.mutate(opt.id)}
              className={`p-3 rounded-2xl border-2 text-left transition ${planMode === opt.id ? "border-primary bg-secondary" : "border-border bg-card"}`}
            >
              <div className="font-semibold text-sm">{opt.label}</div>
              <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">{opt.body}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-3xl p-5">
        <div className="mb-3">
          <div className="font-semibold text-sm">What we've learned about you</div>
          <p className="text-xs text-muted-foreground mt-1">Auto-updated from your favorites, swaps, and check-ins.</p>
        </div>
        <TasteInsights />
      </div>

      <div className="bg-card border border-border rounded-3xl p-5">
        <div className="mb-3">
          <div className="font-semibold text-sm">Taste profile</div>
          <p className="text-xs text-muted-foreground mt-1">The AI uses these answers when picking your meals.</p>
        </div>
        <TasteQuestions
          initial={Array.isArray(prefs?.taste_profile) ? prefs.taste_profile : []}
          ctaLabel="Save taste profile"
          onSaved={() => qc.invalidateQueries({ queryKey: ["dashboard"] })}
        />
      </div>

      <div className="bg-card border border-border rounded-3xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            <div>
              <div className="font-semibold text-sm">Smart reminders</div>
              <div className="text-xs text-muted-foreground">Morning briefing + meal nudges</div>
            </div>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={async (v) => {
              if (v) await requestNotificationPermission();
              save.mutate({ enabled: v });
            }}
          />
        </div>
        {enabled && (
          <div className="space-y-2">
            {(["breakfast", "lunch", "dinner", "snack"] as const).map((slot) => (
              <div key={slot} className="flex items-center justify-between gap-3">
                <span className="text-sm capitalize">{slot}</span>
                <Input
                  type="time"
                  value={times[slot] ?? ""}
                  onChange={(e) => save.mutate({ times: { ...times, [slot]: e.target.value } })}
                  className="w-32 h-9"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <InviteFriends />

      <Link to="/upgrade">
        <Button className="w-full h-12 rounded-2xl bg-hero-gradient text-white">
          <Sparkles className="w-4 h-4 mr-2" /> Upgrade plan
        </Button>
      </Link>

      <Link to="/coach">
        <Button variant="outline" className="w-full h-12 rounded-2xl">
          <MessageCircle className="w-4 h-4 mr-2" /> AI Coach
        </Button>
      </Link>

      <Link to="/restaurant">
        <Button variant="outline" className="w-full h-12 rounded-2xl">
          <ChefHat className="w-4 h-4 mr-2" /> Restaurant Mode
        </Button>
      </Link>

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