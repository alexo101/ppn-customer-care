import { Button } from "@/components/ui/button";
import { agentLanguageCopy, normalizeAgentLanguage, type AgentLanguage } from "@/lib/agent-language";

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export function NpsSurvey({
  disabled,
  submitted,
  onSubmit,
  language = "en",
}: {
  disabled?: boolean;
  submitted?: boolean;
  onSubmit: (score: number) => void;
  language?: AgentLanguage;
}) {
  const selectedLanguage = normalizeAgentLanguage(language);
  if (submitted) {
    return (
      <div className="rounded-xl border border-border bg-background px-3 py-3">
        <p className="text-sm text-foreground">{agentLanguageCopy(selectedLanguage, "npsThanks")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-background px-3 py-3 space-y-2">
      <p className="text-sm text-foreground">
        {agentLanguageCopy(selectedLanguage, "npsQuestion")}
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
            aria-label={agentLanguageCopy(selectedLanguage, "rateOutOfTen").replace("{score}", String(score))}
          >
            {score}
          </Button>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{agentLanguageCopy(selectedLanguage, "npsLow")}</span>
        <span>{agentLanguageCopy(selectedLanguage, "npsHigh")}</span>
      </div>
    </div>
  );
}
