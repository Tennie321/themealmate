import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { getDashboard } from "@/lib/data.functions";
import { ShareCard } from "@/components/ShareCard";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Share2, Send, Loader2 } from "lucide-react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createPost } from "@/lib/community.functions";
import { usePremiumCheck } from "@/hooks/usePremiumCheck";

export const Route = createFileRoute("/_authenticated/share")({
  component: ShareDay,
});

function ShareDay() {
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => getDashboard() });
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"download" | "share" | "post" | null>(null);
  const premium = usePremiumCheck();
  const canExport = premium.has("share_card_export");
  const canPost = premium.has("community_posting");

  if (dash.isLoading) {
    return <div className="p-6 grid place-items-center h-[60vh]"><Loader2 className="animate-spin" /></div>;
  }

  const goals: any = dash.data?.goals ?? {};
  const plan: any = dash.data?.plan;
  const profile: any = dash.data?.profile;
  const items: any[] = plan?.plan_items ?? [];

  const eaten = items.reduce(
    (acc, it) => {
      const ci = it.catalog_items ?? {};
      const s = Number(it.servings ?? 1);
      if (it.consumed) {
        acc.cal += Number(ci.calories ?? 0) * s;
        acc.pro += Number(ci.protein_g ?? 0) * s;
      }
      return acc;
    },
    { cal: 0, pro: 0 },
  );

  const meals = items
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((it) => {
      const ci = it.catalog_items ?? {};
      const s = Number(it.servings ?? 1);
      return {
        slot: it.meal_slot,
        name: ci.name ?? "",
        cal: Number(ci.calories ?? 0) * s,
        pro: Number(ci.protein_g ?? 0) * s,
      };
    });

  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  const displayName = profile?.display_name ?? "My";

  async function renderPng(): Promise<Blob> {
    if (!cardRef.current) throw new Error("Card not ready");
    const dataUrl = await toPng(cardRef.current, { pixelRatio: 1, cacheBust: true });
    const res = await fetch(dataUrl);
    return await res.blob();
  }

  async function downloadPng() {
    if (!canExport) { premium.showUpsell("share_card_export"); return; }
    try {
      setBusy("download");
      const blob = await renderPng();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mealmate-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't render card");
    } finally { setBusy(null); }
  }

  async function nativeShare() {
    if (!canExport) { premium.showUpsell("share_card_export"); return; }
    try {
      setBusy("share");
      const blob = await renderPng();
      const file = new File([blob], "mealmate.png", { type: "image/png" });
      // @ts-ignore
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await (navigator as any).share({ files: [file], title: "My MealMate day", text: "Eat this, get there." });
      } else {
        await downloadPng();
        toast.message("Saved to device — share from your camera roll");
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") toast.error(e.message ?? "Share failed");
    } finally { setBusy(null); }
  }

  async function postToFeed() {
    if (!canPost) { premium.showUpsell("community_posting"); return; }
    try {
      setBusy("post");
      const blob = await renderPng();
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Not signed in");
      const path = `${uid}/share-${Date.now()}.png`;
      const { error: upErr } = await supabase.storage.from("post-images").upload(path, blob, {
        contentType: "image/png", upsert: false,
      });
      if (upErr) throw upErr;
      await createPost({ data: {
        kind: "share",
        body: `${dateLabel} — hit ${Math.round(eaten.cal)} cal / ${Math.round(eaten.pro)}g protein.`,
        image_path: path,
        meta: { cal: Math.round(eaten.cal), pro: Math.round(eaten.pro) },
      } } as any);
      toast.success("Posted to feed");
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't post");
    } finally { setBusy(null); }
  }

  return (
    <div className="max-w-md mx-auto px-5 pt-6">
      <header className="flex items-center gap-3">
        <Link to="/dashboard" className="text-muted-foreground"><ArrowLeft className="w-5 h-5" /></Link>
        <div>
          <h1 className="text-xl font-bold">Share my day</h1>
          <p className="text-xs text-muted-foreground">Beautiful 9:16 card for stories & posts</p>
        </div>
      </header>

      <div className="mt-5 rounded-3xl overflow-hidden border border-border bg-card">
        <div className="aspect-[9/16] bg-black/5 overflow-hidden">
          {/* Scaled preview of the high-res off-screen card */}
          <div className="origin-top-left relative" style={{ transform: "scale(0.31)", width: 1080, height: 1920 }}>
            <ShareCard
              ref={cardRef}
              dateLabel={dateLabel}
              displayName={displayName}
              calEaten={eaten.cal}
              calTarget={goals.calorie_target ?? 0}
              proEaten={eaten.pro}
              proTarget={goals.protein_target ?? 0}
              meals={meals}
            />
            {!canExport && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="rotate-[-20deg] text-white/70 font-black tracking-widest" style={{ fontSize: 140 }}>
                  MEALMATE PREVIEW
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {!canExport && (
        <div className="mt-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm p-3 flex items-center justify-between">
          <span>Free preview is watermarked.</span>
          <Link to="/upgrade" className="font-semibold underline">Upgrade</Link>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-3">
        <Button onClick={nativeShare} disabled={!!busy} className="h-12 rounded-2xl font-semibold">
          {busy === "share" ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Share2 className="w-4 h-4 mr-2" /> Share to Instagram / TikTok</>}
        </Button>
        <Button onClick={downloadPng} disabled={!!busy} variant="outline" className="h-12 rounded-2xl">
          {busy === "download" ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Download className="w-4 h-4 mr-2" /> Save as PNG</>}
        </Button>
        <Button onClick={postToFeed} disabled={!!busy} variant="secondary" className="h-12 rounded-2xl">
          {busy === "post" ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4 mr-2" /> Post to MealMate feed</>}
        </Button>
      </div>

      {!plan && (
        <p className="mt-6 text-sm text-muted-foreground text-center">
          Build today's plan first to fill the card.
        </p>
      )}
    </div>
  );
}