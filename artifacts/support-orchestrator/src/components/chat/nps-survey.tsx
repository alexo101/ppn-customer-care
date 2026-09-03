import { Button } from "@/components/ui/button";

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export function NpsSurvey({
  disabled,
  submitted,
  onSubmit,
}: {
  disabled?: boolean;
  submitted?: boolean;
  onSubmit: (score: number) => void;
}) {
  if (submitted) {
    return (
      <div className="rounded-xl border border-border bg-background px-3 py-3">
        <p className="text-sm text-foreground">Thanks for your feedback.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-background px-3 py-3 space-y-2">
      <p className="text-sm text-foreground">
        How would you rate the help provided?
      </p>
      <div className="flex flex-wrap gap-1.5">
        {SCORES.map((score) => (
          <Button
            key={score}
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={disabled}
            onClick={() => onSubmit(score)}
            aria-label={`Rate ${score} out of 10`}
          >
            {score}
          </Button>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>1 — not helpful</span>
        <span>10 — very helpful</span>
      </div>
    </div>
  );
}
