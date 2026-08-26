import { Link } from "wouter";
import { Bot, Plus, Trash } from "lucide-react";
import {
  useListAgents,
  useDeleteAgent,
  getListAgentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import { getUserAgentsQueryKey } from "@/lib/agents-query";
import { MutatingControls } from "@/components/workspace-access";

export default function AgentsBoard() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const {
    data: agents = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useListAgents({
    query: {
      enabled: isLoaded && isSignedIn && Boolean(userId),
      queryKey: getUserAgentsQueryKey(userId),
      refetchOnMount: "always",
      staleTime: 0,
    },
  });
  const deleteAgent = useDeleteAgent();
  const queryClient = useQueryClient();
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(
    null,
  );
  const errorMessage =
    error instanceof Error
      ? error.message
      : "Could not load agents. Please try again.";

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      <div className="h-16 px-6 md:px-8 border-b border-border flex items-center justify-between bg-card shrink-0">
        <h1 className="text-xl font-semibold tracking-tight">Agents</h1>
        <MutatingControls>
          <Button size="sm" asChild>
            <Link href="/agents/new">
              <Plus className="w-3.5 h-3.5" />
              Create agent
            </Link>
          </Button>
        </MutatingControls>
      </div>

      <div className="flex-1 overflow-auto p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          {!isLoaded || isLoading ? (
            <p className="text-sm text-muted-foreground">Loading agents…</p>
          ) : isError ? (
            <div className="space-y-3">
              <p className="text-sm text-destructive">{errorMessage}</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Try again
              </Button>
            </div>
          ) : agents.length === 0 ? (
            <Empty className="border border-dashed rounded-xl py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Bot />
                </EmptyMedia>
                <EmptyTitle>Create your first agent</EmptyTitle>
                <EmptyDescription>
                  An agent brings together conversations, categories, sources,
                  targets, rules, and appearance in one place.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <MutatingControls>
                  <Button asChild>
                    <Link href="/agents/new">
                      <Plus className="w-3.5 h-3.5" />
                      Create agent
                    </Link>
                  </Button>
                </MutatingControls>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {agents.map((agent) => (
                <Card
                  key={agent.id}
                  className="hover:border-primary/40 transition-colors"
                >
                  <CardHeader className="flex flex-row items-start justify-between gap-3">
                    <Link
                      href={`/agents/${agent.id}/appearance`}
                      className="min-w-0 flex-1"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <CardTitle className="text-base font-semibold truncate">
                          {agent.name}
                        </CardTitle>
                        <Badge
                          variant={agent.isEnabled ? "default" : "secondary"}
                          className={cn(
                            "shrink-0",
                            agent.isEnabled
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-transparent shadow-none"
                              : "shadow-none",
                          )}
                        >
                          {agent.isEnabled ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <CardDescription className="text-sm mt-1.5 line-clamp-2">
                        {agent.description || "No description"}
                      </CardDescription>
                    </Link>
                    <MutatingControls>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() =>
                          setToDelete({ id: agent.id, name: agent.name })
                        }
                      >
                        <Trash className="w-3.5 h-3.5" />
                      </Button>
                    </MutatingControls>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <AlertDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete agent</AlertDialogTitle>
            <AlertDialogDescription>
              Delete "{toDelete?.name}"? Conversations, categories, rules,
              sources, targets, and appearance for this agent will be removed.
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
                      queryClient.invalidateQueries({
                        queryKey: getListAgentsQueryKey(),
                      });
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
