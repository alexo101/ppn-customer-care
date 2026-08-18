import { useState, useRef, useEffect } from 'react';
import { 
  useCreateConversation, 
  useSendMessage, 
  useListMessages,
  useGetConversation
} from '@workspace/api-client-react';
import { Send, Bot, User, Loader2, Minus, X, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

export default function Widget() {
  const [isOpen, setIsOpen] = useState(false);
  const [convoId, setConvoId] = useState<string | null>(null);
  
  const createConvo = useCreateConversation();
  const sendMessage = useSendMessage();
  
  const { data: convo } = useGetConversation(convoId ?? '');
  const { data: messages = [], refetch } = useListMessages(convoId ?? '');
  
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const handleOpen = () => {
    setIsOpen(true);
    if (!convoId && !createConvo.isPending) {
      createConvo.mutate({ 
        data: { metadata: { source: "widget" } }
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
      data: { content: input }
    }, {
      onSuccess: () => {
        setInput('');
        refetch();
      }
    });
  };

  return (
    <div className="h-screen w-full bg-slate-100 relative flex flex-col font-sans">
      <div className="absolute inset-0 p-8">
        <h1 className="text-2xl font-bold text-slate-800">Your App Website</h1>
        <p className="text-slate-500 mt-2 max-w-lg">
          This is a simulated host website. The widget in the bottom right is the embeddable piece powered by the orchestrator.
        </p>
      </div>

      {!isOpen && (
        <Button 
          onClick={handleOpen}
          className="absolute bottom-6 right-6 h-14 w-14 rounded-full shadow-xl bg-primary hover:bg-primary/90 flex items-center justify-center p-0"
        >
          <MessageSquare className="w-6 h-6 text-primary-foreground" />
        </Button>
      )}

      {isOpen && (
        <div className="absolute bottom-6 right-6 w-[350px] h-[550px] bg-background border border-border shadow-2xl rounded-xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 fade-in duration-300">
          {/* Header */}
          <div className="h-14 bg-primary text-primary-foreground px-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5" />
              <div className="font-medium">Support Assistant</div>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-primary-foreground hover:bg-black/10 hover:text-primary-foreground" onClick={() => setIsOpen(false)}>
                <Minus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Chat Area */}
          <ScrollArea className="flex-1 p-4 bg-muted/30" ref={scrollRef}>
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
                        ? "bg-primary text-primary-foreground rounded-tr-sm" 
                        : "bg-card border border-border text-card-foreground rounded-tl-sm shadow-sm"
                    )}>
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
                className="absolute right-1 top-1 h-7 w-7 rounded-full shadow-none"
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
