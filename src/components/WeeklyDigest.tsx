import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWeeklyDigest, markDigestShown } from "@/lib/digest.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, TrendingUp, TrendingDown, Trophy, Wallet, X } from "lucide-react";

function GradePill({ grade, pct }: { grade: string; pct: number }) {
  const color =
    grade === "A" ? "bg-emerald-500" :
    grade === "B" ? "bg-emerald-400" :
    grade === "C" ? "bg-amber-500" :
    grade === "D" ? "bg-orange-500" : "bg-rose-500";
  return (
    <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-white text-xs font-semibold ${color}`}>
      <Trophy className="h-3.5 w-3.5" /> Adherence {grade} · {pct}%
    </div>
  );
}

function DigestBody({ d }: { d: NonNullable<ReturnType<typeof useDigest>["data"]> }) {
  const proteinDelta = d.proteinHitsThisWeek - d.proteinHitsLastWeek;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <GradePill grade={d.grade} pct={d.adherencePct} />
        <span className="text-xs text-muted-foreground">{d.daysLogged}/7 days logged</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {proteinDelta >= 0 ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> : <TrendingDown className="h-3.5 w-3.5 text-rose-500" />}
            Protein goal
          </div>
          <div className="mt-1 text-lg font-bold">{d.proteinHitsThisWeek}/7 days</div>
          <div className="text-[11px] text-muted-foreground">
            {proteinDelta === 0 ? `same as last week (${d.proteinHitsLastWeek}/7)` :
             proteinDelta > 0 ? `up from ${d.proteinHitsLastWeek}/7 last week` :
             `down from ${d.proteinHitsLastWeek}/7 last week`}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" /> Spent
          </div>
          <div className="mt-1 text-lg font-bold">${(d.spendCents / 100).toFixed(2)}</div>
          <div className="text-[11px] text-muted-foreground">
            {d.weightDeltaKg === null
              ? "Log weight to track changes"
              : `Weight ${d.weightDeltaKg > 0 ? "+" : ""}${d.weightDeltaKg} kg this week`}
          </div>
        </div>
      </div>

      {d.topItem && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3">
          {d.topItem.image_url ? (
            <img src={d.topItem.image_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
          ) : (
            <div className="h-10 w-10 rounded-lg bg-muted" />
          )}
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Most-eaten</div>
            <div className="truncate text-sm font-semibold">
              {d.topItem.brand ? `${d.topItem.brand} ` : ""}{d.topItem.name}
            </div>
            <div className="text-[11px] text-muted-foreground">×{d.topItem.count} this week</div>
          </div>
        </div>
      )}

      <div className="rounded-xl bg-primary/10 p-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
          <Sparkles className="h-3.5 w-3.5" /> Try this week
        </div>
        <p className="mt-1 text-sm leading-snug">{d.suggestion}</p>
      </div>
    </div>
  );
}

function useDigest() {
  const fn = useServerFn(getWeeklyDigest);
  return useQuery({ queryKey: ["weekly-digest"], queryFn: () => fn(), staleTime: 60_000 });
}

/** Modal: shown on Mondays if not already shown today. */
export function WeeklyDigestModal() {
  const { data, isLoading } = useDigest();
  const qc = useQueryClient();
  const markFn = useServerFn(markDigestShown);
  const mark = useMutation({
    mutationFn: () => markFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["weekly-digest"] }),
  });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!data || isLoading) return;
    if (data.isMonday && !data.alreadyShownToday) setOpen(true);
  }, [data, isLoading]);

  function dismiss() {
    setOpen(false);
    mark.mutate();
  }

  if (!data) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) dismiss(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Your week in review</DialogTitle>
        </DialogHeader>
        <DigestBody d={data} />
        <DialogFooter>
          <Button onClick={dismiss} className="w-full">Let's go</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Card: rendered at the top of the feed on Mondays. */
export function WeeklyDigestCard() {
  const { data } = useDigest();
  const [dismissed, setDismissed] = useState(false);
  if (!data || !data.isMonday || dismissed) return null;

  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-primary font-semibold">Monday recap</div>
          <h3 className="text-base font-bold">Your week in review</h3>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="-mr-1 -mt-1 rounded-full p-1 text-muted-foreground hover:bg-muted"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <DigestBody d={data} />
    </div>
  );
}