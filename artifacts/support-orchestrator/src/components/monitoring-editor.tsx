import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useGetAgent,
  useListConversations,
  useListQuestions,
  type Conversation,
  type Question,
} from "@workspace/api-client-react";
import { format, startOfDay, subDays } from "date-fns";
import type { DateRange } from "react-day-picker";
import {
  Activity,
  AlertTriangle,
  Calendar as CalendarIcon,
  ExternalLink,
  HelpCircle,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TypeFilter = "all" | "question" | "unanswered" | "escalated";
type DatePreset = "all" | "today" | "7d" | "30d" | "90d" | "custom";

const TYPE_OPTIONS: { id: TypeFilter; label: string }[] = [
  { id: "all", label: "All types" },
  { id: "question", label: "Questions" },
  { id: "unanswered", label: "Unanswered" },
  { id: "escalated", label: "Escalated" },
];

const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
  { id: "custom", label: "Custom range" },
];

const QUESTION_TYPE_LABEL: Record<Question["type"], string> = {
  question: "Question",
  unanswered: "Unanswered",
  escalated: "Escalated",
};

function conversationSubject(convo: Conversation): string {
  const subject = (convo.metadata as { subject?: unknown } | undefined)?.subject;
  return typeof subject === "string" && subject.trim() ? subject : "Untitled";
}

function isoDay(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function resolveDateRange(preset: DatePreset, custom?: DateRange): { fromDate?: string; toDate?: string } {
  const today = startOfDay(new Date());
  if (preset === "today") return { fromDate: isoDay(today), toDate: isoDay(today) };
  if (preset === "7d") return { fromDate: isoDay(subDays(today, 6)), toDate: isoDay(today) };
  if (preset === "30d") return { fromDate: isoDay(subDays(today, 29)), toDate: isoDay(today) };
  if (preset === "90d") return { fromDate: isoDay(subDays(today, 89)), toDate: isoDay(today) };
  if (preset === "custom" && custom?.from) {
    return {
      fromDate: isoDay(custom.from),
      toDate: isoDay(custom.to ?? custom.from),
    };
  }
  return {};
}

function conversationMatchesType(convo: Conversation, type: TypeFilter): boolean {
  if (type === "all") return true;
  if (type === "escalated") return convo.status === "escalated";
  if (type === "unanswered") return !["resolved", "closed", "escalated"].includes(convo.status);
  return convo.status === "resolved" || convo.status === "closed";
}

function statusBadgeClass(status: string): string {
  if (status === "escalated") return "bg-destructive/10 text-destructive border-destructive/20";
  if (status === "resolved" || status === "closed") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
  if (status === "pending_clarification" || status === "pending_resolution") {
    return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20";
  }
  return "bg-card";
}

function questionTypeBadgeClass(type: Question["type"]): string {
  if (type === "escalated") return "bg-destructive/10 text-destructive border-destructive/20";
  if (type === "unanswered") return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20";
  return "bg-card";
}

export function MonitoringEditor({ agentId }: { agentId: string }) {
  const { data: agent, isLoading: loadingAgent } = useGetAgent(agentId);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();

  const dateParams = useMemo(
    () => resolveDateRange(datePreset, customRange),
    [datePreset, customRange],
  );

  const { data: conversations = [], isLoading: loadingConvos } = useListConversations({
    agentId,
    source: "widget",
    limit: 200,
    ...dateParams,
  });
  const { data: questions = [], isLoading: loadingQuestions } = useListQuestions({
    agentId,
    limit: 200,
    ...dateParams,
  });

  const filteredConversations = conversations.filter((convo) => conversationMatchesType(convo, typeFilter));
  const filteredQuestions = typeFilter === "all"
    ? questions
    : questions.filter((question) => question.type === typeFilter);

  const unansweredCount = questions.filter((question) => question.type === "unanswered").length;
  const escalatedCount = questions.filter((question) => question.type === "escalated").length;
  const loading = loadingAgent || loadingConvos || loadingQuestions;
  const enabled = Boolean(agent?.isEnabled);

  if (loadingAgent || !agent) {
    return <p className="text-sm text-muted-foreground">Loading monitoring data...</p>;
  }

  return (
    <div className="space-y-6">
      {!enabled && (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          <p className="font-medium">This agent is not live yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Enable it in Deployment to start saving widget conversations here. Existing history still appears below.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
          <div className="space-y-1.5">
            <Label htmlFor="monitoring-type" className="text-xs">Type</Label>
            <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as TypeFilter)}>
              <SelectTrigger id="monitoring-type" className="h-8 text-xs">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.id} value={option.id} className="text-xs">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="monitoring-date" className="text-xs">Date</Label>
            <div className="flex gap-2">
              <Select value={datePreset} onValueChange={(value) => setDatePreset(value as DatePreset)}>
                <SelectTrigger id="monitoring-date" className="h-8 text-xs">
                  <SelectValue placeholder="All time" />
                </SelectTrigger>
                <SelectContent>
                  {DATE_PRESETS.map((option) => (
                    <SelectItem key={option.id} value={option.id} className="text-xs">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {datePreset === "custom" && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 text-xs shrink-0">
                      <CalendarIcon className="w-3.5 h-3.5 mr-1.5" />
                      {customRange?.from
                        ? `${format(customRange.from, "MMM d")}${customRange.to ? ` – ${format(customRange.to, "MMM d")}` : ""}`
                        : "Pick dates"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      mode="range"
                      selected={customRange}
                      onSelect={setCustomRange}
                      numberOfMonths={1}
                    />
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Conversations" value={conversations.length} icon={MessageSquare} />
        <StatCard title="Questions" value={questions.length} icon={HelpCircle} />
        <StatCard title="Unanswered" value={unansweredCount} icon={Activity} />
        <StatCard title="Escalated" value={escalatedCount} icon={AlertTriangle} variant="destructive" />
      </div>

      <Card className="shadow-none border-border">
        <CardHeader className="py-4">
          <CardTitle className="text-sm font-medium">Conversations</CardTitle>
          <CardDescription className="text-xs">
            Live threads collected from the deployed widget.
          </CardDescription>
        </CardHeader>
        <div className="border-t border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs w-[120px]">ID</TableHead>
                <TableHead className="text-xs">Subject</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Last active</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && filteredConversations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-xs text-muted-foreground">
                    Loading conversations...
                  </TableCell>
                </TableRow>
              ) : filteredConversations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-xs text-muted-foreground">
                    No deployed conversations match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredConversations.map((convo) => (
                  <TableRow key={convo.id} className="text-xs">
                    <TableCell className="font-mono text-muted-foreground">{convo.id.split("-")[0]}</TableCell>
                    <TableCell className="font-medium">{conversationSubject(convo)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-[10px] uppercase font-mono tracking-wider h-5", statusBadgeClass(convo.status))}>
                        {convo.status.replaceAll("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(convo.lastActivityAt), "MMM d, HH:mm")}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-6 w-6" asChild>
                        <Link href={`/agents/${agentId}/chat?id=${convo.id}`} aria-label="Open conversation">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="shadow-none border-border">
        <CardHeader className="py-4">
          <CardTitle className="text-sm font-medium">Questions</CardTitle>
          <CardDescription className="text-xs">
            User questions from live conversations, including unanswered items and questions the agent escalated to a human.
          </CardDescription>
        </CardHeader>
        <div className="border-t border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Question</TableHead>
                <TableHead className="text-xs w-[130px]">Type</TableHead>
                <TableHead className="text-xs w-[140px]">Conversation</TableHead>
                <TableHead className="text-xs w-[130px]">Asked</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && filteredQuestions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-xs text-muted-foreground">
                    Loading questions...
                  </TableCell>
                </TableRow>
              ) : filteredQuestions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-xs text-muted-foreground">
                    No questions match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredQuestions.map((question) => (
                  <TableRow key={question.id} className="text-xs">
                    <TableCell className="font-medium max-w-[420px]">
                      <span className="line-clamp-2">{question.content}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-[10px] uppercase font-mono tracking-wider h-5", questionTypeBadgeClass(question.type))}>
                        {QUESTION_TYPE_LABEL[question.type]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-[10px] uppercase font-mono tracking-wider h-5", statusBadgeClass(question.conversationStatus))}>
                        {question.conversationStatus.replaceAll("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(question.createdAt), "MMM d, HH:mm")}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-6 w-6" asChild>
                        <Link href={`/agents/${agentId}/chat?id=${question.conversationId}`} aria-label="Open conversation">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  variant = "default",
}: {
  title: string;
  value: number;
  icon: typeof MessageSquare;
  variant?: "default" | "destructive";
}) {
  return (
    <Card className="shadow-none border-border">
      <CardContent className="p-6 flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium">{title}</p>
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${variant === "destructive" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
          <Icon className="w-5 h-5" />
        </div>
      </CardContent>
    </Card>
  );
}
