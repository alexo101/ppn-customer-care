import { useState } from 'react';
import { useLocation } from 'wouter';
import { 
  useGetAnalyticsSummary,
  useListAnalyticsLogs,
  useListConversations,
  useListCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  useListRules,
  useCreateRule,
  useUpdateRule,
  useDeleteRule,
  useListSources,
  useListConnectors,
  getListCategoriesQueryKey,
  getListRulesQueryKey
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  Activity, Users, MessageSquare, AlertTriangle, CheckCircle, 
  Search, Plus, Filter, MoreVertical, Edit2, Trash, ExternalLink,
  Book, Database, Network
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter 
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';

export default function Admin() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab') || 'dashboard';

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      <div className="h-14 px-6 border-b border-border flex items-center justify-between bg-card shrink-0">
        <h1 className="text-lg font-medium tracking-tight capitalize">{tab}</h1>
      </div>
      
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto">
          {tab === 'dashboard' && <DashboardTab />}
          {tab === 'conversations' && <ConversationsTab />}
          {tab === 'categories' && <CategoriesTab />}
          {tab === 'rules' && <RulesTab />}
          {tab === 'sources' && <SourcesTab />}
        </div>
      </div>
    </div>
  );
}

function DashboardTab() {
  const { data: stats } = useGetAnalyticsSummary();
  const { data: logs = [] } = useListAnalyticsLogs({ limit: 10 });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Conversations" value={stats?.totalConversations ?? 0} icon={MessageSquare} />
        <StatCard title="Active Now" value={stats?.activeConversations ?? 0} icon={Activity} />
        <StatCard title="Avg Confidence" value={`${Math.round((stats?.avgConfidenceScore ?? 0) * 100)}%`} icon={CheckCircle} />
        <StatCard title="Escalations" value={stats?.escalatedConversations ?? 0} icon={AlertTriangle} variant="destructive" />
      </div>

      <Card className="shadow-none border-border">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent Telemetry Logs</CardTitle>
          <CardDescription className="text-xs">Live classification stream</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[100px] text-xs">Time</TableHead>
                <TableHead className="text-xs">Intent</TableHead>
                <TableHead className="text-xs">Confidence</TableHead>
                <TableHead className="text-xs">Rule Applied</TableHead>
                <TableHead className="text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id} className="text-xs">
                  <TableCell className="font-mono text-muted-foreground">{format(new Date(log.createdAt), 'HH:mm:ss')}</TableCell>
                  <TableCell className="font-medium text-primary">{log.detectedCategory}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${log.confidenceScore > 0.8 ? 'bg-emerald-500' : log.confidenceScore > 0.5 ? 'bg-amber-500' : 'bg-destructive'}`} 
                          style={{ width: `${log.confidenceScore * 100}%` }}
                        />
                      </div>
                      <span className="font-mono">{Math.round(log.confidenceScore * 100)}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground truncate max-w-[200px]">{log.ruleUsed || '-'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider h-5">{log.resolutionStatus}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, variant = "default" }: any) {
  return (
    <Card className="shadow-none border-border">
      <CardContent className="p-6 flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium">{title}</p>
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${variant === 'destructive' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
          <Icon className="w-5 h-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function ConversationsTab() {
  const [filter, setFilter] = useState('');
  const { data: convos = [] } = useListConversations(filter ? { status: filter } : {});

  return (
    <Card className="shadow-none border-border">
      <CardHeader className="flex flex-row items-center justify-between py-4">
        <div>
          <CardTitle className="text-sm font-medium">All Conversations</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Input 
            placeholder="Search..." 
            className="w-64 h-8 text-xs bg-background"
          />
          <select 
            className="h-8 text-xs border border-input bg-background rounded-md px-2"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="escalated">Escalated</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      </CardHeader>
      <div className="border-t border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-[120px]">ID</TableHead>
              <TableHead className="text-xs">Subject</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Last Active</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {convos.map((convo) => (
              <TableRow key={convo.id} className="text-xs">
                <TableCell className="font-mono text-muted-foreground">{convo.id.split('-')[0]}</TableCell>
                <TableCell className="font-medium">{(convo.metadata as any)?.subject || 'Untitled'}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider h-5 bg-card">
                    {convo.status.replace('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{format(new Date(convo.lastActivityAt), 'MMM d, HH:mm')}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-6 w-6" asChild>
                    <a href={`/chat?id=${convo.id}`}><ExternalLink className="w-3.5 h-3.5" /></a>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function CategoriesTab() {
  const { data: categories = [] } = useListCategories();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const createCategory = useCreateCategory();

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createCategory.mutate({
      data: {
        name: formData.get('name') as string,
        description: formData.get('description') as string,
        examples: (formData.get('examples') as string).split(',').map(s => s.trim()),
        keywords: (formData.get('keywords') as string).split(',').map(s => s.trim()),
        confidenceThreshold: Number(formData.get('threshold')) / 100,
        isEnabled: true,
        sortOrder: 0
      }
    }, {
      onSuccess: () => {
        setOpen(false);
        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
      }
    });
  };

  return (
    <Card className="shadow-none border-border">
      <CardHeader className="flex flex-row items-center justify-between py-4">
        <div>
          <CardTitle className="text-sm font-medium">Intent Categories</CardTitle>
          <CardDescription className="text-xs">Classification taxonomy for the orchestrator</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-8 text-xs font-mono"><Plus className="w-3.5 h-3.5 mr-1"/> NEW_INTENT</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create Intent Category</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Name</Label>
                  <Input name="name" placeholder="e.g. billing_refund" required className="h-8 text-xs font-mono" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Threshold (%)</Label>
                  <Input name="threshold" type="number" defaultValue="75" required className="h-8 text-xs font-mono" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Description</Label>
                <Input name="description" placeholder="Short description" required className="h-8 text-xs" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Examples (comma separated)</Label>
                <Textarea name="examples" placeholder="I want my money back, refund me" required className="h-16 text-xs" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Keywords (comma separated)</Label>
                <Input name="keywords" placeholder="refund, money, return" required className="h-8 text-xs font-mono" />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createCategory.isPending}>Save Category</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <div className="border-t border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Intent</TableHead>
              <TableHead className="text-xs">Description</TableHead>
              <TableHead className="text-xs">Threshold</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((cat) => (
              <TableRow key={cat.id} className="text-xs">
                <TableCell className="font-mono text-primary font-medium">{cat.name}</TableCell>
                <TableCell className="text-muted-foreground">{cat.description}</TableCell>
                <TableCell className="font-mono">{Math.round(cat.confidenceThreshold * 100)}%</TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[9px] uppercase font-mono tracking-wider h-5 ${cat.isEnabled ? 'text-emerald-500 border-emerald-500/20' : 'text-muted-foreground'}`}>
                    {cat.isEnabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-6 w-6"><MoreVertical className="w-3.5 h-3.5" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function RulesTab() {
  const { data: rules = [] } = useListRules();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const createRule = useCreateRule();

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createRule.mutate({
      data: {
        name: formData.get('name') as string,
        description: formData.get('description') as string,
        promptTemplate: formData.get('prompt') as string,
        requiresClarificationPrompt: formData.get('clarification') as string || undefined,
        escalationTrigger: formData.get('escalate') === 'on',
        priority: Number(formData.get('priority')),
        isEnabled: true,
      }
    }, {
      onSuccess: () => {
        setOpen(false);
        queryClient.invalidateQueries({ queryKey: getListRulesQueryKey() });
      }
    });
  };

  return (
    <Card className="shadow-none border-border">
      <CardHeader className="flex flex-row items-center justify-between py-4">
        <div>
          <CardTitle className="text-sm font-medium">Orchestration Rules</CardTitle>
          <CardDescription className="text-xs">Logic flows for resolution</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-8 text-xs font-mono"><Plus className="w-3.5 h-3.5 mr-1"/> ADD_RULE</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Define Rule</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Rule ID / Name</Label>
                  <Input name="name" placeholder="e.g. process_refund_flow" required className="h-8 text-xs font-mono" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Priority</Label>
                  <Input name="priority" type="number" defaultValue="10" required className="h-8 text-xs font-mono" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Description</Label>
                <Input name="description" required className="h-8 text-xs" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Prompt Template (LLM instructions)</Label>
                <Textarea name="prompt" className="h-24 text-xs font-mono bg-muted/50" required placeholder="You are handling a {{intent}}. Use these facts: {{context}}" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Clarification Prompt (Optional)</Label>
                <Input name="clarification" className="h-8 text-xs" placeholder="What is your order number?" />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <Switch name="escalate" id="escalate" />
                <Label htmlFor="escalate" className="text-xs">Trigger human escalation if this rule fails</Label>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createRule.isPending}>Save Rule</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <div className="border-t border-border p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {rules.map((rule) => (
          <div key={rule.id} className="border border-border rounded-md p-4 bg-background space-y-3 relative">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-mono text-sm font-medium text-primary">{rule.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{rule.description}</p>
              </div>
              <Badge variant="secondary" className="text-[10px] font-mono h-5">P{rule.priority}</Badge>
            </div>
            
            <div className="bg-muted p-2 rounded text-[10px] font-mono text-muted-foreground line-clamp-2">
              {rule.promptTemplate}
            </div>
            
            <div className="flex items-center gap-4 text-xs">
              {rule.escalationTrigger && (
                <span className="flex items-center gap-1 text-destructive">
                  <AlertTriangle className="w-3.5 h-3.5" /> Escalates
                </span>
              )}
              {rule.requiresClarificationPrompt && (
                <span className="flex items-center gap-1 text-amber-500">
                  <MessageSquare className="w-3.5 h-3.5" /> Clarifies
                </span>
              )}
            </div>
            
            <div className="absolute top-4 right-4 flex gap-1">
              {/* Actions could go here */}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SourcesTab() {
  const { data: sources = [] } = useListSources();
  const { data: connectors = [] } = useListConnectors();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card className="shadow-none border-border">
        <CardHeader className="py-4 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Book className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-medium">Knowledge Sources</CardTitle>
          </div>
          <Button variant="outline" size="sm" className="h-7 text-[10px] font-mono"><Plus className="w-3 h-3 mr-1"/> ADD</Button>
        </CardHeader>
        <div className="border-t border-border">
          <Table>
            <TableBody>
              {sources.map(src => (
                <TableRow key={src.id} className="text-xs hover:bg-transparent">
                  <TableCell className="font-medium">{src.name}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-[10px] uppercase">{src.sourceType}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline" className={`text-[9px] uppercase font-mono tracking-wider h-5 ${src.isEnabled ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                      {src.isEnabled ? 'Live' : 'Off'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {sources.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-4">No sources configured.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="shadow-none border-border">
        <CardHeader className="py-4 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-medium">API Connectors</CardTitle>
          </div>
          <Button variant="outline" size="sm" className="h-7 text-[10px] font-mono"><Plus className="w-3 h-3 mr-1"/> ADD</Button>
        </CardHeader>
        <div className="border-t border-border">
          <Table>
            <TableBody>
              {connectors.map(conn => (
                <TableRow key={conn.id} className="text-xs hover:bg-transparent">
                  <TableCell className="font-medium">{conn.name}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-[10px] truncate max-w-[150px]">{conn.endpointPattern}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline" className={`text-[9px] uppercase font-mono tracking-wider h-5 ${conn.isEnabled ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                      {conn.isEnabled ? 'Live' : 'Off'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {connectors.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-4">No connectors configured.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
