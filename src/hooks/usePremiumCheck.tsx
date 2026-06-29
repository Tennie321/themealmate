import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { getPlanStatus } from "@/lib/billing.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock, Sparkles, Check } from "lucide-react";

export type Tier = "free" | "pro" | "premium";

export type FeatureKey =
  | "unlimited_plans"
  | "taste_personalization"
  | "full_progress_history"
  | "community_posting"
  | "share_card_export"
  | "ai_coach"
  | "restaurant_mode"
  | "priority_generation"
  | "custom_macro_slots";

const FEATURE_TIER: Record<FeatureKey, Tier> = {
  unlimited_plans: "pro",
  taste_personalization: "pro",
  full_progress_history: "pro",
  community_posting: "pro",
  share_card_export: "pro",
  ai_coach: "premium",
  restaurant_mode: "premium",
  priority_generation: "premium",
  custom_macro_slots: "premium",
};

const FEATURE_LABEL: Record<FeatureKey, { title: string; blurb: string }> = {
  unlimited_plans: { title: "Unlimited meal plans", blurb: "Generate as many plans per day as you like." },
  taste_personalization: { title: "AI taste personalization", blurb: "MealMate learns what you actually like and tailors every plan." },
  full_progress_history: { title: "Full progress history", blurb: "See trends beyond the last 7 days." },
  community_posting: { title: "Share to the community", blurb: "Post your day, get accountability and tips." },
  share_card_export: { title: "Watermark-free share cards", blurb: "Export clean share cards to post anywhere." },
  ai_coach: { title: "AI coach chat", blurb: "Conversational coaching for your goals." },
  restaurant_mode: { title: "Restaurant mode", blurb: "Scan a menu, get on-plan picks." },
  priority_generation: { title: "Priority plan generation", blurb: "Faster model, less waiting." },
  custom_macro_slots: { title: "Per-slot macro targets", blurb: "Set custom calorie and protein targets for each meal." },
};

function meets(current: Tier, required: Tier): boolean {
  const rank: Record<Tier, number> = { free: 0, pro: 1, premium: 2 };
  return rank[current] >= rank[required];
}

type UpsellState = { feature: FeatureKey } | null;
type Ctx = {
  tier: Tier;
  status: ReturnType<typeof getPlanStatus> extends Promise<infer R> ? R | null : null;
  loading: boolean;
  has: (feature: FeatureKey) => boolean;
  /** Returns true if allowed. If not, opens the upsell modal and returns false. */
  require: (feature: FeatureKey) => boolean;
  showUpsell: (feature: FeatureKey) => void;
};

const PremiumContext = createContext<Ctx | null>(null);

export function PremiumProvider({ children }: { children: ReactNode }) {
  const q = useQuery({
    queryKey: ["plan-status"],
    queryFn: () => getPlanStatus(),
    staleTime: 60_000,
  });
  const [upsell, setUpsell] = useState<UpsellState>(null);
  const navigate = useNavigate();
  const tier: Tier = (q.data?.tier as Tier) ?? "free";

  const ctx = useMemo<Ctx>(() => {
    const has = (f: FeatureKey) => meets(tier, FEATURE_TIER[f]);
    return {
      tier,
      status: (q.data as any) ?? null,
      loading: q.isLoading,
      has,
      require: (f: FeatureKey) => {
        if (has(f)) return true;
        setUpsell({ feature: f });
        return false;
      },
      showUpsell: (f: FeatureKey) => setUpsell({ feature: f }),
    };
  }, [tier, q.data, q.isLoading]);

  const feature = upsell?.feature;
  const required = feature ? FEATURE_TIER[feature] : "pro";
  const meta = feature ? FEATURE_LABEL[feature] : null;

  return (
    <PremiumContext.Provider value={ctx}>
      {children}
      <Dialog open={!!upsell} onOpenChange={(o) => !o && setUpsell(null)}>
        <DialogContent className="rounded-3xl max-w-sm">
          <DialogHeader>
            <div className="w-12 h-12 rounded-2xl bg-hero-gradient text-white grid place-items-center mb-3">
              <Sparkles className="w-6 h-6" />
            </div>
            <DialogTitle>{meta?.title ?? "Upgrade to unlock"}</DialogTitle>
            <DialogDescription>{meta?.blurb}</DialogDescription>
          </DialogHeader>
          <ul className="text-sm space-y-2 mt-1">
            {(required === "premium"
              ? ["Everything in Pro", "AI coach chat", "Restaurant mode", "Priority generation"]
              : ["Unlimited plans", "AI personalization", "Full progress history", "Post to the community"]
            ).map((line) => (
              <li key={line} className="flex items-start gap-2">
                <Check className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <Button variant="outline" className="rounded-2xl h-11" onClick={() => setUpsell(null)}>
              Not now
            </Button>
            <Button
              className="rounded-2xl h-11 bg-hero-gradient text-white"
              onClick={() => {
                setUpsell(null);
                navigate({ to: "/upgrade", search: { plan: required } as any });
              }}
            >
              <Lock className="w-4 h-4 mr-1.5" /> See plans
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PremiumContext.Provider>
  );
}

export function usePremiumCheck(): Ctx {
  const ctx = useContext(PremiumContext);
  if (!ctx) throw new Error("usePremiumCheck must be used within <PremiumProvider>");
  return ctx;
}