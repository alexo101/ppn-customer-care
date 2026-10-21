import { ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { agentLanguageCopy } from "@/lib/agent-language";

type ConversationRatingValue = "positive" | "negative" | null;

export function ConversationRatingPrompt({
  language,
  rating,
  submitted = false,
  disabled = false,
  onSubmit,
}: {
  language: unknown;
  rating: ConversationRatingValue;
  submitted?: boolean;
  disabled?: boolean;
  onSubmit: (rating: Exclude<ConversationRatingValue, null>) => void;
}) {
  const hasRated = submitted || rating !== null;
  return (
    <div
      className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
      role="group"
      aria-label={agentLanguageCopy(language, "conversationRatingQuestion")}
    >
      <span>
        {hasRated
          ? agentLanguageCopy(language, "conversationRatingThanks")
          : agentLanguageCopy(language, "conversationRatingQuestion")}
      </span>
      {!hasRated && (
        <>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={disabled}
            onClick={() => onSubmit("positive")}
            aria-label={agentLanguageCopy(language, "positiveRating")}
            title={agentLanguageCopy(language, "positiveRating")}
          >
            <ThumbsUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={disabled}
            onClick={() => onSubmit("negative")}
            aria-label={agentLanguageCopy(language, "negativeRating")}
            title={agentLanguageCopy(language, "negativeRating")}
          >
            <ThumbsDown className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
    </div>
  );
}
