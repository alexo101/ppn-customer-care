import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Send, UserRound } from "lucide-react";
import type { InboxEscalation, Message } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { customerDisplayName } from "@/lib/inbox-format";
import { isActiveInboxStatus } from "@/lib/inbox-status";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function InboxConversationPanel({
  escalation,
  messages,
  isLoading,
  isSending,
  onSend,
}: {
  escalation: InboxEscalation;
  messages: Message[];
  isLoading?: boolean;
  isSending?: boolean;
  onSend: (content: string) => void;
}) {
  const [content, setContent] = useState("");
  const scroller = useRef<HTMLDivElement | null>(null);
  const canRespond =
    isActiveInboxStatus(escalation.status) &&
    escalation.assigneeMemberId !== null;
  const customer = customerDisplayName(escalation);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages.length, escalation.id]);

  const send = () => {
    if (!content.trim() || isSending || !canRespond) return;
    onSend(content.trim());
    setContent("");
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-muted/25">
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading conversation...</p>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {messages.map((message) => {
              const user = message.sender === "user";
              const human = message.sender === "human";
              return (
                <div
                  key={message.id}
                  className={cn("flex gap-3", user ? "justify-end" : "justify-start")}
                >
                  {!user ? (
                    <div className="mt-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground">
                      {human ? (
                        <UserRound className="h-4 w-4" />
                      ) : (
                        <Bot className="h-4 w-4" />
                      )}
                    </div>
                  ) : null}
                  <div className={cn("max-w-[78%]", user ? "items-end" : "items-start")}>
                    <div
                      className={cn(
                        "mb-1 text-[11px] text-muted-foreground",
                        user && "text-right",
                      )}
                    >
                      {human
                        ? "Support specialist"
                        : user
                          ? customer
                          : "AppPro Copilot"}{" "}
                      {formatMessageTime(message.createdAt)}
                    </div>
                    <div
                      className={cn(
                        "rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap shadow-sm",
                        user
                          ? "rounded-br-md bg-primary text-primary-foreground"
                          : "rounded-bl-md border border-border bg-card",
                      )}
                    >
                      {message.content}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isActiveInboxStatus(escalation.status) ? (
        <div className="shrink-0 border-t border-border bg-card px-6 py-4">
          <div className="mx-auto max-w-3xl">
            <Textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={
                canRespond
                  ? `Reply to ${customer} as a human agent...`
                  : "Assign this escalation to yourself before replying..."
              }
              className="min-h-20 resize-none bg-background text-sm"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
            />
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <p>The AI agent stops replying while a human is handling this conversation.</p>
              <div className="flex items-center gap-2">
                <span>Enter</span>
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={send}
                  disabled={!content.trim() || isSending || !canRespond}
                >
                  {isSending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Send reply
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="shrink-0 border-t border-border bg-card px-6 py-3 text-center text-xs text-muted-foreground">
          This escalation is resolved. Reopen it to send another reply.
        </div>
      )}
    </div>
  );
}

function formatMessageTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
