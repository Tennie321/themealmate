import { useQuery } from "@tanstack/react-query";
import { getTasteInsights } from "@/lib/taste.functions";
import { Heart, Ban, Globe2, Loader2 } from "lucide-react";

export function TasteInsights() {
  const q = useQuery({ queryKey: ["taste-insights"], queryFn: () => getTasteInsights() });

  if (q.isLoading) {
    return (
      <div className="grid place-items-center py-8 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    );
  }
  const d = q.data;
  if (!d) return null;
  const empty = (d.loves?.length ?? 0) === 0 && (d.avoids?.length ?? 0) === 0 && (d.cuisineRanking?.length ?? 0) === 0;

  if (empty) {
    return (
      <p className="text-xs text-muted-foreground">
        We'll learn what you love as you favorite meals, swap items, and check off what you ate. Come back after a few days of plans.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {d.loves?.length > 0 && (
        <Section icon={<Heart className="w-3.5 h-3.5" />} title="You love">
          <div className="flex flex-wrap gap-1.5">
            {d.loves.map((x: any, i: number) => (
              <span key={i} className="px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground text-xs">
                {x.brand ? `${x.brand} ` : ""}{x.name}
              </span>
            ))}
          </div>
        </Section>
      )}
      {d.avoids?.length > 0 && (
        <Section icon={<Ban className="w-3.5 h-3.5" />} title="You avoid">
          <div className="flex flex-wrap gap-1.5">
            {d.avoids.map((x: any, i: number) => (
              <span key={i} className="px-2.5 py-1 rounded-full border border-border text-xs text-muted-foreground line-through">
                {x.brand ? `${x.brand} ` : ""}{x.name}
              </span>
            ))}
          </div>
        </Section>
      )}
      {d.cuisineRanking?.length > 0 && (
        <Section icon={<Globe2 className="w-3.5 h-3.5" />} title="Cuisine ranking">
          <ol className="space-y-1">
            {d.cuisineRanking.slice(0, 5).map((c: any, i: number) => (
              <li key={c.name} className="flex items-center justify-between text-sm">
                <span><span className="text-muted-foreground mr-2">{i + 1}.</span>{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.score} pts</span>
              </li>
            ))}
          </ol>
        </Section>
      )}
      <p className="text-[11px] text-muted-foreground pt-1">Based on {d.totalSignals} taste signal{d.totalSignals === 1 ? "" : "s"}. Keep swapping and favoriting to sharpen it.</p>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-primary mb-2">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}