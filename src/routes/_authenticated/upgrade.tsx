import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { simulateUpgrade } from "@/lib/billing.functions";
import { usePremiumCheck, type Tier } from "@/hooks/usePremiumCheck";
import { Button } from "@/components/ui/button";
import { Check, X, Sparkles, ArrowLeft, Crown } from "lucide-react";
import { toast } from "sonner";

type Search = { plan?: Tier };

export const Route = createFileRoute("/_authenticated/upgrade")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    plan: (s.plan as Tier) ?? undefined,
  }),
  component: UpgradePage,
});

type Plan = {
  id: Tier;
  name: string;
  price: string;
  cadence: string;
  highlight?: boolean;
  cta: string;
  perks: string[];
};

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    cadence: "forever",
    cta: "Current",
    perks: ["3 plans/day", "Default suggestions", "7-day progress history", "View community"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$9.99",
    cadence: "/month",
    highlight: true,
    cta: "Start 7-day free trial",
    perks: [
      "Unlimited plan generations",
      "Full taste profile + AI personalization",
      "Unlimited progress history",
      "Post to the community",
      "Watermark-free share cards",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    price: "$14.99",
    cadence: "/month",
    cta: "Start 7-day free trial",
    perks: [
      "Everything in Pro",
      "AI coach chat",
      "Restaurant mode (menu scan)",
      "Priority plan generation",
      "Custom macro targets per meal",
    ],
  },
];

const COMPARE: { feature: string; free: boolean | string; pro: boolean | string; premium: boolean | string }[] = [
  { feature: "Plans per day", free: "3", pro: "Unlimited", premium: "Unlimited" },
  { feature: "AI taste personalization", free: false, pro: true, premium: true },
  { feature: "Progress history", free: "7 days", pro: "Unlimited", premium: "Unlimited" },
  { feature: "Community posting", free: false, pro: true, premium: true },
  { feature: "Watermark-free share card", free: false, pro: true, premium: true },
  { feature: "AI coach chat", free: false, pro: false, premium: true },
  { feature: "Restaurant mode", free: false, pro: false, premium: true },
  { feature: "Priority generation", free: false, pro: false, premium: true },
  { feature: "Per-slot macro targets", free: false, pro: false, premium: true },
];

function UpgradePage() {
  const { tier } = usePremiumCheck();
  const search = useSearch({ from: "/_authenticated/upgrade" }) as Search;
  const qc = useQueryClient();
  const navigate = useNavigate();

  const upgrade = useMutation({
    mutationFn: (vars: { tier: Tier; trial: boolean }) =>
      simulateUpgrade({ data: { tier: vars.tier, trial: vars.trial } }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["plan-status"] });
      toast.success(
        vars.tier === "free"
          ? "Switched to Free."
          : `${vars.tier === "pro" ? "Pro" : "Premium"} unlocked${vars.trial ? " — 7-day trial started" : ""}.`,
      );
      navigate({ to: "/dashboard" });
    },
    onError: (e: any) => toast.error(e.message ?? "Couldn't update plan"),
  });

  return (
    <div className="max-w-md mx-auto px-4 pt-4 pb-12">
      <div className="flex items-center justify-between mb-4">
        <Link to="/profile" className="text-muted-foreground flex items-center gap-1 text-sm">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <div className="text-xs text-muted-foreground">
          Current: <span className="font-semibold capitalize text-foreground">{tier}</span>
        </div>
      </div>

      <div className="text-center mb-5">
        <div className="inline-flex w-12 h-12 rounded-2xl bg-hero-gradient text-white items-center justify-center mb-3">
          <Crown className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold">Eat this, get there — faster.</h1>
        <p className="text-sm text-muted-foreground mt-1">Pick a plan. Cancel any time.</p>
      </div>

      <div className="space-y-3">
        {PLANS.map((p) => {
          const isCurrent = p.id === tier;
          const recommended = !!(search.plan ? search.plan === p.id : p.highlight);
          return (
            <div
              key={p.id}
              className={`rounded-3xl border p-5 ${recommended ? "border-primary bg-primary/5" : "border-border bg-card"}`}
            >
              <div className="flex items-baseline justify-between">
                <div className="flex items-center gap-2">
                  <div className="font-semibold text-lg">{p.name}</div>
                  {recommended && (
                    <span className="text-[10px] uppercase tracking-wider bg-primary text-primary-foreground rounded-full px-2 py-0.5">
                      Recommended
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold">{p.price}</div>
                  <div className="text-[11px] text-muted-foreground">{p.cadence}</div>
                </div>
              </div>
              <ul className="mt-3 space-y-1.5 text-sm">
                {p.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2">
                    <Check className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                    <span>{perk}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4">
                {isCurrent ? (
                  <Button disabled className="w-full h-11 rounded-2xl">
                    Current plan
                  </Button>
                ) : p.id === "free" ? (
                  <Button
                    variant="outline"
                    className="w-full h-11 rounded-2xl"
                    onClick={() => upgrade.mutate({ tier: "free", trial: false })}
                  >
                    Downgrade to Free
                  </Button>
                ) : (
                  <Button
                    className="w-full h-11 rounded-2xl bg-hero-gradient text-white"
                    onClick={() => upgrade.mutate({ tier: p.id, trial: true })}
                    disabled={upgrade.isPending}
                  >
                    <Sparkles className="w-4 h-4 mr-1.5" />
                    {p.cta}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8">
        <h2 className="font-semibold mb-2">Compare features</h2>
        <div className="rounded-3xl border border-border bg-card overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left p-2 font-medium">Feature</th>
                <th className="p-2 font-medium">Free</th>
                <th className="p-2 font-medium">Pro</th>
                <th className="p-2 font-medium">Premium</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((row, i) => (
                <tr key={row.feature} className={i % 2 ? "bg-background" : ""}>
                  <td className="p-2">{row.feature}</td>
                  <Cell value={row.free} />
                  <Cell value={row.pro} />
                  <Cell value={row.premium} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground text-center mt-3">
          Payments are simulated for now. We'll wire Stripe before launch.
        </p>
      </div>
    </div>
  );
}

function Cell({ value }: { value: boolean | string }) {
  return (
    <td className="p-2 text-center">
      {typeof value === "string" ? (
        <span>{value}</span>
      ) : value ? (
        <Check className="w-4 h-4 text-primary inline" />
      ) : (
        <X className="w-4 h-4 text-muted-foreground/50 inline" />
      )}
    </td>
  );
}