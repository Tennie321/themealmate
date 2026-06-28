import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Check, ShoppingBasket, Sparkles } from "lucide-react";

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
  return (
    <div className="min-h-screen bg-background">
      <header className="px-6 pt-8 pb-4 flex items-center justify-between max-w-md mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-2xl bg-hero-gradient grid place-items-center text-white font-bold">M</div>
          <span className="font-display font-bold text-xl">MealMate</span>
        </div>
        <Link to="/auth" className="text-sm font-medium text-muted-foreground">Sign in</Link>
      </header>

      <main className="px-6 pb-16 max-w-md mx-auto">
        <section className="pt-8 pb-12">
          <h1 className="text-5xl font-bold leading-[1.05] tracking-tight">
            Eat this,<br />
            <span className="text-hero-gradient">get there.</span>
          </h1>
          <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
            An AI meal planner that tells you exactly what to grab from your grocery store to hit your calorie and protein goals. Every item has a label. Zero guessing.
          </p>
          <Link to="/auth" className="mt-7 block">
            <Button className="w-full h-14 text-base rounded-2xl bg-hero-gradient text-white hover:opacity-95 shadow-lg shadow-primary/25">
              Build my plan
            </Button>
          </Link>
        </section>

        <section className="space-y-4 mt-4">
          {[
            { icon: Sparkles, title: "AI plans, real food", body: "We pick from packaged items at your store with labels you can read." },
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
    </div>
  );
}
