import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getFavorites } from "@/lib/data.functions";
import { toggleFavorite } from "@/lib/meal-plan.functions";
import { Loader2, Heart } from "lucide-react";

export const Route = createFileRoute("/_authenticated/favorites")({
  component: FavoritesPage,
});

function fmt(c: number) { return `$${(c/100).toFixed(2)}`; }

function FavoritesPage() {
  const qc = useQueryClient();
  const fav = useQuery({ queryKey: ["favorites"], queryFn: () => getFavorites() });
  const remove = useMutation({
    mutationFn: (id: string) => toggleFavorite({ data: { catalogItemId: id, favorite: false } } as any),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["favorites"] }),
  });

  if (fav.isLoading) return <div className="p-10 grid place-items-center"><Loader2 className="animate-spin" /></div>;

  const items = fav.data?.items ?? [];

  return (
    <div className="max-w-md mx-auto px-5 pt-8">
      <h1 className="text-2xl font-bold">Favorites</h1>
      <p className="text-muted-foreground text-sm mt-1">MealMate will weight these when planning.</p>

      {items.length === 0 && (
        <div className="mt-12 text-center">
          <Heart className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="mt-3 text-muted-foreground text-sm">Tap the heart on any meal item to save it here.</p>
        </div>
      )}

      <div className="mt-6 space-y-2">
        {items.map((it: any) => (
          <div key={it.id} className="bg-card border border-border rounded-2xl p-4 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium">{it.name}</div>
              <div className="text-xs text-muted-foreground">{it.brand ?? ""} · {it.calories} kcal · {it.protein_g}g protein · {fmt(it.price_cents)}</div>
            </div>
            <button onClick={() => remove.mutate(it.id)} className="text-destructive">
              <Heart className="w-5 h-5 fill-current" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}