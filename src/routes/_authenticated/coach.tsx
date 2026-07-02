import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { getCoachState, sendCoachMessage } from "@/lib/coach.functions";
import { getDashboard } from "@/lib/data.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, Sparkles, Lock, ArrowLeft, Coffee, Sandwich, UtensilsCrossed, Apple, Wand2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/coach")({
  component: Coach,
});

type Msg = { id?: string; role: "user" | "assistant"; body: string; pending?: boolean };

const SAMPLE: Msg[] = [
  {
    role: "assistant",
    body:
      "Hey! I'm your MealMate Coach. I can see your goals, your taste profile, and your last 7 days of check-ins — ask me anything about food, your plan, or hitting your targets.",
  },
  {
    role: "user",
    body: "I was 30g short on protein yesterday. What do I add today?",
  },
  {
    role: "assistant",
    body:
      "Easy fix — add a Fairlife Core Power (42g) with breakfast and swap your afternoon snack for a Premier Protein bar (20g). That's +62g protein, ~410 cal, and stays inside your daily budget. Want me to rebuild today's plan with that locked in?",
  },
];

function Bubble({ m }: { m: Msg }) {
  const isUser = m.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={
          isUser
            ? "max-w-[85%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-3.5 py-2.5 text-sm whitespace-pre-wrap"
            : "max-w-[90%] text-sm whitespace-pre-wrap text-foreground"
        }
      >
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            <Sparkles className="w-3 h-3" /> Coach
          </div>
        )}
        {m.body}
        {m.pending && (
          <span className="inline-flex ml-1 text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
          </span>
        )}
      </div>
    </div>
  );
}

function Coach() {
  const qc = useQueryClient();
  const state = useQuery({ queryKey: ["coach"], queryFn: () => getCoachState() });
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => getDashboard() });
  const [draft, setDraft] = useState("");
  const [optimistic, setOptimistic] = useState<Msg[]>([]);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const premium = state.data?.premium === true;
  const serverMsgs: Msg[] = (state.data?.messages ?? []).map((m: any) => ({
    id: m.id,
    role: m.role,
    body: m.body,
  }));
  const allMsgs: Msg[] = premium ? [...serverMsgs, ...optimistic] : SAMPLE;

  // Build context-aware suggestions from today's plan
  const plan: any = dash.data?.plan;
  const goals: any = dash.data?.goals;
  const items: any[] = plan?.plan_items ?? [];
  const eaten = items.filter((i) => i.consumed).reduce(
    (acc, i) => {
      const s = Number(i.servings ?? 1);
      acc.cal += Number(i.catalog_items?.calories ?? 0) * s;
      acc.pro += Number(i.catalog_items?.protein_g ?? 0) * s;
      return acc;
    },
    { cal: 0, pro: 0 },
  );
  const calLeft = Math.max(0, Math.round((goals?.calorie_target ?? 0) - eaten.cal));
  const proLeft = Math.max(0, Math.round((goals?.protein_target ?? 0) - eaten.pro));
  const emptySlots = ["breakfast", "lunch", "dinner", "snack"].filter(
    (slot) => !items.some((i) => i.meal_slot === slot),
  );

  const dailySuggestions: string[] = [];
  if (proLeft > 20) dailySuggestions.push(`I still need ${proLeft}g protein and ${calLeft} cal today — what should I grab?`);
  if (emptySlots.length > 0) dailySuggestions.push(`Suggest a ${emptySlots[0]} that fits my macros.`);
  if (items.length === 0) dailySuggestions.push("Build me a simple day of grab-and-go meals.");
  dailySuggestions.push("What's one swap that would improve today's plan?");

  const mealChips: Array<{ slot: string; label: string; Icon: any }> = [
    { slot: "breakfast", label: "Breakfast", Icon: Coffee },
    { slot: "lunch", label: "Lunch", Icon: Sandwich },
    { slot: "dinner", label: "Dinner", Icon: UtensilsCrossed },
    { slot: "snack", label: "Snack", Icon: Apple },
  ];

  function prefill(text: string) {
    setDraft(text);
  }

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [allMsgs.length, optimistic]);

  const send = useMutation({
    mutationFn: (body: string) => sendCoachMessage({ data: { body } } as any),
    onSuccess: () => {
      setOptimistic([]);
      qc.invalidateQueries({ queryKey: ["coach"] });
    },
    onError: (e: any) => {
      setOptimistic((prev) => prev.filter((m) => m.role !== "assistant" || !m.pending));
      toast.error(e?.message ?? "Couldn't reach the coach");
    },
  });

  function submit() {
    const body = draft.trim();
    if (!body || send.isPending) return;
    setDraft("");
    setOptimistic((prev) => [
      ...prev,
      { role: "user", body },
      { role: "assistant", body: "Thinking…", pending: true },
    ]);
    send.mutate(body);
  }

  return (
    <div className="max-w-md mx-auto px-5 pt-6 pb-32 flex flex-col min-h-[calc(100vh-4rem)]">
      <header className="flex items-center gap-3">
        <Link to="/dashboard" className="text-muted-foreground"><ArrowLeft className="w-5 h-5" /></Link>
        <div className="flex-1">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Premium</p>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            AI Coach <Sparkles className="w-5 h-5 text-primary" />
          </h1>
        </div>
      </header>

      {state.isLoading ? (
        <div className="flex-1 grid place-items-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <>
          <div ref={scrollerRef} className="mt-4 flex-1 overflow-y-auto space-y-4 pr-1">
            {premium && (
              <>
                {/* Today's context strip */}
                {plan && (
                  <div className="rounded-2xl bg-secondary/60 p-3 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Today so far</div>
                      <div className="text-sm font-semibold mt-0.5">
                        {Math.round(eaten.cal)} / {goals?.calorie_target ?? 0} cal · {Math.round(eaten.pro)}g protein
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Left</div>
                      <div className="text-sm font-semibold mt-0.5">{calLeft} cal · {proLeft}g P</div>
                    </div>
                  </div>
                )}

                {/* Daily meal suggestions */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2 text-[11px] uppercase tracking-widest text-muted-foreground">
                    <Sparkles className="w-3 h-3" /> Today's suggestions
                  </div>
                  <div className="space-y-2">
                    {dailySuggestions.slice(0, 3).map((s) => (
                      <button
                        key={s}
                        onClick={() => prefill(s)}
                        className="w-full text-left rounded-2xl bg-card border border-border px-3.5 py-2.5 text-sm hover:border-primary/40 transition"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Meal type quick chips */}
                <div>
                  <div className="mb-2 text-[11px] uppercase tracking-widest text-muted-foreground">Ask about a meal</div>
                  <div className="flex flex-wrap gap-2">
                    {mealChips.map(({ slot, label, Icon }) => (
                      <button
                        key={slot}
                        onClick={() => prefill(`Give me 3 ${slot} ideas that hit my macros.`)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-secondary hover:bg-secondary/80 px-3 py-1.5 text-xs font-medium"
                      >
                        <Icon className="w-3.5 h-3.5" /> {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Personalization prompts */}
                <div className="rounded-2xl border border-border p-3.5">
                  <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
                    <Wand2 className="w-3 h-3" /> Personalize
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Answer one so Coach can tailor recommendations.
                  </p>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {[
                      "I want more variety at breakfast — suggest 5 new options.",
                      "I hate cooking after work — plan easy dinners.",
                      "I'm training hard this week — bump my protein strategy.",
                    ].map((s) => (
                      <button
                        key={s}
                        onClick={() => prefill(s)}
                        className="text-left text-sm text-primary underline-offset-2 hover:underline"
                      >
                        “{s}”
                      </button>
                    ))}
                    <Link to="/onboarding" className="text-left text-sm text-primary underline-offset-2 hover:underline">
                      Update taste profile →
                    </Link>
                  </div>
                </div>
              </>
            )}
            {allMsgs.map((m, i) => <Bubble key={m.id ?? `o-${i}`} m={m} />)}

            {!premium && (
              <div className="mt-6 rounded-3xl bg-hero-gradient text-white p-5 text-center">
                <div className="w-12 h-12 rounded-2xl bg-white/15 grid place-items-center mx-auto mb-3">
                  <Lock className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-lg">Unlock the AI Coach</h3>
                <p className="text-sm text-white/90 mt-1">
                  Personalized advice grounded in your goals, taste profile, and last 7 days of check-ins.
                </p>
                <Button asChild className="mt-4 bg-white text-primary hover:bg-white/90 rounded-2xl w-full h-12 font-semibold">
                  <Link to="/upgrade">See Premium plans</Link>
                </Button>
              </div>
            )}
          </div>

          {premium && (
            <div className="fixed bottom-20 left-0 right-0 px-5">
              <div className="max-w-md mx-auto flex items-end gap-2 bg-card border border-border rounded-3xl p-2 shadow-lg">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Ask your coach…"
                  rows={1}
                  className="resize-none border-0 focus-visible:ring-0 min-h-[40px] max-h-32 bg-transparent"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                />
                <Button
                  size="icon"
                  onClick={submit}
                  disabled={!draft.trim() || send.isPending}
                  className="rounded-2xl h-10 w-10 shrink-0"
                >
                  {send.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}