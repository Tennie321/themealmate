import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { getCoachState, sendCoachMessage } from "@/lib/coach.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, Sparkles, Lock, ArrowLeft } from "lucide-react";
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
            {premium && serverMsgs.length === 0 && optimistic.length === 0 && (
              <div className="text-sm text-muted-foreground bg-card border border-border rounded-2xl p-4">
                Ask me anything. Try:
                <ul className="mt-2 space-y-1">
                  {[
                    "Why am I missing my protein goal?",
                    "Cheapest way to add 30g protein today?",
                    "Make tomorrow's plan more savory.",
                  ].map((s) => (
                    <li key={s}>
                      <button
                        className="text-primary underline-offset-2 hover:underline text-left"
                        onClick={() => setDraft(s)}
                      >
                        “{s}”
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
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