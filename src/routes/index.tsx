import { createFileRoute } from "@tanstack/react-router";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Check, ShoppingBasket, Sparkles, Tag, Target, CheckSquare, ArrowRight, Star, Users, HelpCircle } from "lucide-react";
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
    // Capture ?ref=<userId> so we can credit the referrer after sign-up.
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref) localStorage.setItem("mm_ref", ref);
    } catch {}
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
      <header className="sticky top-0 z-40 backdrop-blur-md bg-background/80 border-b border-border/50">
        <div className="px-6 py-3 flex items-center justify-between max-w-md mx-auto">
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
          <nav className="flex items-center gap-4 text-sm font-medium">
            <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors hidden sm:inline">Features</a>
            <a href="#faq" className="text-muted-foreground hover:text-foreground transition-colors hidden sm:inline">FAQ</a>
            <Link to="/auth" className="text-muted-foreground hover:text-foreground transition-colors">Sign in</Link>
          </nav>
        </div>
      </header>

      <main className="px-6 pb-16 max-w-md mx-auto">
        <section className="pt-10 pb-14">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground mb-5">
            <span className="flex -space-x-1.5">
              <span className="w-5 h-5 rounded-full bg-hero-gradient ring-2 ring-background" />
              <span className="w-5 h-5 rounded-full bg-primary/70 ring-2 ring-background" />
              <span className="w-5 h-5 rounded-full bg-primary/40 ring-2 ring-background" />
            </span>
            <span><span className="text-foreground font-semibold">12,000+</span> hitting their macros</span>
          </div>
          <h1 className="text-5xl font-bold leading-[1.05] tracking-tight">
            Eat this,<br />
            <span className="text-hero-gradient">get there.</span>
          </h1>
          <p className="mt-5 text-lg text-foreground/80 leading-relaxed">
            <span className="font-semibold text-foreground">No scale. No thinking.</span> Just grab your food and hit your goals.
          </p>
          <p className="mt-4 text-base text-muted-foreground leading-relaxed">
            Every item is pre-portioned by nature or by the manufacturer — 1 banana, 1 yogurt cup, 1 frozen meal. The label is the calorie count. You never weigh, measure, or guess.
          </p>
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold">
            ✅ Zero Thinking Required
          </div>
          <Link to="/auth" className="mt-8 block group">
            <Button className="w-full h-16 text-lg font-semibold rounded-2xl bg-hero-gradient text-white hover:opacity-95 shadow-xl shadow-primary/30">
              Get my free plan
              <ArrowRight className="w-5 h-5 ml-1 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </Link>
          <p className="mt-3 text-center text-xs text-muted-foreground">Free forever · No credit card · 60-second setup</p>
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

        <section id="features" className="mt-14 scroll-mt-20">
          <div className="mb-6">
            <div className="text-xs uppercase tracking-widest text-primary font-semibold">Features</div>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">Everything you need. Nothing you don't.</h2>
          </div>
          <div className="space-y-4">
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
          </div>
        </section>

        <section className="mt-14">
          <div className="mb-6">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary font-semibold">
              <Users className="w-3.5 h-3.5" /> Loved by people who actually hit their goals
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex">
                {[0,1,2,3,4].map(i => <Star key={i} className="w-4 h-4 fill-primary text-primary" />)}
              </div>
              <span className="text-sm font-semibold">4.9</span>
              <span className="text-sm text-muted-foreground">· 2,400+ reviews</span>
            </div>
          </div>
          <div className="space-y-4">
            {[
              { quote: "I finally stopped guessing. Down 14 lbs and I never touched a food scale.", name: "Maya R.", meta: "Lost 14 lbs in 10 weeks" },
              { quote: "Grocery run takes 20 minutes. Every meal already hits my protein. Game over.", name: "Derek L.", meta: "Lean bulk, +8 lbs muscle" },
              { quote: "The 'just grab 1' thing is genius. My brain doesn't have to do anything.", name: "Priya S.", meta: "Maintenance, 6 months strong" },
            ].map((t) => (
              <figure key={t.name} className="bg-card border border-border rounded-3xl p-5">
                <blockquote className="text-[15px] leading-relaxed text-foreground">"{t.quote}"</blockquote>
                <figcaption className="mt-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-hero-gradient grid place-items-center text-white font-semibold text-sm">
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.meta}</div>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section id="faq" className="mt-14 scroll-mt-20">
          <div className="mb-6">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary font-semibold">
              <HelpCircle className="w-3.5 h-3.5" /> FAQ
            </div>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">Questions, answered.</h2>
          </div>
          <div className="space-y-3">
            {[
              { q: "Do I have to cook?", a: "Nope. Every meal is grab-and-go or heat-and-eat. Microwave a frozen bowl, peel a banana, drink a shake — that's it." },
              { q: "Which stores work?", a: "Walmart, Target, Kroger, Costco, Sprouts, Aldi, Whole Foods, Safeway, Publix, H-E-B, Meijer, Wegmans, and Trader Joe's." },
              { q: "Is it really free?", a: "Yes. The plan, shopping list, and check-ins are free forever. Pro unlocks unlimited regenerations and the AI coach." },
              { q: "Will it fit my budget?", a: "Set a daily spend cap and we'll only pick items that stay under it. You'll see the total before you shop." },
              { q: "What if I have allergies?", a: "Tell us in onboarding — we filter every plan against your restrictions and never suggest items that break them." },
            ].map((item) => (
              <details key={item.q} className="group bg-card border border-border rounded-2xl px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex items-center justify-between cursor-pointer list-none">
                  <span className="font-semibold text-[15px] pr-4">{item.q}</span>
                  <span className="w-6 h-6 rounded-full bg-secondary grid place-items-center text-muted-foreground shrink-0 transition-transform group-open:rotate-45 text-lg leading-none">+</span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-14 rounded-3xl bg-hero-gradient p-8 text-white text-center">
          <h2 className="text-2xl font-bold tracking-tight">Ready to stop guessing?</h2>
          <p className="mt-2 text-sm opacity-90">Your first plan is 60 seconds away.</p>
          <Link to="/auth" className="mt-5 inline-block w-full">
            <Button className="w-full h-14 text-base font-semibold rounded-2xl bg-white text-primary hover:bg-white/95">
              Get my free plan
              <ArrowRight className="w-5 h-5 ml-1" />
            </Button>
          </Link>
        </section>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Premier Protein, Fairlife, Oikos, RXBAR, and 60+ packaged staples already in our catalog.
        </p>
      </main>
      <AddToHomeScreen />
    </div>
  );
}
