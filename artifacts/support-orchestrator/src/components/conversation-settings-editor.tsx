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
  const [emojiOpen, setEmojiOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectionRef = useRef<{ start: number; end: number }>({
    start: 0,
    end: 0,
  });

  useEffect(() => {
    if (!data) return;
    setDays(data.autoCloseDays);
    setHours(data.autoCloseHours);
    setMinutes(data.autoCloseMinutes);
    setClosingMessage(data.closingMessage);
    setAskIfResolved(data.askIfResolved);
    selectionRef.current = {
      start: data.closingMessage.length,
      end: data.closingMessage.length,
    };
  }, [data]);

  const saving = updateSettings.isPending;
  const autoCloseDisabled = days + hours + minutes === 0;

  const rememberSelection = () => {
    const field = textareaRef.current;
    if (!field) return;
    selectionRef.current = {
      start: field.selectionStart ?? closingMessage.length,
      end: field.selectionEnd ?? closingMessage.length,
    };
  };

  const insertEmoji = (emoji: string) => {
    const { start, end } = selectionRef.current;
    const next = `${closingMessage.slice(0, start)}${emoji}${closingMessage.slice(end)}`.slice(
      0,
      CLOSING_MESSAGE_MAX,
    );
    const cursor = Math.min(start + emoji.length, next.length);
    selectionRef.current = { start: cursor, end: cursor };
    setClosingMessage(next);
    setEmojiOpen(false);
    requestAnimationFrame(() => {
      const field = textareaRef.current;
      if (!field) return;
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
            <Label htmlFor="closing-message">Closing message</Label>
            <div className="rounded-md border border-input shadow-sm focus-within:ring-1 focus-within:ring-ring">
              <Textarea
                id="closing-message"
                ref={textareaRef}
                value={closingMessage}
                onChange={(event) => {
                  const value = event.target.value.slice(0, CLOSING_MESSAGE_MAX);
                  setClosingMessage(value);
                  selectionRef.current = {
                    start: event.target.selectionStart ?? value.length,
                    end: event.target.selectionEnd ?? value.length,
                  };
                }}
                onSelect={rememberSelection}
                onKeyUp={rememberSelection}
                onClick={rememberSelection}
                onBlur={rememberSelection}
                disabled={!canEdit}
                rows={4}
                maxLength={CLOSING_MESSAGE_MAX}
                placeholder="This conversation has been closed. Message us again if you need more help. 👋"
                className="border-0 shadow-none focus-visible:ring-0 min-h-[96px] resize-none"
              />
              <div className="flex items-center justify-end px-1 pb-1">
                <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-muted-foreground"
                      disabled={!canEdit}
                      aria-label="Add emoji to closing message"
                    >
                      <Smile className="h-4 w-4" />
                      Add emoji
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-64 p-2"
                    align="end"
                    onOpenAutoFocus={(event) => event.preventDefault()}
                    onCloseAutoFocus={(event) => event.preventDefault()}
                  >
                    <div className="grid grid-cols-8 gap-1">
                      {EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          className="h-8 w-8 rounded-md text-base hover:bg-muted"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => insertEmoji(emoji)}
                          aria-label={`Add ${emoji} to closing message`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              This text, including any emojis you add, is sent as the last
              message when the conversation closes.
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
