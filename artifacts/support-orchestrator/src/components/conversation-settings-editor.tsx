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
import { SettingsSection } from "@/components/settings-section";
import { TemplatedMessageField } from "@/components/templated-message-field";
import { toast } from "@/hooks/use-toast";
import {
  DEFAULT_WELCOME_MESSAGE,
  WELCOME_MESSAGE_MAX,
  hasRequiredWelcomeTokens,
} from "@/lib/welcome-message";

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
  const [welcomeMessage, setWelcomeMessage] = useState(DEFAULT_WELCOME_MESSAGE);
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
    setWelcomeMessage(
      hasRequiredWelcomeTokens(data.welcomeMessage)
        ? data.welcomeMessage
        : DEFAULT_WELCOME_MESSAGE,
    );
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
    if (!hasRequiredWelcomeTokens(welcomeMessage)) {
      toast({
        title: "Welcome message is missing required placeholders",
        description: "Keep {user_name} and {agent_name} in the message.",
        variant: "destructive",
      });
      return;
    }
    const input: AgentConversationSettingsInput = {
      autoCloseDays: days,
      autoCloseHours: hours,
      autoCloseMinutes: minutes,
      closingMessage: closingMessage.slice(0, CLOSING_MESSAGE_MAX),
      welcomeMessage: welcomeMessage.slice(0, WELCOME_MESSAGE_MAX),
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
      <SettingsSection title="Welcome message">
        <div className="space-y-2">
          <Label htmlFor="welcome-message">Opening greeting</Label>
          <TemplatedMessageField
            id="welcome-message"
            value={welcomeMessage}
            onChange={setWelcomeMessage}
            disabled={!canEdit}
            maxLength={WELCOME_MESSAGE_MAX}
          />
          <p className="text-xs text-muted-foreground">
            Sent as the first message when a conversation starts.{" "}
            {"{user_name}"} and {"{agent_name}"} cannot be edited or removed.
          </p>
        </div>
      </SettingsSection>

      <SettingsSection title="Auto-close conversations">
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
      </SettingsSection>

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
    </div>
  );
}
