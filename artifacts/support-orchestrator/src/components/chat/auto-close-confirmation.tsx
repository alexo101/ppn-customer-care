import { Button } from "@/components/ui/button";

export function AutoCloseConfirmation({
  disabled,
  onRespond,
}: {
  disabled?: boolean;
  onRespond: (resolved: boolean) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-background px-3 py-3 space-y-2">
      <p className="text-sm text-foreground">Has your issue been resolved?</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="h-8"
          disabled={disabled}
          onClick={() => onRespond(true)}
        >
          Yes
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          disabled={disabled}
          onClick={() => onRespond(false)}
        >
          No, I still need help
        </Button>
      </div>
    </div>
  );
}
