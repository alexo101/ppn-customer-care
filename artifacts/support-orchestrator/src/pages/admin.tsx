import { useState } from 'react';
import { Redirect } from 'wouter';
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
  getListRulesQueryKey,
  type IntentCategory
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  Activity, Users, MessageSquare, AlertTriangle, CheckCircle, 
  Search, Plus, Filter, MoreVertical, Edit2, Trash, ExternalLink,
  Book, Database, Network, Layers, FolderTree, Check, X, FolderInput,
  ChevronRight, ArrowRightLeft, Folder
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';

export default function Admin() {
  return <Redirect to="/agents" />;
}

export function DashboardTab() {
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

export function ConversationsTab({ agentId }: { agentId: string }) {
  const [filter, setFilter] = useState('');
  const { data: convos = [] } = useListConversations({ agentId, ...(filter ? { status: filter } : {}) });

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
                    <a href={`/agents/${agentId}/chat?id=${convo.id}`}><ExternalLink className="w-3.5 h-3.5" /></a>
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

export function CategoriesTab({ agentId }: { agentId: string }) {
  const { data: categories = [] } = useListCategories({ agentId });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Category inline states
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [categoryToDelete, setCategoryToDelete] = useState<IntentCategory | null>(null);

  // Subcategory inline states
  const [isAddingSubcategory, setIsAddingSubcategory] = useState(false);
  const [newSubcategoryName, setNewSubcategoryName] = useState('');
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editingSubName, setEditingSubName] = useState('');

  // Parent categories (items with no parentId)
  const parentCategories = categories.filter((c) => !c.parentId);
  const filteredParents = parentCategories.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Active selected parent category
  const activeSelectedCategory =
    parentCategories.find((c) => c.id === selectedCategoryId) ||
    parentCategories[0] ||
    null;

  // Subcategories for active selected category
  const currentSubcategories = activeSelectedCategory
    ? categories.filter((c) => c.parentId === activeSelectedCategory.id)
    : [];

  // Other parent categories available for moving subcategories
  const otherParentCategories = activeSelectedCategory
    ? parentCategories.filter((c) => c.id !== activeSelectedCategory.id)
    : [];

  const handleToggleCategory = (cat: IntentCategory, checked: boolean) => {
    updateCategory.mutate(
      { id: cat.id, data: { isEnabled: checked } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey({ agentId }) });
        },
      }
    );
  };

  const handleToggleSub = (sub: IntentCategory, checked: boolean) => {
    updateCategory.mutate(
      { id: sub.id, data: { isEnabled: checked } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey({ agentId }) });
        },
      }
    );
  };

  const handleSaveNewCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;

    createCategory.mutate(
      {
        data: {
          name: trimmed,
          agentId,
          parentId: null,
          description: '',
          examples: [],
          keywords: [],
          confidenceThreshold: 0.7,
          isEnabled: true,
          sortOrder: 0,
        },
      },
      {
        onSuccess: (created) => {
          setIsAddingCategory(false);
          setNewCategoryName('');
          setSelectedCategoryId(created.id);
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey({ agentId }) });
          toast({
            title: 'Category created',
            description: `Created "${created.name}"`,
          });
        },
      }
    );
  };

  const handleSaveEditCategory = (catId: string) => {
    const trimmed = editingCategoryName.trim();
    if (!trimmed) return;

    updateCategory.mutate(
      { id: catId, data: { name: trimmed } },
      {
        onSuccess: () => {
          setEditingCategoryId(null);
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey({ agentId }) });
          toast({
            title: 'Category updated',
            description: 'Name updated successfully',
          });
        },
      }
    );
  };

  const handleConfirmDeleteCategory = () => {
    if (!categoryToDelete) return;
    const cat = categoryToDelete;

    deleteCategory.mutate(
      { id: cat.id },
      {
        onSuccess: () => {
          setCategoryToDelete(null);
          if (selectedCategoryId === cat.id) {
            setSelectedCategoryId(null);
          }
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey({ agentId }) });
          toast({
            title: 'Category deleted',
            description: `Deleted "${cat.name}" and all its subcategories`,
          });
        },
      }
    );
  };

  const handleSaveNewSub = () => {
    const trimmed = newSubcategoryName.trim();
    if (!trimmed || !activeSelectedCategory) return;

    createCategory.mutate(
      {
        data: {
          name: trimmed,
          agentId,
          parentId: activeSelectedCategory.id,
          description: '',
          examples: [],
          keywords: [],
          confidenceThreshold: 0.7,
          isEnabled: true,
          sortOrder: 0,
        },
      },
      {
        onSuccess: (created) => {
          setIsAddingSubcategory(false);
          setNewSubcategoryName('');
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey({ agentId }) });
          toast({
            title: 'Subcategory created',
            description: `Added "${created.name}" to ${activeSelectedCategory.name}`,
          });
        },
      }
    );
  };

  const handleSaveEditSub = (subId: string) => {
    const trimmed = editingSubName.trim();
    if (!trimmed) return;

    updateCategory.mutate(
      { id: subId, data: { name: trimmed } },
      {
        onSuccess: () => {
          setEditingSubId(null);
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey({ agentId }) });
          toast({
            title: 'Subcategory updated',
            description: 'Name updated successfully',
          });
        },
      }
    );
  };

  const handleMoveSub = (sub: IntentCategory, targetCat: IntentCategory) => {
    updateCategory.mutate(
      { id: sub.id, data: { parentId: targetCat.id } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey({ agentId }) });
          toast({
            title: 'Subcategory moved',
            description: `Moved "${sub.name}" to "${targetCat.name}"`,
          });
        },
      }
    );
  };

  const handleDeleteSub = (sub: IntentCategory) => {
    deleteCategory.mutate(
      { id: sub.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey({ agentId }) });
          toast({
            title: 'Subcategory deleted',
            description: `Deleted "${sub.name}"`,
          });
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left Column: Categories */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h2 className="font-semibold text-base tracking-tight text-foreground">Categories</h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
                {parentCategories.length}
              </span>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setIsAddingCategory(true);
                setNewCategoryName('');
              }}
              className="h-8 text-xs flex items-center gap-1.5 px-3.5 rounded-md"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Category
            </Button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search categories..."
              className="pl-9 h-9 text-xs bg-background/50 border-border/80 rounded-md focus-visible:ring-1 focus-visible:ring-blue-500"
            />
          </div>

          <div className="space-y-2.5">
            {isAddingCategory && (
              <div className="border border-blue-400/80 dark:border-blue-500/80 bg-blue-50/40 dark:bg-blue-950/20 rounded-lg p-3 flex items-center gap-2 shadow-sm ring-1 ring-blue-300 dark:ring-blue-800">
                <Input
                  autoFocus
                  placeholder="New Category"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveNewCategory();
                    if (e.key === 'Escape') setIsAddingCategory(false);
                  }}
                  className="h-8 text-xs font-medium bg-background border-blue-400 focus-visible:ring-1 focus-visible:ring-blue-400"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 shrink-0"
                  onClick={handleSaveNewCategory}
                  disabled={!newCategoryName.trim() || createCategory.isPending}
                >
                  <Check className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                  onClick={() => setIsAddingCategory(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}

            {filteredParents.map((cat) => {
              const isSelected = activeSelectedCategory?.id === cat.id;
              const subs = categories.filter((c) => c.parentId === cat.id);
              const isEditing = editingCategoryId === cat.id;

              if (isEditing) {
                return (
                  <div
                    key={cat.id}
                    className="border border-blue-400/80 dark:border-blue-500/80 bg-blue-50/40 dark:bg-blue-950/20 rounded-lg p-3 flex items-center gap-2 shadow-sm ring-1 ring-blue-300 dark:ring-blue-800"
                  >
                    <div className="w-8 h-8 rounded-md bg-muted/70 flex items-center justify-center text-muted-foreground font-mono text-[11px] font-bold shrink-0 border border-border/40">
                      tg
                    </div>
                    <Input
                      autoFocus
                      value={editingCategoryName}
                      onChange={(e) => setEditingCategoryName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEditCategory(cat.id);
                        if (e.key === 'Escape') setEditingCategoryId(null);
                      }}
                      className="h-8 text-xs font-medium bg-background border-blue-400 focus-visible:ring-1 focus-visible:ring-blue-400"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 shrink-0"
                      onClick={() => handleSaveEditCategory(cat.id)}
                      disabled={!editingCategoryName.trim() || updateCategory.isPending}
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                      onClick={() => setEditingCategoryId(null)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                );
              }

              return (
                <div
                  key={cat.id}
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={cn(
                    "group rounded-lg p-3 flex items-center justify-between cursor-pointer transition-all border shadow-sm select-none",
                    isSelected
                      ? "border-blue-400/90 dark:border-blue-500/90 bg-blue-50/40 dark:bg-blue-950/20 ring-1 ring-blue-300 dark:ring-blue-800"
                      : "border-border/80 bg-card hover:border-blue-200 dark:hover:border-blue-900/50 hover:bg-accent/20"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <div className="w-8 h-8 rounded-md bg-muted/60 dark:bg-muted/40 flex items-center justify-center text-muted-foreground font-mono text-[11px] font-bold shrink-0 border border-border/40">
                      tg
                    </div>
                    <span className="font-medium text-sm text-foreground truncate">{cat.name}</span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground font-normal">
                      {subs.length} {subs.length === 1 ? 'sub' : 'subs'}
                    </span>
                    <span
                      className={cn(
                        "text-[11px] font-semibold tracking-wider uppercase",
                        cat.isEnabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/60"
                      )}
                    >
                      {cat.isEnabled ? 'ON' : 'OFF'}
                    </span>
                    <Switch
                      checked={cat.isEnabled}
                      onCheckedChange={(checked) => handleToggleCategory(cat, checked)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground opacity-60 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="text-xs">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCategoryId(cat.id);
                            setEditingCategoryName(cat.name);
                          }}
                          className="gap-2 cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" /> Edit Name
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setCategoryToDelete(cat);
                          }}
                          className="gap-2 text-destructive focus:text-destructive cursor-pointer"
                        >
                          <Trash className="w-3.5 h-3.5" /> Delete Category
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}

            {filteredParents.length === 0 && !isAddingCategory && (
              <div className="border border-dashed border-border rounded-lg p-6 text-center text-xs text-muted-foreground">
                {searchQuery
                  ? 'No categories matching search.'
                  : 'No categories yet. Click "+ Add Category" to create one.'}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Subcategories */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          {!activeSelectedCategory ? (
            <div className="border border-dashed border-border rounded-xl p-12 text-center text-xs text-muted-foreground space-y-2">
              <FolderTree className="w-8 h-8 text-muted-foreground/50 mx-auto" />
              <p>Select or create a category on the left to manage its subcategories.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <div className="text-emerald-600 dark:text-emerald-400 shrink-0">
                    <FolderTree className="w-5 h-5" />
                  </div>
                  <div className="truncate text-base">
                    <span className="font-semibold text-foreground">{activeSelectedCategory.name}</span>
                    <span className="text-muted-foreground font-normal ml-1.5">— Subcategories</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground shrink-0">
                    {currentSubcategories.length}
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setIsAddingSubcategory(true);
                    setNewSubcategoryName('');
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium h-8 px-3.5 rounded-md flex items-center gap-1.5 shadow-sm transition-colors shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Subcategory
                </Button>
              </div>

              <div className="space-y-2.5">
                {currentSubcategories.map((sub) => {
                  const isEditing = editingSubId === sub.id;

                  if (isEditing) {
                    return (
                      <div
                        key={sub.id}
                        className="border border-emerald-400/80 dark:border-emerald-500/80 bg-emerald-50/30 dark:bg-emerald-950/15 rounded-lg p-3 flex items-center gap-2 shadow-sm ring-1 ring-emerald-300 dark:ring-emerald-800"
                      >
                        <div className="w-2 h-2 rounded-full bg-emerald-500 ml-1 mr-2 shrink-0" />
                        <Input
                          autoFocus
                          value={editingSubName}
                          onChange={(e) => setEditingSubName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEditSub(sub.id);
                            if (e.key === 'Escape') setEditingSubId(null);
                          }}
                          className="h-8 text-xs font-medium bg-background border-emerald-400 focus-visible:ring-1 focus-visible:ring-emerald-400"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 shrink-0"
                          onClick={() => handleSaveEditSub(sub.id)}
                          disabled={!editingSubName.trim() || updateCategory.isPending}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                          onClick={() => setEditingSubId(null)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={sub.id}
                      className="group rounded-lg p-3 flex items-center justify-between border border-border/80 bg-card hover:border-border transition-all shadow-sm select-none"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <div
                          className={cn(
                            "w-2 h-2 rounded-full shrink-0 ml-1 mr-1",
                            sub.isEnabled ? "bg-emerald-500" : "bg-muted-foreground/30"
                          )}
                        />
                        <span className="font-medium text-sm text-foreground truncate">{sub.name}</span>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <span
                          className={cn(
                            "text-[11px] font-semibold tracking-wider uppercase",
                            sub.isEnabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/60"
                          )}
                        >
                          {sub.isEnabled ? 'ON' : 'OFF'}
                        </span>
                        <Switch
                          checked={sub.isEnabled}
                          onCheckedChange={(checked) => handleToggleSub(sub, checked)}
                        />

                        {/* Move subcategory dropdown */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground gap-1 border border-transparent hover:border-border"
                            >
                              <FolderInput className="w-3.5 h-3.5 text-muted-foreground" />
                              Move
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="text-xs min-w-[180px]">
                            <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">
                              Move to category:
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {otherParentCategories.length === 0 ? (
                              <div className="px-2 py-1.5 text-xs text-muted-foreground italic">
                                No other categories
                              </div>
                            ) : (
                              otherParentCategories.map((targetCat) => (
                                <DropdownMenuItem
                                  key={targetCat.id}
                                  onClick={() => handleMoveSub(sub, targetCat)}
                                  className="gap-2 cursor-pointer text-xs"
                                >
                                  <Layers className="w-3.5 h-3.5 text-blue-500" />
                                  <span className="truncate">{targetCat.name}</span>
                                </DropdownMenuItem>
                              ))
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground opacity-60 group-hover:opacity-100 transition-opacity"
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="text-xs">
                            <DropdownMenuItem
                              onClick={() => {
                                setEditingSubId(sub.id);
                                setEditingSubName(sub.name);
                              }}
                              className="gap-2 cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" /> Edit Name
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDeleteSub(sub)}
                              className="gap-2 text-destructive focus:text-destructive cursor-pointer"
                            >
                              <Trash className="w-3.5 h-3.5" /> Delete Subcategory
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}

                {isAddingSubcategory && (
                  <div className="border border-emerald-400/80 dark:border-emerald-500/80 bg-emerald-50/30 dark:bg-emerald-950/15 rounded-lg p-3 flex items-center gap-2 shadow-sm ring-1 ring-emerald-300 dark:ring-emerald-800">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 ml-1 mr-2 shrink-0" />
                    <Input
                      autoFocus
                      placeholder="New Subcategory"
                      value={newSubcategoryName}
                      onChange={(e) => setNewSubcategoryName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveNewSub();
                        if (e.key === 'Escape') setIsAddingSubcategory(false);
                      }}
                      className="h-8 text-xs font-medium bg-background border-emerald-400 focus-visible:ring-1 focus-visible:ring-emerald-400"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 shrink-0"
                      onClick={handleSaveNewSub}
                      disabled={!newSubcategoryName.trim() || createCategory.isPending}
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                      onClick={() => setIsAddingSubcategory(false)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}

                {currentSubcategories.length === 0 && !isAddingSubcategory && (
                  <div className="border border-dashed border-border rounded-lg p-8 text-center text-xs text-muted-foreground space-y-1">
                    <p>
                      No subcategories in{' '}
                      <span className="font-semibold text-foreground">
                        {activeSelectedCategory.name}
                      </span>{' '}
                      yet.
                    </p>
                    <p>
                      Click{' '}
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        + Add Subcategory
                      </span>{' '}
                      to create one.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Delete Category Confirmation Modal */}
      <AlertDialog
        open={!!categoryToDelete}
        onOpenChange={(open) => !open && setCategoryToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-semibold text-foreground">
                "{categoryToDelete?.name}"
              </span>
              ?
              {categoryToDelete &&
                categories.filter((c) => c.parentId === categoryToDelete.id).length > 0 && (
                  <span className="block mt-2 text-destructive font-medium">
                    This category contains{' '}
                    {categories.filter((c) => c.parentId === categoryToDelete.id).length} nested
                    subcategory(ies) which will also be permanently deleted.
                  </span>
                )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteCategory}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Category
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function RulesTab({ agentId }: { agentId: string }) {
  const { data: rules = [] } = useListRules({ agentId });
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const createRule = useCreateRule();

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createRule.mutate({
      data: {
        name: formData.get('name') as string,
        agentId,
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
        queryClient.invalidateQueries({ queryKey: getListRulesQueryKey({ agentId }) });
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

export function SourcesTab({ agentId }: { agentId: string }) {
  const { data: sources = [] } = useListSources({ agentId });
  const { data: connectors = [] } = useListConnectors({ agentId });

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
