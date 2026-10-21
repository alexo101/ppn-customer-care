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
  MAX_AUTO_CLOSE_MINUTES,
} from "@/lib/conversation-settings";
import {
  DEFAULT_ESCALATION_MESSAGE,
  DEFAULT_WELCOME_MESSAGE,
  ESCALATION_MESSAGE_MAX,
  hasRequiredEscalationTokens,
  WELCOME_MESSAGE_MAX,
  hasRequiredWelcomeTokens,
  REQUIRED_ESCALATION_TOKENS,
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
const WARNING_MESSAGE_MAX = 2000;

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
  const [minutes, setMinutes] = useState(0);
  const [autoCloseMinutes, setAutoCloseMinutes] = useState(60);
  const [warningMessage, setWarningMessage] = useState("");
  const [autoCloseMessage, setAutoCloseMessage] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState(DEFAULT_WELCOME_MESSAGE);
  const [escalationMessage, setEscalationMessage] = useState(
    DEFAULT_ESCALATION_MESSAGE,
  );
  const [emojiOpen, setEmojiOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectionRef = useRef<{ start: number; end: number }>({
    start: 0,
    end: 0,
  });

  useEffect(() => {
    if (!data) return;
    setMinutes(data.warningAfterMinutes);
    setAutoCloseMinutes(data.autoCloseAfterMinutes);
    setWarningMessage(data.warningMessage);
    setAutoCloseMessage(data.autoCloseMessage);
    setWelcomeMessage(
      hasRequiredWelcomeTokens(data.welcomeMessage)
        ? data.welcomeMessage
        : DEFAULT_WELCOME_MESSAGE,
    );
    setEscalationMessage(
      hasRequiredEscalationTokens(data.escalationMessage)
        ? data.escalationMessage
        : DEFAULT_ESCALATION_MESSAGE,
    );
    selectionRef.current = {
      start: data.autoCloseMessage.length,
      end: data.autoCloseMessage.length,
    };
  }, [data]);

  const saving = updateSettings.isPending;
  const warningDisabled = minutes === 0;
  const autoCloseDisabled = autoCloseMinutes === 0;

  const rememberSelection = () => {
    const field = textareaRef.current;
    if (!field) return;
    selectionRef.current = {
      start: field.selectionStart ?? autoCloseMessage.length,
      end: field.selectionEnd ?? autoCloseMessage.length,
    };
  };

  const insertEmoji = (emoji: string) => {
    const { start, end } = selectionRef.current;
    const next =
      `${autoCloseMessage.slice(0, start)}${emoji}${autoCloseMessage.slice(end)}`.slice(
        0,
        CLOSING_MESSAGE_MAX,
      );
    const cursor = Math.min(start + emoji.length, next.length);
    selectionRef.current = { start: cursor, end: cursor };
    setAutoCloseMessage(next);
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
    if (!hasRequiredEscalationTokens(escalationMessage)) {
      toast({
        title: "Escalation message is missing {user_name}",
        description: "Keep {user_name} in the message.",
        variant: "destructive",
      });
      return;
    }
    if (
      minutes > 0 &&
      autoCloseMinutes > 0 &&
      autoCloseMinutes <= minutes
    ) {
      toast({
        title: "Auto-close time must be later than the warning",
        description: "Set the close timer to more minutes than the warning timer.",
        variant: "destructive",
      });
      return;
    }
    const input: AgentConversationSettingsInput = {
      warningAfterMinutes: minutes,
      warningMessage: warningMessage.slice(0, WARNING_MESSAGE_MAX),
      autoCloseAfterMinutes: autoCloseMinutes,
      autoCloseMessage: autoCloseMessage.slice(0, CLOSING_MESSAGE_MAX),
      welcomeMessage: welcomeMessage.slice(0, WELCOME_MESSAGE_MAX),
      escalationMessage: escalationMessage.slice(0, ESCALATION_MESSAGE_MAX),
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

      <SettingsSection title="Unable-to-answer message">
        <div className="space-y-2">
          <Label htmlFor="escalation-message">Escalation prompt</Label>
          <TemplatedMessageField
            id="escalation-message"
            value={escalationMessage}
            onChange={setEscalationMessage}
            disabled={!canEdit}
            maxLength={ESCALATION_MESSAGE_MAX}
            requiredTokens={REQUIRED_ESCALATION_TOKENS}
          />
          <p className="text-xs text-muted-foreground">
            Sent when the agent cannot verify an answer. {"{user_name}"} cannot
            be edited or removed.
          </p>
        </div>
      </SettingsSection>

      <SettingsSection title="Warning to close">
        <div className="space-y-2">
          <Label>Warn after inactivity</Label>
          <div className="flex max-w-xs gap-3">
            <DurationField
              id="warning-after-minutes"
              label="Minutes"
              value={minutes}
              min={0}
              max={MAX_AUTO_CLOSE_MINUTES}
              disabled={!canEdit}
              onChange={setMinutes}
            />
          </div>
          {warningDisabled ? (
            <p className="text-xs text-muted-foreground">
              The inactivity warning is currently disabled.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="warning-message">Warning message</Label>
          <Textarea
            id="warning-message"
            value={warningMessage}
            onChange={(event) =>
              setWarningMessage(
                event.target.value.slice(0, WARNING_MESSAGE_MAX),
              )
            }
            disabled={!canEdit}
            rows={3}
            maxLength={WARNING_MESSAGE_MAX}
            placeholder="This conversation is still open. Reply here if you need more help."
          />
          <p className="text-xs text-muted-foreground">
            Sent once after the selected period without activity. A new reply
            restarts the inactivity timer. The localized thumbs-up/down
            question appears with this warning.
          </p>
        </div>
      </SettingsSection>

      <SettingsSection title="Auto close conversation">
        <div className="space-y-2">
          <Label>Close after inactivity</Label>
          <div className="flex max-w-xs gap-3">
            <DurationField
              id="auto-close-after-minutes"
              label="Minutes"
              value={autoCloseMinutes}
              min={0}
              max={MAX_AUTO_CLOSE_MINUTES}
              disabled={!canEdit}
              onChange={setAutoCloseMinutes}
            />
          </div>
          {autoCloseDisabled ? (
            <p className="text-xs text-muted-foreground">
              Automatic closure is currently disabled.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="auto-close-message">Final message</Label>
          <div className="rounded-md border border-input shadow-sm focus-within:ring-1 focus-within:ring-ring">
            <Textarea
              id="auto-close-message"
              ref={textareaRef}
              value={autoCloseMessage}
              onChange={(event) => {
                const value = event.target.value.slice(0, CLOSING_MESSAGE_MAX);
                setAutoCloseMessage(value);
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
              placeholder="This conversation has been closed after a period of inactivity. 👋"
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
                    aria-label="Add emoji to final message"
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
            This message is sent when the conversation closes. The thumbs-up or
            thumbs-down question appears with the inactivity warning instead.
          </p>
        </div>
      </SettingsSection>

      <MutatingControls>
        <Button onClick={() => void save()} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save conversation settings"}
        </Button>
      </MutatingControls>
    </div>
  );
}
