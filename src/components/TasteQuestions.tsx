import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { generateTasteQuestions, saveTasteProfile } from "@/lib/taste.functions";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Check } from "lucide-react";
import { toast } from "sonner";

type Q = { id: string; question: string; options: string[] };

export function TasteQuestions({
  initial,
  onSaved,
  ctaLabel = "Save",
}: {
  initial?: { id: string; question: string; answer: string }[];
  onSaved?: () => void;
  ctaLabel?: string;
}) {
  const q = useQuery({
    queryKey: ["taste-questions"],
    queryFn: () => generateTasteQuestions(),
    staleTime: 1000 * 60 * 60,
  });
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initial?.length) {
      const map: Record<string, string> = {};
      initial.forEach((a) => (map[a.id] = a.answer));
      setAnswers(map);
    }
  }, [initial]);

  const save = useMutation({
    mutationFn: (payload: { id: string; question: string; answer: string }[]) =>
      saveTasteProfile({ data: { answers: payload } } as any),
    onSuccess: () => {
      toast.success("Saved — the planner will use this");
      onSaved?.();
    },
  });

  const questions: Q[] = (q.data as any)?.questions ?? [];

  if (q.isLoading) {
    return (
      <div className="py-8 grid place-items-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <p className="text-xs mt-2">Generating taste questions…</p>
      </div>
    );
  }

  const handleSave = () => {
    const payload = questions
      .filter((qq) => answers[qq.id])
      .map((qq) => ({ id: qq.id, question: qq.question, answer: answers[qq.id] }));
    if (payload.length === 0) {
      toast.error("Pick at least one answer");
      return;
    }
    save.mutate(payload);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          AI-generated to learn your taste. The planner will use these answers.
        </p>
        <button
          type="button"
          onClick={() => q.refetch()}
          className="text-xs flex items-center gap-1 text-primary"
        >
          <RefreshCw className="w-3 h-3" /> New
        </button>
      </div>

      {questions.map((qq) => (
        <div key={qq.id}>
          <div className="text-sm font-semibold mb-2">{qq.question}</div>
          <div className="flex flex-wrap gap-2">
            {qq.options.map((opt) => {
              const active = answers[qq.id] === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setAnswers((p) => ({ ...p, [qq.id]: opt }))}
                  className={`px-3 py-2 rounded-full text-sm border-2 ${active ? "border-primary bg-primary text-white" : "border-border bg-card"}`}
                >
                  {active && <Check className="w-3 h-3 inline mr-1" />}
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <Button onClick={handleSave} disabled={save.isPending} className="w-full h-12 rounded-2xl">
        {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : ctaLabel}
      </Button>
    </div>
  );
}