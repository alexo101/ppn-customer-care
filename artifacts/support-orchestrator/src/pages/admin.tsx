import { useState } from 'react';
import { Redirect, Link } from 'wouter';
import { 
  useListConversations,
} from '@workspace/api-client-react';
import { ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { MutatingControls, useWorkspaceAccess } from '@/components/workspace-access';

export default function Admin() {
  return <Redirect to="/agents" />;
}

export function ConversationsTab({ agentId }: { agentId: string }) {
  const [filter, setFilter] = useState('');
  const { data: convos = [] } = useListConversations({
    agentId,
    source: "training",
    ...(filter ? { status: filter } : {}),
  });

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
                  <Badge variant="outline" className="text-xs h-5 bg-card capitalize">
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

export { TargetsTab } from "@/components/targets-tab";
