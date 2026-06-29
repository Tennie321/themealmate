import { createFileRoute } from "@tanstack/react-router";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Check, ShoppingBasket, Sparkles, Tag, Target, CheckSquare } from "lucide-react";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AddToHomeScreen } from "@/components/AddToHomeScreen";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MealMate — Eat this, get there." },
      { name: "description", content: "An AI meal planner that tells you exactly what to eat from your grocery store to hit your calorie and protein goals." },
      { property: "og:title", content: "MealMate — Eat this, get there." },
      { property: "og:description", content: "AI meal plans from real grocery store items. Hit your macros, on budget, zero guessing." },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/dashboard" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);
  return (
    <div className="min-h-screen bg-background">
      <header className="px-6 pt-8 pb-4 flex items-center justify-between max-w-md mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="relative w-9 h-9 rounded-xl bg-hero-gradient grid place-items-center shadow-sm shadow-primary/20 ring-1 ring-primary/10">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3c3.5 2 5 5 5 8a5 5 0 1 1-10 0c0-3 1.5-6 5-8z" />
              <path d="M12 11v9" />
            </svg>
          </div>
          <span className="font-display font-semibold text-[19px] tracking-tight">
            Meal<span className="text-primary">Mate</span>
          </span>
        </div>
        <Link to="/auth" className="text-sm font-medium text-muted-foreground">Sign in</Link>
      </header>

      <main className="px-6 pb-16 max-w-md mx-auto">
        <section className="pt-8 pb-12">
          <h1 className="text-5xl font-bold leading-[1.05] tracking-tight">
            Eat this,<br />
            <span className="text-hero-gradient">get there.</span>
          </h1>
          <p className="mt-5 text-lg text-foreground/80 leading-relaxed">
            Other apps make you <span className="line-through text-muted-foreground">count</span> calories.<br />
            We make you <span className="font-semibold text-foreground">hit</span> them.
          </p>
          <p className="mt-4 text-base text-muted-foreground leading-relaxed">
            An AI meal planner that tells you exactly what to grab from your grocery store. Every item has a label — the label IS the calorie count.
          </p>
          <Link to="/auth" className="mt-7 block">
            <Button className="w-full h-14 text-base rounded-2xl bg-hero-gradient text-white hover:opacity-95 shadow-lg shadow-primary/25">
              Build my plan
            </Button>
          </Link>
        </section>

        <section className="bg-card border border-border rounded-3xl p-5 mb-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary font-semibold">
            <Target className="w-3.5 h-3.5" /> Dead accurate
          </div>
          <p className="mt-2 text-sm text-foreground leading-relaxed">
            MyFitnessPal users misjudge portions by <span className="font-bold">20–30%</span>. Eyeballing a "chicken breast" isn't tracking — it's guessing.
          </p>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            With MealMate, every meal is a packaged item with a nutrition label. No weighing. No estimating. What the label says is what it is.
          </p>
        </section>

        <section className="bg-primary text-primary-foreground rounded-3xl p-6 mb-4">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] font-bold opacity-90">
            <CheckSquare className="w-3.5 h-3.5" /> How it works
          </div>
          <h2 className="mt-3 text-2xl font-bold leading-tight">
            Eat it. <span className="opacity-80">→</span> Check it. <span className="opacity-80">→</span> Know where you stand.
          </h2>
          <p className="mt-3 text-sm leading-relaxed opacity-90">
            Your plan is a live checklist. Tap a meal when you eat it — calories eaten, calories left, protein hit, protein left all update instantly.
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {["No separate logging", "No math", "No weighing", "Just check"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md bg-primary-foreground/15 grid place-items-center">
                  <Check className="w-3.5 h-3.5" />
                </div>
                <span className="font-medium">{t}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-4 mt-4">
          {[
            { icon: Tag, title: "The label IS the count", body: "No weighing scales, no guesswork. Every item is prepackaged with a nutrition label." },
            { icon: Sparkles, title: "AI plans, real food", body: "We pick items from your store that hit your macros and your budget." },
            { icon: ShoppingBasket, title: "Shopping list by aisle", body: "Grouped by aisle with prices. Swap anything out of stock in one tap." },
            { icon: Check, title: "Accountability that sticks", body: "End-of-day check-in: you said X, here's what happened." },
          ].map((f) => (
            <div key={f.title} className="bg-card border border-border rounded-3xl p-5 flex gap-4">
              <div className="w-11 h-11 rounded-2xl bg-secondary grid place-items-center text-primary shrink-0">
                <f.icon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{f.body}</p>
              </div>
            </div>
          ))}
        </section>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Premier Protein, Fairlife, Oikos, RXBAR, and 60+ packaged staples already in our catalog.
        </p>
      </main>
      <AddToHomeScreen />
    </div>
  );
}
