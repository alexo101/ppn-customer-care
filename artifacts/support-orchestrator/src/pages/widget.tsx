import { useState, useRef, useEffect } from 'react';
import { useSearch } from 'wouter';
import { 
  useCreateConversation, 
  useSendMessage, 
  useListMessages,
  useGetConversation,
  useGetAgent,
  useGetAgentAppearance,
  getGetAgentAppearanceQueryKey,
  getGetAgentQueryKey,
  useSubmitFeedback,
} from '@workspace/api-client-react';
import { Send, Bot, Loader2, Minus, MessageSquare, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useAppearance } from '@/components/appearance-provider';
import { contrastHex, DEFAULT_BACKGROUND_COLOR, DEFAULT_CHAT_NAME, DEFAULT_CTA_COLOR } from '@/lib/appearance-theme';

export default function Widget() {
  const search = useSearch();
  const agentId = new URLSearchParams(search).get('agentId') || undefined;
  const [isOpen, setIsOpen] = useState(false);
  const [convoId, setConvoId] = useState<string | null>(null);
  const { appearance: sessionAppearance } = useAppearance();
  const { data: agent } = useGetAgent(agentId ?? '', {
    query: { enabled: Boolean(agentId), queryKey: getGetAgentQueryKey(agentId ?? '') },
  });
  const { data: agentAppearance } = useGetAgentAppearance(agentId ?? '', {
    query: { enabled: Boolean(agentId), queryKey: getGetAgentAppearanceQueryKey(agentId ?? '') },
  });
  const appearance = agentAppearance ?? sessionAppearance;

  const ctaColor = appearance?.ctaColor ?? DEFAULT_CTA_COLOR;
  const backgroundColor = appearance?.backgroundColor ?? DEFAULT_BACKGROUND_COLOR;
  const chatName = agent?.name?.trim() || DEFAULT_CHAT_NAME;
  const onCta = contrastHex(ctaColor);
  const onBackground = contrastHex(backgroundColor);
  
  const createConvo = useCreateConversation();
  const sendMessage = useSendMessage();
  const submitFeedback = useSubmitFeedback();
  
  const { data: convo } = useGetConversation(convoId ?? '');
  const { data: messages = [], refetch } = useListMessages(convoId ?? '');
  
  const [input, setInput] = useState('');
  const [feedbackRating, setFeedbackRating] = useState<"positive" | "negative" | null>(null);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  useEffect(() => {
    setFeedbackRating(null);
    setFeedbackComment('');
    setFeedbackSent(false);
  }, [convoId]);

  const handleOpen = () => {
    setIsOpen(true);
    if (!convoId && !createConvo.isPending) {
      createConvo.mutate({ 
        data: { metadata: { source: "widget" }, ...(agentId ? { agentId } : {}) }
      }, {
        onSuccess: (data) => setConvoId(data.id)
      });
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !convoId || sendMessage.isPending) return;
    
    sendMessage.mutate({
      id: convoId,
      data: {
        content: input,
        context: { currentUrl: window.location.href },
      }
    }, {
      onSuccess: () => {
        setInput('');
        refetch();
      }
    });
  };

  const latestAssistant = [...messages].reverse().find((message) => message.sender === 'assistant');
  const sendFeedback = (rating: "positive" | "negative") => {
    if (!latestAssistant || submitFeedback.isPending) return;
    if (rating === "negative" && feedbackRating !== "negative") {
      setFeedbackRating("negative");
      return;
    }
    submitFeedback.mutate({
      id: convoId!,
      data: {
        messageId: latestAssistant.id,
        rating,
        comment: rating === "negative" ? feedbackComment || undefined : undefined,
      },
    }, { onSuccess: () => setFeedbackSent(true) });
  };

  return (
    <div className="h-screen w-full relative flex flex-col font-sans" style={{ backgroundColor, color: onBackground }}>
      <div className="absolute inset-0 p-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Your App Website</h1>
        </div>
        <p className="opacity-70 mt-2 max-w-lg">
          This is a simulated host website. The widget in the bottom right is the embeddable piece powered by the orchestrator, styled to match your appearance settings.
        </p>
      </div>

      {!isOpen && (
        <Button 
          onClick={handleOpen}
          className="absolute bottom-6 right-6 h-14 w-14 rounded-full shadow-xl flex items-center justify-center p-0 border-0"
          style={{ backgroundColor: ctaColor, color: onCta }}
        >
          <MessageSquare className="w-6 h-6" />
        </Button>
      )}

      {isOpen && (
        <div className="absolute bottom-6 right-6 w-[350px] h-[550px] border border-black/10 shadow-2xl rounded-xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 fade-in duration-300" style={{ backgroundColor }}>
          {/* Header */}
          <div className="h-14 px-4 flex items-center justify-between shrink-0" style={{ backgroundColor: ctaColor, color: onCta }}>
            <div className="flex items-center gap-2 min-w-0">
              <Bot className="w-5 h-5" />
              <div className="font-medium truncate">{chatName}</div>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-black/10" style={{ color: onCta }} onClick={() => setIsOpen(false)}>
                <Minus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Chat Area */}
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-4">
              <div className="text-center text-xs text-muted-foreground my-4">
                Chat started
              </div>
              
              {!convoId && createConvo.isPending && (
                <div className="flex justify-center p-4">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              )}

              {messages.map((msg) => {
                const isUser = msg.sender === 'user';
                return (
                  <div key={msg.id} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2 text-sm",
                      isUser 
                        ? "rounded-tr-sm" 
                        : "bg-white text-slate-800 rounded-tl-sm shadow-sm border border-black/5"
                    )}
                    style={isUser ? { backgroundColor: ctaColor, color: onCta } : undefined}
                    >
                      {msg.content}
                    </div>
                  </div>
                );
              })}

              {sendMessage.isPending && (
                <div className="flex justify-start">
                  <div className="bg-card border border-border text-card-foreground rounded-2xl rounded-tl-sm px-4 py-2 text-sm shadow-sm flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Typing...
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {convo?.status === 'resolved' && latestAssistant && !feedbackSent && (
            <div className="border-t border-border bg-background px-3 py-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Was this helpful?</span>
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => sendFeedback("positive")} aria-label="Helpful">
                  <ThumbsUp className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => sendFeedback("negative")} aria-label="Not helpful">
                  <ThumbsDown className="h-3.5 w-3.5" />
                </Button>
                {feedbackRating === "negative" && (
                  <Input
                    value={feedbackComment}
                    onChange={(event) => setFeedbackComment(event.target.value)}
                    placeholder="What could be improved?"
                    className="h-7 min-w-32 flex-1 text-xs"
                  />
                )}
                {feedbackRating === "negative" && (
                  <Button size="sm" className="h-7 text-xs" onClick={() => sendFeedback("negative")} disabled={submitFeedback.isPending}>
                    Send
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="p-3 bg-background border-t border-border shrink-0">
            <form onSubmit={handleSend} className="relative">
              <Input 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message..."
                disabled={sendMessage.isPending || !convoId || convo?.status === 'closed'}
                className="pr-12 rounded-full bg-muted/50 border-transparent focus-visible:ring-1 focus-visible:ring-primary shadow-none"
              />
              <Button 
                type="submit" 
                size="icon"
                disabled={!input.trim() || sendMessage.isPending || !convoId || convo?.status === 'closed'}
                className="absolute right-1 top-1 h-7 w-7 rounded-full shadow-none border-0"
                style={{ backgroundColor: ctaColor, color: onCta }}
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
