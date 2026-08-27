import { useEffect, useRef, useState } from "react";
import {
  useCreateConversation,
  useGetAgent,
  useGetAgentAppearance,
  useGetConversation,
  useListMessages,
  useSendMessage,
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
import { contrastHex, DEFAULT_BACKGROUND_COLOR, DEFAULT_CHAT_NAME, DEFAULT_CTA_COLOR } from "@/lib/appearance-theme";
import { SourceCitations } from "@/components/chat/source-citations";

const TRAINING_LOADER_STEPS = [
  "Classifying...",
  "Checking sources",
  "Checking target settled",
  "Checking the rules",
  "Shaping the response...",
] as const;

function TrainingThinkingStatus() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setStep((current) => (current + 1) % TRAINING_LOADER_STEPS.length);
    }, 3000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="flex justify-start">
      <div className="bg-white border border-black/5 text-slate-800 rounded-2xl rounded-tl-sm px-4 py-2 text-sm shadow-sm flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {TRAINING_LOADER_STEPS[step]}
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

  const ctaColor = appearance?.ctaColor ?? DEFAULT_CTA_COLOR;
  const backgroundColor = appearance?.backgroundColor ?? DEFAULT_BACKGROUND_COLOR;
  const logoUrl = source === "training" ? appearance?.logoUrl ?? null : null;
  const chatName = agent?.name?.trim() || DEFAULT_CHAT_NAME;
  const onCta = contrastHex(ctaColor);

  const [convoId, setConvoId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const runIdRef = useRef(0);

  const { mutate: createConversation, isPending: creatingConversation } = useCreateConversation();
  const { mutate: sendChatMessage, isPending: sendingMessage } = useSendMessage();
  const { data: convo } = useGetConversation(convoId ?? "", {
    query: { enabled: Boolean(convoId), queryKey: getGetConversationQueryKey(convoId ?? "") },
  });
  const { data: messages = [], refetch } = useListMessages(convoId ?? "", {
    query: { enabled: Boolean(convoId), queryKey: getListMessagesQueryKey(convoId ?? "") },
  });

  const waitingForQuestion = source === "training" && !seedKey;
  const busy = creatingConversation || sendingMessage;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, busy, convoId]);

  useEffect(() => {
    if (source !== "widget") return;

    let cancelled = false;
    createConversation(
      { data: { metadata: { source: "widget" }, ...(agentId ? { agentId } : {}) } },
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

    if (!seedKey || !seedMessage?.trim()) {
      setConvoId(null);
      setInput("");
      setSendError(null);
      return;
    }

    const runId = ++runIdRef.current;
    setConvoId(null);
    setInput("");
    setSendError(null);

    createConversation(
      {
        data: {
          metadata: {
            source: "training",
            subject: seedMessage.slice(0, 80),
            trainingQuestionId: seedKey,
          },
          ...(agentId ? { agentId } : {}),
        },
      },
      {
        onSuccess: (data) => {
          if (runId !== runIdRef.current) return;
          setConvoId(data.id);
          sendChatMessage(
            { id: data.id, data: { content: seedMessage } },
            {
              onSuccess: () => {
                if (runId !== runIdRef.current) return;
                setSendError(null);
                queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(data.id) });
              },
              onError: (error) => {
                if (runId !== runIdRef.current) return;
                setSendError(error instanceof Error ? error.message : "The training preview could not complete.");
              },
            },
          );
        },
      },
    );
  }, [source, agentId, seedKey, seedMessage, runNonce, createConversation, sendChatMessage, queryClient]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !convoId || sendingMessage) return;

    setSendError(null);
    sendChatMessage(
      { id: convoId, data: { content: input } },
      {
        onSuccess: () => {
          setInput("");
          refetch();
        },
        onError: (error) => {
          setSendError(error instanceof Error ? error.message : "The training preview could not complete.");
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
            <img src={logoUrl} alt="Chat logo" className="w-7 h-7 rounded-md object-contain bg-white/90 p-0.5" />
          ) : (
            <Bot className="w-5 h-5" />
          )}
          <div className="min-w-0">
            <div className="font-medium truncate text-sm">{chatName}</div>
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
          {waitingForQuestion ? (
            <div className="h-full min-h-[220px] flex items-center justify-center px-6">
              <p className="text-center text-sm text-slate-500">{emptyHint}</p>
            </div>
          ) : (
            <>
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-2 text-sm bg-white text-slate-800 shadow-sm border border-black/5">
                  Hi — how can we help today?
                </div>
              </div>

              {source === "training" && seedMessage && !messages.some((msg) => msg.sender === "user") && (
                <div className="flex justify-end">
                  <div
                    className="max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-2 text-sm whitespace-pre-wrap"
                    style={{ backgroundColor: ctaColor, color: onCta }}
                  >
                    {seedMessage}
                  </div>
                </div>
              )}

              {!convoId && busy && (
                <div className="flex justify-start">
                  <div className="bg-white border border-black/5 text-slate-800 rounded-2xl rounded-tl-sm px-4 py-2 text-sm shadow-sm flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Starting chat...
                  </div>
                </div>
              )}

              {messages.map((msg) => {
                const isUser = msg.sender === "user";
                return (
                  <div key={msg.id} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap",
                        isUser
                          ? "rounded-tr-sm"
                          : "bg-white text-slate-800 rounded-tl-sm shadow-sm border border-black/5",
                      )}
                      style={isUser ? { backgroundColor: ctaColor, color: onCta } : undefined}
                    >
                      {msg.content}
                      {!isUser && <SourceCitations metadata={msg.metadata} />}
                    </div>
                  </div>
                );
              })}

              {sendingMessage &&
                (source === "training" ? (
                  <TrainingThinkingStatus />
                ) : (
                  <div className="flex justify-start">
                    <div className="bg-white border border-black/5 text-slate-800 rounded-2xl rounded-tl-sm px-4 py-2 text-sm shadow-sm flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Typing...
                    </div>
                  </div>
                ))}

              {source === "training" && sendError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                >
                  <p className="font-medium">Training could not complete</p>
                  <p className="mt-1">{sendError.replace(/^HTTP \d+\s[^:]+:\s*/, "")}</p>
                  <button
                    type="button"
                    className="mt-2 font-medium underline underline-offset-2"
                    onClick={() => setSendError(null)}
                  >
                    Dismiss
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
            placeholder={waitingForQuestion ? "Select a question to start" : "Type your message..."}
            disabled={waitingForQuestion || sendingMessage || !convoId || convo?.status === "closed"}
            className="pr-12 rounded-full bg-white border-black/10 focus-visible:ring-1 focus-visible:ring-primary shadow-none"
          />
          <Button
            type="submit"
            size="icon"
            disabled={
              waitingForQuestion ||
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
