import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { calcTDEE, goalAdjustments, type Activity } from "@/lib/tdee";
import { ArrowLeft, Loader2, Check } from "lucide-react";
import {
  saveGoal,
  saveBiometrics,
  saveStore,
  saveBudget,
  savePreferences,
  getStores,
} from "@/lib/data.functions";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: Onboarding,
});

type Step = 0 | 1 | 2 | 3 | 4;

function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(0);

  // form state
  const [goal, setGoal] = useState<"cut" | "lean_bulk" | "maintain" | "custom">("maintain");
  const [sex, setSex] = useState<"male" | "female">("male");
  const [age, setAge] = useState(28);
  const [heightFt, setHeightFt] = useState(5);
  const [heightIn, setHeightIn] = useState(10);
  const [weightLb, setWeightLb] = useState(176);
  const [activity, setActivity] = useState<Activity>("moderate");
  const [calOverride, setCalOverride] = useState<number | null>(null);
  const [proOverride, setProOverride] = useState<number | null>(null);
  const [storeId, setStoreId] = useState<string>("");
  const [budget, setBudget] = useState(20);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [dislikes, setDislikes] = useState<string[]>([]);
  const [dietTags, setDietTags] = useState<string[]>([]);

  const stores = useQuery({ queryKey: ["stores"], queryFn: () => getStores() });

  const heightCm = Math.round((heightFt * 12 + heightIn) * 2.54);
  const weightKg = +(weightLb / 2.2046226218).toFixed(1);
  const tdee = calcTDEE({ sex, age, height_cm: heightCm, weight_kg: weightKg, activity });
  const adj = goalAdjustments(goal, tdee, weightKg);
  const calorieTarget = calOverride ?? adj.calorie_target;
  const proteinTarget = proOverride ?? adj.protein_target;

  const saveGoalM = useMutation({ mutationFn: (v: any) => saveGoal({ data: v } as any) });
  const saveBioM = useMutation({ mutationFn: (v: any) => saveBiometrics({ data: v } as any) });
  const saveStoreM = useMutation({ mutationFn: (v: any) => saveStore({ data: v } as any) });
  const saveBudgetM = useMutation({ mutationFn: (v: any) => saveBudget({ data: v } as any) });
  const savePrefsM = useMutation({ mutationFn: (v: any) => savePreferences({ data: v } as any) });

  const next = async () => {
    try {
      if (step === 0) {
        await saveGoalM.mutateAsync({ goal_type: goal });
        setStep(1);
      } else if (step === 1) {
        await saveBioM.mutateAsync({
          sex, age, height_cm: heightCm, weight_kg: weightKg, activity, tdee,
          calorie_target: calorieTarget, protein_target: proteinTarget,
        });
        setStep(2);
      } else if (step === 2) {
        if (!storeId) return toast.error("Pick a store");
        await saveStoreM.mutateAsync({ store_id: storeId });
        setStep(3);
      } else if (step === 3) {
        await saveBudgetM.mutateAsync({ daily_budget_cents: Math.round(budget * 100) });
        setStep(4);
      } else if (step === 4) {
        await savePrefsM.mutateAsync({ allergies, dislikes, diet_tags: dietTags });
        navigate({ to: "/dashboard" });
      }
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't save");
    }
  };

  const busy = saveGoalM.isPending || saveBioM.isPending || saveStoreM.isPending || saveBudgetM.isPending || savePrefsM.isPending;

  return (
    <div className="max-w-md mx-auto px-5 pt-8 pb-32 min-h-screen flex flex-col">
      <div className="flex items-center justify-between mb-6">
        {step > 0 ? (
          <button onClick={() => setStep((s) => (s - 1) as Step)} className="text-muted-foreground"><ArrowLeft className="w-5 h-5" /></button>
        ) : <div className="w-5" />}
        <div className="flex gap-1.5">
          {[0,1,2,3,4].map((i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-primary" : i < step ? "w-3 bg-primary/50" : "w-3 bg-border"}`} />
          ))}
        </div>
        <div className="w-5" />
      </div>

      <div className="flex-1">
        {step === 0 && (
          <div>
            <h1 className="text-3xl font-bold">What's the goal?</h1>
            <p className="text-muted-foreground mt-2">We'll tune your calories and protein to match.</p>
            <div className="mt-6 space-y-3">
              {[
                { id: "cut", title: "Cut", body: "Lose fat, keep muscle." },
                { id: "lean_bulk", title: "Lean bulk", body: "Add muscle, minimize fat gain." },
                { id: "maintain", title: "Maintain", body: "Stay where you are." },
                { id: "custom", title: "Custom", body: "I'll set my own targets." },
              ].map((g) => (
                <button
                  key={g.id}
                  onClick={() => setGoal(g.id as any)}
                  className={`w-full text-left p-4 rounded-2xl border-2 transition ${goal === g.id ? "border-primary bg-secondary" : "border-border bg-card"}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{g.title}</div>
                      <div className="text-sm text-muted-foreground">{g.body}</div>
                    </div>
                    {goal === g.id && <div className="w-6 h-6 rounded-full bg-primary text-white grid place-items-center"><Check className="w-4 h-4" /></div>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <h1 className="text-3xl font-bold">A few stats</h1>
            <p className="text-muted-foreground mt-2">For an accurate TDEE.</p>
            <div className="mt-6 space-y-5">
              <div>
                <Label className="text-sm">Sex</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {(["male","female"] as const).map((s) => (
                    <button key={s} onClick={() => setSex(s)} className={`py-3 rounded-xl border-2 capitalize ${sex === s ? "border-primary bg-secondary" : "border-border"}`}>{s}</button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-sm">Age</Label>
                <Input type="number" value={age} onChange={(e) => setAge(+e.target.value)} className="mt-1 h-11 rounded-xl" />
              </div>
              <div>
                <Label className="text-sm">Height</Label>
                <div className="grid grid-cols-2 gap-3 mt-1">
                  <div className="relative">
                    <Input type="number" value={heightFt} onChange={(e) => setHeightFt(+e.target.value)} className="h-11 rounded-xl pr-10" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">ft</span>
                  </div>
                  <div className="relative">
                    <Input type="number" value={heightIn} onChange={(e) => setHeightIn(+e.target.value)} className="h-11 rounded-xl pr-10" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">in</span>
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-sm">Weight</Label>
                <div className="relative mt-1">
                  <Input type="number" value={weightLb} onChange={(e) => setWeightLb(+e.target.value)} className="h-11 rounded-xl pr-12" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">lb</span>
                </div>
              </div>
              <div>
                <Label className="text-sm">Activity</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {[
                    { id: "sedentary", label: "Sedentary" },
                    { id: "light", label: "Light" },
                    { id: "moderate", label: "Moderate" },
                    { id: "very", label: "Very active" },
                  ].map((a) => (
                    <button key={a.id} onClick={() => setActivity(a.id as Activity)} className={`py-2.5 rounded-xl border-2 text-sm ${activity === a.id ? "border-primary bg-secondary" : "border-border"}`}>{a.label}</button>
                  ))}
                </div>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Estimated TDEE</div>
                <div className="text-3xl font-bold mt-1">{tdee} <span className="text-base font-normal text-muted-foreground">kcal/day</span></div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-muted-foreground text-xs">Calorie target</div>
                    <Input type="number" value={calorieTarget} onChange={(e) => setCalOverride(+e.target.value)} className="mt-1 h-10 rounded-xl" />
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Protein (g)</div>
                    <Input type="number" value={proteinTarget} onChange={(e) => setProOverride(+e.target.value)} className="mt-1 h-10 rounded-xl" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h1 className="text-3xl font-bold">Where do you shop?</h1>
            <p className="text-muted-foreground mt-2">We'll only recommend items at your store.</p>
            <div className="mt-6 space-y-2">
              {stores.isLoading && <Loader2 className="animate-spin" />}
              {stores.data?.stores.map((s: any) => (
                <button
                  key={s.id}
                  onClick={() => setStoreId(s.id)}
                  className={`w-full text-left p-4 rounded-2xl border-2 ${storeId === s.id ? "border-primary bg-secondary" : "border-border bg-card"}`}
                >
                  <div className="font-semibold">{s.name}</div>
                  {s.chain && <div className="text-xs text-muted-foreground">{s.chain}</div>}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h1 className="text-3xl font-bold">Daily food budget</h1>
            <p className="text-muted-foreground mt-2">We'll stay under it.</p>
            <div className="mt-10 text-center">
              <div className="text-6xl font-bold">${budget}</div>
              <div className="text-muted-foreground text-sm mt-2">per day</div>
            </div>
            <Slider value={[budget]} min={8} max={60} step={1} onValueChange={(v) => setBudget(v[0])} className="mt-8" />
            <div className="flex justify-between text-xs text-muted-foreground mt-2"><span>$8</span><span>$60</span></div>
          </div>
        )}

        {step === 4 && (
          <div>
            <h1 className="text-3xl font-bold">Anything to avoid?</h1>
            <p className="text-muted-foreground mt-2">Tap all that apply.</p>
            <div className="mt-5">
              <Label className="text-sm">Allergies</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {["dairy","gluten","peanuts","tree nuts","soy","eggs","shellfish","fish"].map((a) => (
                  <Chip key={a} label={a} active={allergies.includes(a)} onClick={() => setAllergies(toggle(allergies, a))} />
                ))}
              </div>
            </div>
            <div className="mt-5">
              <Label className="text-sm">Don't like</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {["mushrooms","olives","cottage cheese","tuna","sardines","greek yogurt","tofu"].map((a) => (
                  <Chip key={a} label={a} active={dislikes.includes(a)} onClick={() => setDislikes(toggle(dislikes, a))} />
                ))}
              </div>
            </div>
            <div className="mt-5">
              <Label className="text-sm">Diet</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {["high_protein","vegetarian","pescatarian","low_carb","mediterranean"].map((a) => (
                  <Chip key={a} label={a.replace("_"," ")} active={dietTags.includes(a)} onClick={() => setDietTags(toggle(dietTags, a))} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 inset-x-0 px-5 pb-6 pt-3 bg-gradient-to-t from-background via-background to-transparent">
        <div className="max-w-md mx-auto">
          <Button onClick={next} disabled={busy} className="w-full h-14 rounded-2xl bg-hero-gradient text-white text-base">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : step === 4 ? "Finish & build my plan" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-full text-sm border-2 capitalize ${active ? "border-primary bg-primary text-white" : "border-border bg-card"}`}
    >
      {label}
    </button>
  );
}

function toggle(list: string[], v: string) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}