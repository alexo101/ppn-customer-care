import { Link } from "wouter";
import { Bot, Plus, Trash } from "lucide-react";
import {
  useListAgents,
  useDeleteAgent,
  getListAgentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { format } from "date-fns";

export default function AgentsBoard() {
  const { data: agents = [], isLoading } = useListAgents();
  const deleteAgent = useDeleteAgent();
  const queryClient = useQueryClient();
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      <div className="h-14 px-6 border-b border-border flex items-center justify-between bg-card shrink-0">
        <h1 className="text-lg font-medium tracking-tight">Agents</h1>
        <Button size="sm" className="h-8 text-xs" asChild>
          <Link href="/agents/new">
            <Plus className="w-3.5 h-3.5 mr-1" />
            Create agent
          </Link>
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading agents...</p>
          ) : agents.length === 0 ? (
            <div className="border border-dashed border-border rounded-xl p-12 text-center space-y-3">
              <Bot className="w-10 h-10 mx-auto text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No agents yet. Create one to configure conversations, categories, rules, sources, and appearance.</p>
              <Button asChild>
                <Link href="/agents/new">Create agent</Link>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {agents.map((agent) => (
                <Card key={agent.id} className="shadow-none border-border hover:border-primary/40 transition-colors">
                  <CardHeader className="flex flex-row items-start justify-between gap-3">
                    <Link href={`/agents/${agent.id}`} className="min-w-0 flex-1">
                      <CardTitle className="text-sm font-medium truncate">{agent.name}</CardTitle>
                      <CardDescription className="text-xs mt-1 line-clamp-2">
                        {agent.description || "No description"}
                      </CardDescription>
                      <p className="text-[11px] text-muted-foreground mt-3">
                        Created {format(new Date(agent.createdAt), "MMM d, yyyy")}
                      </p>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => setToDelete({ id: agent.id, name: agent.name })}
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </Button>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete agent</AlertDialogTitle>
            <AlertDialogDescription>
              Delete "{toDelete?.name}"? Conversations, categories, rules, sources, and appearance for this agent will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!toDelete) return;
                deleteAgent.mutate(
                  { id: toDelete.id },
                  {
                    onSuccess: () => {
                      setToDelete(null);
                      queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey() });
                    },
                  },
                );
              }}
            >
              Delete agent
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
