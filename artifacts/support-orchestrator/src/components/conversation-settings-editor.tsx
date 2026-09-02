import { useEffect, useRef, useState } from "react";
import {
  getGetAgentConversationSettingsQueryKey,
  type AgentConversationSettingsInput,
  useGetAgentConversationSettings,
  useUpdateAgentConversationSettings,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Save, Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  MutatingControls,
  useWorkspaceAccess,
} from "@/components/workspace-access";
import { toast } from "@/hooks/use-toast";

const EMOJIS = [
  "😀",
  "😊",
  "😍",
  "🤗",
  "😅",
  "😢",
  "😮",
  "👍",
  "👎",
  "🙏",
  "👋",
  "✅",
  "❌",
  "🎉",
  "❤️",
  "⭐",
  "🔥",
  "💯",
  "🤝",
  "💡",
  "📌",
  "⏰",
  "💬",
  "🙌",
];

const CLOSING_MESSAGE_MAX = 2000;

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function DurationField({
  id,
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2 flex-1 min-w-0">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(clamp(Number(event.target.value), min, max))
        }
      />
    </div>
  );
}

export function ConversationSettingsEditor({ agentId }: { agentId: string }) {
  const { canEdit } = useWorkspaceAccess();
  const queryClient = useQueryClient();
  const { data, isLoading } = useGetAgentConversationSettings(agentId, {
    query: {
      queryKey: getGetAgentConversationSettingsQueryKey(agentId),
      retry: false,
    },
  });
  const updateSettings = useUpdateAgentConversationSettings();
  const [days, setDays] = useState(0);
  const [hours, setHours] = useState(1);
  const [minutes, setMinutes] = useState(0);
  const [closingMessage, setClosingMessage] = useState("");
  const [askIfResolved, setAskIfResolved] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!data) return;
    setDays(data.autoCloseDays);
    setHours(data.autoCloseHours);
    setMinutes(data.autoCloseMinutes);
    setClosingMessage(data.closingMessage);
    setAskIfResolved(data.askIfResolved);
  }, [data]);

  const saving = updateSettings.isPending;
  const autoCloseDisabled = days + hours + minutes === 0;

  const insertEmoji = (emoji: string) => {
    const field = textareaRef.current;
    if (!field) {
      setClosingMessage((current) =>
        `${current}${emoji}`.slice(0, CLOSING_MESSAGE_MAX),
      );
      return;
    }
    const start = field.selectionStart ?? closingMessage.length;
    const end = field.selectionEnd ?? closingMessage.length;
    const next = `${closingMessage.slice(0, start)}${emoji}${closingMessage.slice(end)}`.slice(
      0,
      CLOSING_MESSAGE_MAX,
    );
    setClosingMessage(next);
    requestAnimationFrame(() => {
      const cursor = Math.min(start + emoji.length, CLOSING_MESSAGE_MAX);
      field.focus();
      field.setSelectionRange(cursor, cursor);
    });
  };

  const save = async () => {
    const input: AgentConversationSettingsInput = {
      autoCloseDays: days,
      autoCloseHours: hours,
      autoCloseMinutes: minutes,
      closingMessage: closingMessage.slice(0, CLOSING_MESSAGE_MAX),
      askIfResolved,
    };
    try {
      await updateSettings.mutateAsync({ id: agentId, data: input });
      await queryClient.invalidateQueries({
        queryKey: getGetAgentConversationSettingsQueryKey(agentId),
      });
      toast({ title: "Conversation settings saved" });
    } catch (error) {
      toast({
        title: "Could not save conversation settings",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">
        Loading conversation settings...
      </p>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <Card className="shadow-none border-border">
        <CardHeader>
          <CardTitle className="text-base">Auto-close conversations</CardTitle>
          <CardDescription>
            Close idle conversations after the exact duration you set. A
            duration of 0 days, 0 hours, and 0 minutes turns auto-close off.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Close after inactivity</Label>
            <div className="flex flex-col sm:flex-row gap-3">
              <DurationField
                id="auto-close-days"
                label="Days"
                value={days}
                min={0}
                max={365}
                disabled={!canEdit}
                onChange={setDays}
              />
              <DurationField
                id="auto-close-hours"
                label="Hours"
                value={hours}
                min={0}
                max={23}
                disabled={!canEdit}
                onChange={setHours}
              />
              <DurationField
                id="auto-close-minutes"
                label="Minutes"
                value={minutes}
                min={0}
                max={59}
                disabled={!canEdit}
                onChange={setMinutes}
              />
            </div>
            {autoCloseDisabled ? (
              <p className="text-xs text-muted-foreground">
                Auto-close is currently disabled.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="closing-message">Closing message</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    disabled={!canEdit}
                    aria-label="Insert emoji"
                  >
                    <Smile className="h-4 w-4" />
                    Emoji
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="end">
                  <div className="grid grid-cols-8 gap-1">
                    {EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="h-8 w-8 rounded-md text-base hover:bg-muted"
                        onClick={() => insertEmoji(emoji)}
                        aria-label={`Insert ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <Textarea
              id="closing-message"
              ref={textareaRef}
              value={closingMessage}
              onChange={(event) =>
                setClosingMessage(event.target.value.slice(0, CLOSING_MESSAGE_MAX))
              }
              disabled={!canEdit}
              rows={4}
              maxLength={CLOSING_MESSAGE_MAX}
              placeholder="This conversation has been closed. Message us again if you need more help."
            />
            <p className="text-xs text-muted-foreground">
              Sent to the customer when the conversation closes. Emojis are
              supported.
            </p>
          </div>

          <div className="space-y-3">
            <Label>Before closing</Label>
            <div className="rounded-lg border border-border divide-y divide-border">
              <label className="flex items-center gap-3 p-3 cursor-pointer">
                <Checkbox
                  checked={askIfResolved}
                  onCheckedChange={() => setAskIfResolved(true)}
                  disabled={!canEdit}
                />
                <span className="text-sm">
                  Ask the user if their issue has been resolved
                </span>
              </label>
              <label className="flex items-center gap-3 p-3 cursor-pointer">
                <Checkbox
                  checked={!askIfResolved}
                  onCheckedChange={() => setAskIfResolved(false)}
                  disabled={!canEdit}
                />
                <span className="text-sm">
                  Close automatically without asking
                </span>
              </label>
            </div>
          </div>

          <MutatingControls>
            <Button
              onClick={() => void save()}
              disabled={saving}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save conversation settings"}
            </Button>
          </MutatingControls>
        </CardContent>
      </Card>
    </div>
  );
}
