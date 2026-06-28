import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sun, Coffee, Sun as Lunch, Moon, Cookie, Droplets, Sparkles } from "lucide-react";
import { FoodImage } from "@/components/FoodImage";

const ICONS: Record<string, any> = {
  breakfast: Coffee,
  lunch: Lunch,
  dinner: Moon,
  snack: Cookie,
  drink: Droplets,
};
const LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
  drink: "Drinks",
};

export function MorningBriefing({
  open,
  onClose,
  items,
  calTarget,
  proTarget,
  budgetCents,
  spentCents,
  times,
}: {
  open: boolean;
  onClose: () => void;
  items: any[];
  calTarget: number;
  proTarget: number;
  budgetCents: number;
  spentCents: number;
  times: Record<string, string>;
}) {
  const sections = ["breakfast", "lunch", "dinner", "snack", "drink"] as const;
  const totals = items.reduce(
    (acc, it) => {
      const ci = it.catalog_items ?? {};
      const s = Number(it.servings ?? 1);
      acc.cal += Number(ci.calories ?? 0) * s;
      acc.pro += Number(ci.protein_g ?? 0) * s;
      return acc;
    },
    { cal: 0, pro: 0 },
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <div className="w-12 h-12 rounded-2xl bg-secondary grid place-items-center text-primary mb-2">
            <Sun className="w-6 h-6" />
          </div>
          <DialogTitle className="text-2xl">Good morning</DialogTitle>
          <DialogDescription>Here's your day. Eat this, get there.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 mt-2">
          <div className="bg-secondary rounded-2xl p-3">
            <div className="text-xs text-muted-foreground">Today's target</div>
            <div className="font-bold text-lg">{calTarget} cal</div>
            <div className="text-xs text-muted-foreground">{proTarget}g protein</div>
          </div>
          <div className="bg-secondary rounded-2xl p-3">
            <div className="text-xs text-muted-foreground">Planned</div>
            <div className="font-bold text-lg">{Math.round(totals.cal)} cal</div>
            <div className="text-xs text-muted-foreground">{Math.round(totals.pro)}g protein</div>
          </div>
        </div>

        <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
          {sections.map((sec) => {
            const list = items.filter((i) => i.meal_slot === sec);
            if (list.length === 0) return null;
            const Icon = ICONS[sec];
            return (
              <div key={sec} className="flex gap-3 items-start border border-border rounded-2xl p-3">
                <div className="w-8 h-8 rounded-full bg-secondary grid place-items-center text-primary shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="font-semibold text-sm">{LABELS[sec]}</div>
                    <div className="text-[11px] text-muted-foreground">{times[sec] ?? ""}</div>
                  </div>
                  <ul className="text-xs text-muted-foreground mt-0.5">
                    {list.map((it) => (
                      <li key={it.id} className="flex items-center gap-2 mt-1">
                        <FoodImage
                          name={it.catalog_items?.name}
                          category={it.catalog_items?.category}
                          imageUrl={it.catalog_items?.image_url}
                          size="sm"
                        />
                        <span className="truncate">{it.catalog_items?.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
          {items.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-4 flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4" /> No plan yet — build one after this.
            </div>
          )}
        </div>

        <div className="text-xs text-muted-foreground mt-2">
          Budget: ${(spentCents / 100).toFixed(2)} of ${(budgetCents / 100).toFixed(2)}
        </div>

        <Button onClick={onClose} className="w-full mt-3 h-12 rounded-2xl font-semibold">
          Let's go
        </Button>
      </DialogContent>
    </Dialog>
  );
}