import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getShoppingList } from "@/lib/data.functions";
import { toggleListItem, markOutOfStock, substituteListItem } from "@/lib/meal-plan.functions";
import { Loader2, Check, Package, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { FoodImage } from "@/components/FoodImage";
import { ShoppingSkeleton } from "@/components/skeletons";

export const Route = createFileRoute("/_authenticated/shopping")({
  component: ShoppingPage,
});

function fmt(c: number) { return `$${(c/100).toFixed(2)}`; }

function ShoppingPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["shopping"], queryFn: () => getShoppingList() });
  const [oosTarget, setOosTarget] = useState<any>(null);
  const [alternates, setAlternates] = useState<any[]>([]);
  const [loadingAlts, setLoadingAlts] = useState(false);

  const toggle = useMutation({
    mutationFn: (v: { listItemId: string; checked: boolean }) => toggleListItem({ data: v } as any),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shopping"] }),
  });

  async function handleOos(item: any) {
    setOosTarget(item);
    setLoadingAlts(true);
    try {
      const r: any = await markOutOfStock({ data: { listItemId: item.id } } as any);
      setAlternates(r.alternates ?? []);
    } finally { setLoadingAlts(false); }
  }

  async function sub(replacementId: string) {
    try {
      await substituteListItem({ data: { listItemId: oosTarget.id, replacementId } } as any);
      toast.success("Substituted");
      setOosTarget(null);
      qc.invalidateQueries({ queryKey: ["shopping"] });
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
  }

  if (list.isLoading) return <ShoppingSkeleton />;

  const items = list.data?.items ?? [];
  const grouped: Record<string, any[]> = {};
  for (const it of items) {
    const ci = it.substituted ?? it.catalog_items;
    const aisle = ci?.aisle ?? "Other";
    (grouped[aisle] ??= []).push(it);
  }
  const total = list.data?.total_cents ?? 0;

  return (
    <div className="max-w-md mx-auto px-5 pt-8">
      <h1 className="text-2xl font-bold">Shopping list</h1>
      <p className="text-muted-foreground text-sm mt-1">By aisle. Tap to check off. Tap "Out of stock" for swaps.</p>

      <div className="mt-4 bg-card border border-border rounded-2xl p-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Estimated total</div>
          <div className="text-2xl font-bold">{fmt(total)}</div>
        </div>
        <Package className="w-8 h-8 text-primary" />
      </div>

      {items.length === 0 && (
        <div className="mt-10 flex flex-col items-center text-center px-6">
          <div className="w-14 h-14 rounded-full bg-secondary grid place-items-center mb-3">
            <Package className="w-7 h-7 text-primary" />
          </div>
          <h3 className="font-bold">No shopping list yet</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Build today's plan and we'll organize everything by aisle with prices.
          </p>
          <Button asChild>
            <Link to="/dashboard">
              <Sparkles className="w-4 h-4 mr-1.5" /> Build today's plan
            </Link>
          </Button>
        </div>
      )}

      <div className="mt-6 space-y-5">
        {Object.entries(grouped).map(([aisle, list]) => (
          <div key={aisle}>
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{aisle}</h2>
            <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
              {list.map((it: any) => {
                const ci = it.substituted ?? it.catalog_items;
                return (
                  <div key={it.id} className="px-4 py-3 flex items-start gap-3">
                    <button
                      onClick={() => toggle.mutate({ listItemId: it.id, checked: !it.checked })}
                      className={`mt-0.5 w-6 h-6 rounded-full border-2 grid place-items-center shrink-0 ${it.checked ? "bg-primary border-primary text-white" : "border-border"}`}
                    >
                      {it.checked && <Check className="w-3.5 h-3.5" />}
                    </button>
                    <FoodImage name={ci?.name} category={ci?.category} imageUrl={ci?.image_url} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium ${it.checked ? "line-through text-muted-foreground" : ""}`}>{ci?.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {ci?.brand ? `${ci.brand} · ` : ""}qty {it.qty} · {fmt(Number(ci?.price_cents ?? 0) * Number(it.qty))}
                      </div>
                      {it.substituted && <div className="text-[11px] text-primary mt-0.5">Substituted</div>}
                      <button onClick={() => handleOos(it)} className="text-[11px] text-muted-foreground underline mt-1">Out of stock</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <Sheet open={!!oosTarget} onOpenChange={(o) => !o && setOosTarget(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[80vh] overflow-y-auto">
          <SheetHeader><SheetTitle>Pick a replacement</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-2">
            {loadingAlts && <div className="grid place-items-center py-10"><Loader2 className="animate-spin" /></div>}
            {alternates.map((alt) => (
              <button key={alt.id} onClick={() => sub(alt.id)} className="w-full text-left px-4 py-3 rounded-2xl border border-border hover:border-primary flex items-start gap-3">
                <FoodImage name={alt.name} category={alt.category} imageUrl={alt.image_url} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{alt.name}</div>
                  <div className="text-xs text-muted-foreground">{alt.brand ?? ""} · {alt.calories} cal · {alt.protein_g}g protein · {fmt(alt.price_cents)}</div>
                </div>
              </button>
            ))}
            {!loadingAlts && alternates.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No alternates.</p>}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}