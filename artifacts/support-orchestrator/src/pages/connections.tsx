import {
  CheckCircle2,
  ExternalLink,
  Link2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  useListConnections,
  useStartConnectionOAuth,
  useDeleteConnection,
  getListConnectionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function ConnectionsPage() {
  const queryClient = useQueryClient();
  const connectionsQuery = useListConnections({
    query: { queryKey: getListConnectionsQueryKey() },
  });
  const oauth = useStartConnectionOAuth();
  const deleteConnection = useDeleteConnection();

  const connect = (provider: "notion" | "confluence") => {
    oauth.mutate(
      { data: { provider } },
      {
        onSuccess: (result) => {
          window.location.assign(result.authorizationUrl);
        },
      },
    );
  };

  const connectedProviders = new Set(
    (connectionsQuery.data ?? [])
      .filter((c) => c.status === "connected")
      .map((c) => c.provider.toLowerCase()),
  );

  return (
    <div className="flex-1 overflow-auto p-6 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Company</p>
            <h1 className="text-2xl font-semibold tracking-tight mt-1">Connections</h1>
            <p className="text-muted-foreground mt-2 max-w-2xl">
              Connect each provider once for this company. Tokens are encrypted and shared
              across all agents.
            </p>
          </div>
          <Badge variant="outline" className="gap-1.5">
            <Link2 className="w-3.5 h-3.5" />
            One credential per provider
          </Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {(["notion", "confluence"] as const).map((provider) => (
            <Card key={provider}>
              <CardHeader>
                <CardTitle className="capitalize">{provider}</CardTitle>
                <CardDescription>
                  Authorize {provider} for this company.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => connect(provider)}
                  disabled={oauth.isPending || connectedProviders.has(provider)}
                >
                  <Plus className="w-4 h-4" />
                  {connectedProviders.has(provider) ? "Connected" : `Connect ${provider}`}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Company connections</h2>
            <Button variant="ghost" size="sm" onClick={() => connectionsQuery.refetch()}>
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </Button>
          </div>
          {connectionsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading connections…</p>
          ) : connectionsQuery.data?.length ? (
            <div className="space-y-3">
              {connectionsQuery.data.map((connection) => (
                <Card key={connection.id}>
                  <CardContent className="flex items-center justify-between gap-4 py-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{connection.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {connection.provider} · {connection.status}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        deleteConnection.mutate(
                          { connectionId: connection.id },
                          {
                            onSuccess: () => {
                              queryClient.invalidateQueries({
                                queryKey: getListConnectionsQueryKey(),
                              });
                            },
                          },
                        );
                      }}
                      disabled={deleteConnection.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No connections yet. Connect a provider above.
              </CardContent>
            </Card>
          )}
        </section>

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ExternalLink className="w-3.5 h-3.5" />
          Provider authorization is handled through OAuth; access and refresh tokens are encrypted server-side.
        </p>
      </div>
    </div>
  );
}
