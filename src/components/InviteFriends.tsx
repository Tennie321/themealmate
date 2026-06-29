import { useQuery } from "@tanstack/react-query";
import { getReferralStats } from "@/lib/referrals.functions";
import { Button } from "@/components/ui/button";
import { Gift, Share2, Copy, Sparkles } from "lucide-react";
import { toast } from "sonner";

function origin() {
  if (typeof window !== "undefined") return window.location.origin;
  return "https://themealmate.lovable.app";
}

export function InviteFriends() {
  const q = useQuery({ queryKey: ["referrals"], queryFn: () => getReferralStats() });
  const stats = q.data;
  const link = stats ? `${origin()}/?ref=${stats.user_id}` : "";
  const message = stats
    ? `I've been using MealMate — it tells me exactly what to grab from the grocery store to hit my calories and protein. Try it free: ${link}`
    : "";

  async function share() {
    if (!link) return;
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ title: "MealMate", text: message, url: link });
        return;
      } catch {/* user cancelled */}
    }
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Invite link copied");
    } catch {
      toast.error("Couldn't copy — long-press to copy the link.");
    }
  }

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    toast.success("Link copied");
  }

  function smsHref() {
    return `sms:&body=${encodeURIComponent(message)}`;
  }

  return (
    <div className="bg-card border border-border rounded-3xl p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-hero-gradient text-white grid place-items-center shrink-0">
          <Gift className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="font-semibold">Invite friends, get free Premium</div>
          <p className="text-xs text-muted-foreground mt-1">
            Each friend who builds their first plan unlocks {stats?.reward_days_per_invite ?? 7} free days of MealMate Premium for you.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="Joined" value={stats?.signed_up ?? 0} />
        <Stat label="Built a plan" value={stats?.converted ?? 0} />
        <Stat
          label="Premium"
          value={
            stats?.is_premium && stats.premium_until
              ? new Date(stats.premium_until).toLocaleDateString(undefined, { month: "short", day: "numeric" })
              : "—"
          }
          highlight={!!stats?.is_premium}
        />
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-border bg-secondary/40 px-3 py-2 text-xs">
        <span className="truncate flex-1 font-mono">{link || "Loading…"}</span>
        <button onClick={copy} disabled={!link} className="text-muted-foreground hover:text-foreground">
          <Copy className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button onClick={share} disabled={!link} className="h-11 rounded-2xl bg-hero-gradient text-white">
          <Share2 className="w-4 h-4 mr-1.5" /> Share invite
        </Button>
        <a href={smsHref()}>
          <Button variant="outline" disabled={!link} className="w-full h-11 rounded-2xl">
            <Sparkles className="w-4 h-4 mr-1.5" /> Text a friend
          </Button>
        </a>
      </div>

      {(stats?.signed_up ?? 0) > 0 && (
        <p className="mt-3 text-xs text-muted-foreground text-center">
          {stats!.signed_up} friend{stats!.signed_up === 1 ? "" : "s"} joined
          {stats!.converted > 0 ? `, ${stats!.converted} started a plan` : ""}.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl py-2.5 ${highlight ? "bg-secondary" : "bg-secondary/50"}`}>
      <div className={`text-lg font-bold ${highlight ? "text-primary" : ""}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}