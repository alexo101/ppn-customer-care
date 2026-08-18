import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { 
  useListConversations, 
  useGetConversation, 
  useListMessages, 
  useListConversationLogs,
  useSendMessage,
  useCreateConversation,
  getListConversationsQueryKey
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { 
  Terminal, 
  Plus, 
  Search, 
  MessageSquare, 
  Settings2,
  Clock,
  CheckCircle2,
  AlertCircle,
  Cpu,
  BrainCircuit,
  Bot,
  User,
  PanelRightClose,
  PanelRightOpen,
  Send,
  Loader2,
  Info
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export default function Chat() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debugOpen, setDebugOpen] = useState(true);
  
  const queryClient = useQueryClient();
  const { data: conversations = [], isLoading: loadingConvos } = useListConversations();
  
  const filteredConvos = conversations.filter(c => 
    c.id.toLowerCase().includes(search.toLowerCase()) || 
    (c.metadata as any)?.subject?.toLowerCase().includes(search.toLowerCase())
  );

  const createConvo = useCreateConversation();
  
  const handleCreate = () => {
    createConvo.mutate({ 
      data: { metadata: { subject: "New Support Query", source: "console" } }
    }, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        setActiveId(data.id);
      }
    });
  };

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Thread List */}
      <div className="w-72 flex-shrink-0 border-r border-border bg-card flex flex-col h-full z-10">
        <div className="h-14 flex items-center px-4 border-b border-border justify-between shrink-0">
          <div className="font-medium text-sm">Active Threads</div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCreate} disabled={createConvo.isPending}>
            {createConvo.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </Button>
        </div>
        <div className="p-3 border-b border-border shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2 text-muted-foreground" />
            <Input 
              placeholder="Search ID or subject..." 
              className="pl-8 h-8 text-xs bg-background shadow-none"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {loadingConvos ? (
              <div className="p-4 text-center text-xs text-muted-foreground font-mono">LOADING_THREADS...</div>
            ) : filteredConvos.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">No conversations found.</div>
            ) : (
              filteredConvos.map(convo => (
                <button
                  key={convo.id}
                  onClick={() => setActiveId(convo.id)}
                  className={cn(
                    "w-full text-left p-3 rounded-md transition-colors text-sm flex flex-col gap-1.5 border",
                    activeId === convo.id 
                      ? "bg-primary/5 border-primary/20" 
                      : "bg-background border-transparent hover:border-border hover:bg-card"
                  )}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[120px]">{convo.id.split('-')[0]}</span>
                    <StatusBadge status={convo.status} />
                  </div>
                  <div className="font-medium truncate text-xs">{(convo.metadata as any)?.subject || 'Untitled Query'}</div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {format(new Date(convo.lastActivityAt), 'HH:mm - MMM d')}
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      {activeId ? (
        <ActiveChat 
          conversationId={activeId} 
          debugOpen={debugOpen} 
          setDebugOpen={setDebugOpen} 
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground bg-background">
          <MessageSquare className="w-12 h-12 mb-4 opacity-20" />
          <p className="text-sm">Select a thread to view details</p>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    pending_clarification: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    escalated: "bg-destructive/10 text-destructive border-destructive/20",
    resolved: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    closed: "bg-muted text-muted-foreground border-border",
  };
  
  return (
    <span className={cn("text-[9px] px-1.5 py-0.5 rounded-sm border uppercase font-mono tracking-wider", styles[status] || styles.closed)}>
      {status.replace('_', ' ')}
    </span>
  );
}

function ActiveChat({ 
  conversationId, 
  debugOpen, 
  setDebugOpen 
}: { 
  conversationId: string;
  debugOpen: boolean;
  setDebugOpen: (v: boolean) => void;
}) {
  const { data: convo } = useGetConversation(conversationId);
  const { data: messages = [], refetch: refetchMessages } = useListMessages(conversationId);
  const { data: logs = [], refetch: refetchLogs } = useListConversationLogs(conversationId);
  
  const sendMessage = useSendMessage();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const queryClient = useQueryClient();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sendMessage.isPending) return;
    
    sendMessage.mutate({
      id: conversationId,
      data: { content: input }
    }, {
      onSuccess: () => {
        setInput('');
        refetchMessages();
        refetchLogs();
        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
      }
    });
  };

  return (
    <div className="flex-1 flex h-full overflow-hidden">
      {/* Chat Window */}
      <div className={cn("flex flex-col h-full bg-background transition-all duration-300", debugOpen ? "w-2/3" : "w-full")}>
        <div className="h-14 flex items-center justify-between px-6 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="font-medium text-sm">{(convo?.metadata as any)?.subject || 'Conversation'}</h2>
            {convo && <StatusBadge status={convo.status} />}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setDebugOpen(!debugOpen)}>
              {debugOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1 p-6" ref={scrollRef}>
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((msg, i) => {
              const isUser = msg.sender === 'user';
              return (
                <div key={msg.id} className={cn("flex gap-4", isUser ? "flex-row-reverse" : "flex-row")}>
                  <div className={cn(
                    "w-8 h-8 rounded-md flex items-center justify-center shrink-0 border",
                    isUser ? "bg-primary/10 border-primary/20 text-primary" : "bg-card border-border text-foreground"
                  )}>
                    {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>
                  <div className={cn(
                    "flex flex-col gap-1 max-w-[80%]",
                    isUser ? "items-end" : "items-start"
                  )}>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                      <span>{isUser ? 'USER' : 'ORCHESTRATOR'}</span>
                      <span>{format(new Date(msg.createdAt), 'HH:mm:ss')}</span>
                    </div>
                    <div className={cn(
                      "p-3 rounded-lg text-sm border",
                      isUser 
                        ? "bg-primary text-primary-foreground border-primary rounded-tr-sm" 
                        : "bg-card border-border rounded-tl-sm text-card-foreground shadow-sm"
                    )}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              );
            })}
            
            {sendMessage.isPending && (
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 border bg-card border-border text-foreground">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  PROCESSING...
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-border bg-card shrink-0">
          <form onSubmit={handleSend} className="max-w-3xl mx-auto relative">
            <Input 
              placeholder="Send message to orchestrator..." 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={sendMessage.isPending || convo?.status === 'closed'}
              className="pr-12 bg-background h-10 shadow-none border-border focus-visible:ring-1 focus-visible:ring-primary/50 text-sm"
            />
            <Button 
              type="submit" 
              size="icon" 
              disabled={!input.trim() || sendMessage.isPending || convo?.status === 'closed'}
              className="absolute right-1 top-1 h-8 w-8 shadow-none"
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </div>

      {/* Debug Panel */}
      {debugOpen && (
        <div className="w-1/3 flex-shrink-0 border-l border-border bg-sidebar text-sidebar-foreground flex flex-col z-10 h-full overflow-hidden">
          <div className="h-14 flex items-center px-4 border-b border-sidebar-border bg-sidebar shrink-0">
            <Terminal className="w-4 h-4 mr-2 text-sidebar-primary" />
            <span className="font-mono text-xs uppercase tracking-wider font-medium">Orchestrator Telemetry</span>
          </div>
          
          <Tabs defaultValue="logs" className="flex-1 flex flex-col h-full overflow-hidden">
            <TabsList className="w-full justify-start rounded-none border-b border-sidebar-border h-10 bg-sidebar/50 px-2 shrink-0">
              <TabsTrigger value="logs" className="text-xs font-mono data-[state=active]:bg-sidebar-accent data-[state=active]:text-sidebar-accent-foreground h-7">LOGS</TabsTrigger>
              <TabsTrigger value="metadata" className="text-xs font-mono data-[state=active]:bg-sidebar-accent data-[state=active]:text-sidebar-accent-foreground h-7">METADATA</TabsTrigger>
            </TabsList>
            
            <TabsContent value="logs" className="flex-1 m-0 p-0 overflow-hidden outline-none">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-4">
                  {logs.length === 0 ? (
                    <div className="text-center text-xs text-sidebar-foreground/50 font-mono py-8">NO_LOGS_FOUND</div>
                  ) : (
                    logs.map((log) => (
                      <div key={log.id} className="border border-sidebar-border bg-sidebar-accent/20 rounded-md overflow-hidden">
                        <div className="bg-sidebar-accent/40 px-3 py-2 border-b border-sidebar-border flex items-center justify-between text-[10px] font-mono">
                          <div className="flex items-center gap-2">
                            <Cpu className="w-3 h-3 text-sidebar-primary" />
                            <span>{format(new Date(log.createdAt), 'HH:mm:ss.SSS')}</span>
                          </div>
                          <Badge variant="outline" className="text-[9px] h-4 rounded-sm border-sidebar-border text-sidebar-foreground/70">
                            {log.resolutionStatus}
                          </Badge>
                        </div>
                        <div className="p-3 text-xs space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <div className="text-[9px] uppercase font-mono text-sidebar-foreground/50 mb-1">Intent</div>
                              <div className="font-medium text-sidebar-primary truncate">{log.detectedCategory}</div>
                            </div>
                            <div>
                              <div className="text-[9px] uppercase font-mono text-sidebar-foreground/50 mb-1">Confidence</div>
                              <div className="font-mono">{Math.round(log.confidenceScore * 100)}%</div>
                            </div>
                          </div>
                          
                          {log.ruleUsed && (
                            <div>
                              <div className="text-[9px] uppercase font-mono text-sidebar-foreground/50 mb-1">Rule Applied</div>
                              <div className="font-mono text-xs bg-sidebar-accent/40 p-1.5 rounded border border-sidebar-border truncate">
                                {log.ruleUsed}
                              </div>
                            </div>
                          )}
                          
                          {log.dataSourcesQueried && log.dataSourcesQueried.length > 0 && (
                            <div>
                              <div className="text-[9px] uppercase font-mono text-sidebar-foreground/50 mb-1">Sources</div>
                              <div className="flex flex-wrap gap-1">
                                {log.dataSourcesQueried.map(src => (
                                  <span key={src} className="px-1.5 py-0.5 rounded-sm bg-sidebar-accent/60 border border-sidebar-border text-[9px] font-mono">
                                    {src}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          <div className="flex items-center justify-between text-[9px] font-mono text-sidebar-foreground/50 pt-2 border-t border-sidebar-border/50">
                            <span>{log.llmModel || 'gpt-4o'}</span>
                            <span>{log.latencyMs}ms</span>
                            <span>{log.tokensUsed} tokens</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="metadata" className="flex-1 m-0 p-4 overflow-hidden outline-none">
              <ScrollArea className="h-full">
                <div className="space-y-4">
                  <div>
                    <div className="text-[10px] uppercase font-mono text-sidebar-foreground/50 mb-2">Internal ID</div>
                    <div className="font-mono text-xs p-2 bg-sidebar-accent/30 rounded border border-sidebar-border break-all">
                      {convo?.id}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-mono text-sidebar-foreground/50 mb-2">Raw Metadata</div>
                    <pre className="font-mono text-[10px] p-3 bg-sidebar-accent/30 rounded border border-sidebar-border overflow-x-auto text-sidebar-primary/80">
                      {JSON.stringify(convo?.metadata, null, 2)}
                    </pre>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-sidebar-border/50">
                    <div>
                      <div className="text-[10px] uppercase font-mono text-sidebar-foreground/50 mb-1">Created</div>
                      <div className="text-xs">{convo ? format(new Date(convo.createdAt), 'MMM d, HH:mm:ss') : '-'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-mono text-sidebar-foreground/50 mb-1">Resolved</div>
                      <div className="text-xs">{convo?.resolvedAt ? format(new Date(convo.resolvedAt), 'MMM d, HH:mm:ss') : 'N/A'}</div>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
