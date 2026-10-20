import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAgentQueryLiveDataQueryKey,
  useGetAgentQueryLiveData,
  useUpdateAgentQueryLiveData,
  type QueryLiveDataSettingsInput,
} from "@workspace/api-client-react";
import { ChevronDown, Plus, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { SettingsSection } from "@/components/settings-section";
import { MutatingControls, useWorkspaceAccess } from "@/components/workspace-access";
import { toast } from "@/hooks/use-toast";

type EndpointDraft = {
  id: string;
  endpointUrl: string;
};

const MAX_ENDPOINTS = 12;

function newEndpoint(endpointUrl = ""): EndpointDraft {
  return { id: crypto.randomUUID(), endpointUrl };
}

export function QueryLiveDataEditor({ agentId }: { agentId: string }) {
  const { canEdit } = useWorkspaceAccess();
  const queryClient = useQueryClient();
  const { data, isLoading } = useGetAgentQueryLiveData(agentId, {
    query: {
      queryKey: getGetAgentQueryLiveDataQueryKey(agentId),
      retry: false,
    },
  });
  const updateSettings = useUpdateAgentQueryLiveData();
  const [endpoints, setEndpoints] = useState<EndpointDraft[]>([newEndpoint()]);
  const [endpointToRemove, setEndpointToRemove] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const saved = data.endpoints.filter((endpoint) => endpoint.endpointUrl.trim());
    setEndpoints(
      saved.length > 0
        ? saved.map((endpoint) => newEndpoint(endpoint.endpointUrl))
        : [newEndpoint()],
    );
  }, [data]);

  const updateEndpoint = (id: string, endpointUrl: string) => {
    setEndpoints((current) =>
      current.map((endpoint) => (endpoint.id === id ? { ...endpoint, endpointUrl } : endpoint)),
    );
  };

  const confirmRemove = () => {
    if (!endpointToRemove) return;
    setEndpoints((current) => current.filter((endpoint) => endpoint.id !== endpointToRemove));
    setEndpointToRemove(null);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canEdit) return;
    const payload: QueryLiveDataSettingsInput = {
      endpoints: endpoints
        .map((endpoint) => ({
          method: "GET" as const,
          endpointUrl: endpoint.endpointUrl.trim(),
        }))
        .filter((endpoint) => endpoint.endpointUrl),
    };
    updateSettings.mutate(
      { id: agentId, data: payload },
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries({
            queryKey: getGetAgentQueryLiveDataQueryKey(agentId),
          });
          toast({ title: "Live data settings saved" });
        },
        onError: (error) => {
          toast({
            title: "Couldn't save live data settings",
            description:
              error instanceof Error ? error.message : "Check the endpoint settings and try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <SettingsSection title="Configure the search of live information" collapsible={false}>
        <p className="text-sm text-muted-foreground">
          Look up a named client when a question asks for that client’s current information.
          General how-to questions continue to use the knowledge base.
        </p>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading live data settings…</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-5">
            <Collapsible defaultOpen>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium">Endpoints</h3>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 [&[data-state=open]>svg]:rotate-180"
                    aria-label="Toggle endpoints"
                  >
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="space-y-4 pt-3">
                {endpoints.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No endpoints yet.</p>
                ) : (
                  endpoints.map((endpoint, index) => (
                    <div key={endpoint.id} className="space-y-3 rounded-lg border border-border p-3">
                      <div className="grid gap-2 max-w-sm">
                        <Label htmlFor={`query-live-method-${endpoint.id}`}>HTTP method</Label>
                        <Input
                          id={`query-live-method-${endpoint.id}`}
                          value="GET"
                          disabled
                          aria-label={`HTTP method for endpoint ${index + 1}, GET only`}
                          data-testid="query-live-method"
                          className="bg-muted text-muted-foreground"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor={`query-live-endpoint-${endpoint.id}`}>Endpoint URL</Label>
                        <Input
                          id={`query-live-endpoint-${endpoint.id}`}
                          value={endpoint.endpointUrl}
                          onChange={(event) => updateEndpoint(endpoint.id, event.target.value)}
                          placeholder="https://api.example.com/clients?name={clientName}"
                          disabled={!canEdit || updateSettings.isPending}
                          data-testid="query-live-endpoint"
                          autoComplete="url"
                        />
                        <p className="text-xs text-muted-foreground">
                          Use a public HTTPS URL and include {"{clientName}"} exactly once in the
                          path or query string.
                        </p>
                      </div>
                      <MutatingControls>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={updateSettings.isPending}
                          onClick={() => setEndpointToRemove(endpoint.id)}
                        >
                          <Trash className="h-3.5 w-3.5" />
                          Remove
                        </Button>
                      </MutatingControls>
                    </div>
                  ))
                )}
                <MutatingControls>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={updateSettings.isPending || endpoints.length >= MAX_ENDPOINTS}
                    onClick={() => setEndpoints((current) => [...current, newEndpoint()])}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add endpoint
                  </Button>
                </MutatingControls>
              </CollapsibleContent>
            </Collapsible>

            <MutatingControls>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={updateSettings.isPending}
                  data-testid="save-query-live-data"
                >
                  {updateSettings.isPending ? "Saving…" : "Save live data settings"}
                </Button>
              </div>
            </MutatingControls>
          </form>
        )}
      </SettingsSection>

      <AlertDialog
        open={Boolean(endpointToRemove)}
        onOpenChange={(open) => !open && setEndpointToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove endpoint</AlertDialogTitle>
            <AlertDialogDescription>
              Remove this HTTP endpoint? It will no longer be used for live lookups after you save.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
