import { useEffect, useRef, useState } from "react";
import {
  useCreateConversation,
  useGetAgent,
  useGetAgentAppearance,
  useGetConversation,
  useListMessages,
  useSendMessage,
  useEscalateConversation,
  getGetAgentAppearanceQueryKey,
  getGetAgentQueryKey,
  getGetConversationQueryKey,
  getListMessagesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, Minus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAppearance } from "@/components/appearance-provider";
import {
  AppearanceTag,
  DEFAULT_TAG_STYLE,
  isTagStyle,
} from "@/components/chat/appearance-tag";
import {
  contrastHex,
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_CHAT_NAME,
  DEFAULT_CTA_COLOR,
} from "@/lib/appearance-theme";
import { SourceCitations } from "@/components/chat/source-citations";
import { latestEscalationOffer } from "@/lib/conversation-actions";

const GREETING_WAIT_MS = 12_000;
const GREETING_WAIT_ERROR =
  "The greeting never arrived. Try again, or restart the API if this keeps happening.";

function assistantMessageCount(messages: { sender: string }[]): number {
  return messages.reduce(
    (count, message) => count + (message.sender === "assistant" ? 1 : 0),
    0,
  );
}

function TrainingThinkingStatus() {
  return (
    <div className="flex justify-start">
      <div className="bg-white border border-black/5 text-slate-800 rounded-2xl rounded-tl-sm px-4 py-2 text-sm shadow-sm flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Preparing response...
      </div>
    </div>
  );
}

type SupportChatPanelProps = {
  agentId?: string;
  source: "widget" | "training";
  seedKey?: string | null;
  seedMessage?: string | null;
  runNonce?: number;
  onClose?: () => void;
  className?: string;
  emptyHint?: string;
};

export function SupportChatPanel({
  agentId,
  source,
  seedKey,
  seedMessage,
  runNonce = 0,
  onClose,
  className,
  emptyHint = "Select a question to test how the agent answers.",
}: SupportChatPanelProps) {
  const queryClient = useQueryClient();
  const { appearance: sessionAppearance } = useAppearance();
  const { data: agent } = useGetAgent(agentId ?? "", {
    query: {
      enabled: Boolean(agentId),
      queryKey: getGetAgentQueryKey(agentId ?? ""),
    },
  });
  const { data: agentAppearance } = useGetAgentAppearance(agentId ?? "", {
    query: {
      enabled: Boolean(agentId),
      queryKey: getGetAgentAppearanceQueryKey(agentId ?? ""),
    },
  });
  const appearance = agentAppearance ?? sessionAppearance;
  const browserLanguage =
    typeof navigator !== "undefined" ? navigator.language : undefined;

  const ctaColor = appearance?.ctaColor ?? DEFAULT_CTA_COLOR;
  const backgroundColor =
    appearance?.backgroundColor ?? DEFAULT_BACKGROUND_COLOR;
  const logoUrl = source === "training" ? (appearance?.logoUrl ?? null) : null;
  const chatName = agent?.name?.trim() || DEFAULT_CHAT_NAME;
  const tagText = appearance?.tagText ?? null;
  const tagStyle =
    appearance && isTagStyle(appearance.tagStyle)
      ? appearance.tagStyle
      : DEFAULT_TAG_STYLE;
  const onCta = contrastHex(ctaColor);

  const [convoId, setConvoId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [thinkingVisible, setThinkingVisible] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [welcomeWaitTimedOut, setWelcomeWaitTimedOut] = useState(false);
  const [dismissedEscalationMessageId, setDismissedEscalationMessageId] =
    useState<string | null>(null);
  const [escalationError, setEscalationError] = useState<string | null>(null);
  const [pendingUserMessage, setPendingUserMessage] = useState<{
    content: string;
    id?: string;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const runIdRef = useRef(0);
  const assistantBaselineRef = useRef(0);
  const sentSeedRef = useRef<string | null>(null);

  const { mutate: createConversation, isPending: creatingConversation } =
    useCreateConversation();
  const { mutate: sendChatMessage, isPending: sendingMessage } =
    useSendMessage();
  const escalateConversation = useEscalateConversation();
  const { data: convo, refetch: refetchConvo } = useGetConversation(
    convoId ?? "",
    {
      query: {
        enabled: Boolean(convoId),
        queryKey: getGetConversationQueryKey(convoId ?? ""),
        refetchInterval: 5000,
      },
    },
  );
  const { data: messages = [], refetch } = useListMessages(convoId ?? "", {
    query: {
      enabled: Boolean(convoId),
      queryKey: getListMessagesQueryKey(convoId ?? ""),
      refetchInterval: (query) => {
        if (source !== "training" || welcomeWaitTimedOut) return 5000;
        const rows = query.state.data;
        const hasWelcome = Array.isArray(rows)
          ? rows.some(
              (msg) =>
                msg.sender === "assistant" &&
                Boolean(msg.metadata) &&
                typeof msg.metadata === "object" &&
                (msg.metadata as { kind?: string }).kind === "welcome",
            )
          : false;
        return hasWelcome ? 5000 : 1000;
      },
    },
  });

  const waitingForQuestion = source === "training" && !seedKey;
  const busy = creatingConversation || sendingMessage;
  const hasWelcomeMessage = messages.some(
    (msg) =>
      msg.sender === "assistant" &&
      Boolean(msg.metadata) &&
      typeof msg.metadata === "object" &&
      (msg.metadata as { kind?: string }).kind === "welcome",
  );
  const waitingForWelcome =
    source === "training" &&
    Boolean(seedKey) &&
    Boolean(convoId) &&
    !hasWelcomeMessage &&
    !welcomeWaitTimedOut &&
    !sendError;
  const latestUnableToAnswer = latestEscalationOffer(messages);
  const escalationOffer = latestEscalationOffer(
    messages,
    dismissedEscalationMessageId,
  );
  const pendingUserMessageReconciled =
    pendingUserMessage !== null &&
    messages.some(
      (msg) =>
        msg.sender === "user" &&
        (msg.id === pendingUserMessage.id ||
          msg.content.trim() === pendingUserMessage.content.trim()),
    );

  const beginThinking = (baseline: number) => {
    assistantBaselineRef.current = baseline;
    setThinkingVisible(true);
  };

  const stopThinking = () => setThinkingVisible(false);

  useEffect(() => {
    if (!thinkingVisible) return;
    if (assistantMessageCount(messages) > assistantBaselineRef.current) {
      setThinkingVisible(false);
    }
  }, [messages, thinkingVisible]);

  useEffect(() => {
    if (pendingUserMessageReconciled) {
      setPendingUserMessage(null);
    }
  }, [pendingUserMessageReconciled]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, busy, convoId]);

  useEffect(() => {
    if (source !== "widget") return;

    let cancelled = false;
    createConversation(
      {
        data: {
          metadata: {
            source: "widget",
            ...(browserLanguage ? { browser_language: browserLanguage } : {}),
          },
          ...(agentId ? { agentId } : {}),
        },
      },
      {
        onSuccess: (data) => {
          if (!cancelled) setConvoId(data.id);
        },
      },
    );

    return () => {
      cancelled = true;
    };
  }, [source, agentId, createConversation]);

  useEffect(() => {
    if (source !== "training") return;
    if (!agentId) {
      setConvoId(null);
      return;
    }

    const runId = ++runIdRef.current;
    sentSeedRef.current = null;
    setConvoId(null);
    setInput("");
    setSendError(null);
    setWelcomeWaitTimedOut(false);
    setPendingUserMessage(null);
    setDismissedEscalationMessageId(null);
    setEscalationError(null);
    stopThinking();

    createConversation(
      {
        data: {
          metadata: {
            source: "training",
            ...(seedMessage?.trim()
              ? { subject: seedMessage.slice(0, 80) }
              : {}),
            ...(seedKey ? { trainingQuestionId: seedKey } : {}),
            ...(browserLanguage ? { browser_language: browserLanguage } : {}),
          },
          agentId,
        },
      },
      {
        onSuccess: (data) => {
          if (runId !== runIdRef.current) return;
          setConvoId(data.id);
          queryClient.invalidateQueries({
            queryKey: getListMessagesQueryKey(data.id),
          });
        },
        onError: (error) => {
          if (runId !== runIdRef.current) return;
          setSendError(
            error instanceof Error
              ? error.message
              : "The training preview could not start.",
          );
        },
      },
    );
  }, [
    source,
    agentId,
    seedKey,
    seedMessage,
    runNonce,
    retryNonce,
    createConversation,
    queryClient,
  ]);

  useEffect(() => {
    if (!waitingForWelcome) return;

    const timer = window.setTimeout(() => {
      setWelcomeWaitTimedOut(true);
      setSendError(GREETING_WAIT_ERROR);
    }, GREETING_WAIT_MS);

    return () => window.clearTimeout(timer);
  }, [waitingForWelcome]);

  useEffect(() => {
    if (source !== "training") return;
    if (!seedKey || !seedMessage?.trim() || !convoId || sendingMessage) return;
    if (messages.some((msg) => msg.sender === "user")) return;
    if (!hasWelcomeMessage) return;
    const seedToken = `${convoId}:${seedKey}`;
    if (sentSeedRef.current === seedToken) return;
    sentSeedRef.current = seedToken;

    const runId = runIdRef.current;
    setPendingUserMessage({ content: seedMessage.trim() });
    beginThinking(assistantMessageCount(messages));
    sendChatMessage(
      { id: convoId, data: { content: seedMessage.trim() } },
      {
        onSuccess: (data) => {
          if (runId !== runIdRef.current) return;
          setPendingUserMessage((current) =>
            current ? { ...current, id: data.message.id } : current,
          );
          stopThinking();
          setSendError(null);
          queryClient.invalidateQueries({
            queryKey: getListMessagesQueryKey(convoId),
          });
        },
        onError: (error) => {
          if (runId !== runIdRef.current) return;
          stopThinking();
          setSendError(
            error instanceof Error
              ? error.message
              : "The training preview could not complete.",
          );
        },
      },
    );
  }, [
    source,
    seedKey,
    seedMessage,
    convoId,
    sendingMessage,
    messages,
    hasWelcomeMessage,
    sendChatMessage,
    queryClient,
  ]);

  const handleRetry = () => {
    setSendError(null);
    setWelcomeWaitTimedOut(false);
    setRetryNonce((value) => value + 1);
  };

  const handleEscalate = () => {
    if (!convoId || !escalationOffer || escalateConversation.isPending) return;
    setDismissedEscalationMessageId(escalationOffer.id);
    setEscalationError(null);
    escalateConversation.mutate(
      { id: convoId, data: { messageId: escalationOffer.id } },
      {
        onSuccess: () => {
          void refetch();
          void refetchConvo();
        },
        onError: (error) => {
          setDismissedEscalationMessageId(null);
          setEscalationError(
            error instanceof Error
              ? error.message
              : "Could not escalate this conversation.",
          );
        },
      },
    );
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !convoId || sendingMessage) return;

    setSendError(null);
    setEscalationError(null);
    setDismissedEscalationMessageId(latestUnableToAnswer?.id ?? null);
    const submittedMessage = input.trim();
    setPendingUserMessage({ content: submittedMessage });
    if (source === "training") {
      beginThinking(assistantMessageCount(messages));
    }
    sendChatMessage(
      { id: convoId, data: { content: submittedMessage } },
      {
        onSuccess: (data) => {
          stopThinking();
          setPendingUserMessage((current) =>
            current ? { ...current, id: data.message.id } : current,
          );
          setInput("");
          refetch();
          refetchConvo();
        },
        onError: (error) => {
          stopThinking();
          setSendError(
            error instanceof Error
              ? error.message
              : "The training preview could not complete.",
          );
        },
      },
    );
  };

  return (
    <div
      className={cn("flex flex-col overflow-hidden", className)}
      style={{ backgroundColor }}
    >
      <div
        className="h-14 px-4 flex items-center justify-between shrink-0"
        style={{ backgroundColor: ctaColor, color: onCta }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Chat logo"
              className="w-7 h-7 rounded-md object-contain bg-white/90 p-0.5"
            />
          ) : (
            <Bot className="w-5 h-5" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="font-medium truncate text-sm">{chatName}</div>
              <AppearanceTag
                text={tagText}
                style={tagStyle}
                ctaColor={ctaColor}
                tone="onCta"
                className="shrink-0"
              />
            </div>
            <div className="text-[10px] opacity-80 truncate">
              {source === "training" ? "Training preview" : "Online"}
            </div>
          </div>
        </div>
        {onClose ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-black/10"
            style={{ color: onCta }}
            onClick={onClose}
          >
            <Minus className="w-4 h-4" />
          </Button>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
        <div className="space-y-4">
          {waitingForQuestion && messages.length === 0 && !convoId && !busy ? (
            <div className="h-full min-h-[220px] flex items-center justify-center px-6">
              <p className="text-center text-sm text-slate-500">{emptyHint}</p>
            </div>
          ) : (
            <>
              {!convoId && busy && (
                <div className="flex justify-start">
                  <div className="bg-white border border-black/5 text-slate-800 rounded-2xl rounded-tl-sm px-4 py-2 text-sm shadow-sm flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Starting chat...
                  </div>
                </div>
              )}

              {waitingForWelcome && messages.length === 0 && (
                <div className="flex justify-start">
                  <div className="bg-white border border-black/5 text-slate-800 rounded-2xl rounded-tl-sm px-4 py-2 text-sm shadow-sm flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Preparing greeting...
                  </div>
                </div>
              )}

              {messages.map((msg) => {
                const isUser = msg.sender === "user";
                return (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex",
                      isUser ? "justify-end" : "justify-start",
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap",
                        isUser
                          ? "rounded-tr-sm"
                          : "bg-white text-slate-800 rounded-tl-sm shadow-sm border border-black/5",
                      )}
                      style={
                        isUser
                          ? { backgroundColor: ctaColor, color: onCta }
                          : undefined
                      }
                    >
                      {msg.content}
                      {!isUser && <SourceCitations metadata={msg.metadata} />}
                      {msg.id === escalationOffer?.id && (
                        <div className="mt-2 border-t border-black/10 pt-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={handleEscalate}
                            disabled={escalateConversation.isPending}
                          >
                            {escalateConversation.isPending
                              ? "Escalating..."
                              : "Escalate"}
                          </Button>
                          {escalationError && (
                            <p
                              className="mt-1 text-xs text-red-700"
                              role="alert"
                            >
                              {escalationError}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {pendingUserMessage && !pendingUserMessageReconciled && (
                  <div className="flex justify-end">
                    <div
                      className="max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-2 text-sm whitespace-pre-wrap"
                      style={{ backgroundColor: ctaColor, color: onCta }}
                    >
                      {pendingUserMessage.content}
                    </div>
                  </div>
                )}

              {source === "training" && thinkingVisible && (
                <TrainingThinkingStatus />
              )}

              {source !== "training" && sendingMessage && (
                <div className="flex justify-start">
                  <div className="bg-white border border-black/5 text-slate-800 rounded-2xl rounded-tl-sm px-4 py-2 text-sm shadow-sm flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Typing...
                  </div>
                </div>
              )}

              {source === "training" && sendError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                >
                  <p className="font-medium">Training could not complete</p>
                  <p className="mt-1">
                    {sendError.replace(/^HTTP \d+\s[^:]+:\s*/, "")}
                  </p>
                  <button
                    type="button"
                    className="mt-2 font-medium underline underline-offset-2"
                    onClick={handleRetry}
                  >
                    Try again
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="p-3 bg-white/80 border-t border-black/10 shrink-0">
        <form onSubmit={handleSend} className="relative">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              waitingForQuestion
                ? "Select a question to start"
                : waitingForWelcome
                  ? "Waiting for greeting..."
                  : "Type your message..."
            }
            disabled={
              waitingForQuestion ||
              waitingForWelcome ||
              sendingMessage ||
              !convoId ||
              convo?.status === "closed"
            }
            className="pr-12 rounded-full bg-white border-black/10 focus-visible:ring-1 focus-visible:ring-primary shadow-none"
          />
          <Button
            type="submit"
            size="icon"
            disabled={
              waitingForQuestion ||
              waitingForWelcome ||
              !input.trim() ||
              sendingMessage ||
              !convoId ||
              convo?.status === "closed"
            }
            className="absolute right-1 top-1 h-7 w-7 rounded-full shadow-none border-0"
            style={{ backgroundColor: ctaColor, color: onCta }}
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
        </form>
      </div>
    </div>
  );
}
