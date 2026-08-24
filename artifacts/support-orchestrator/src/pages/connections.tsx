import { useEffect } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Link2,
  Plus,
  RefreshCw,
} from "lucide-react";
import {
  useListConnections,
  useListTeamConnections,
  useStartConnectionOAuth,
  useEnableTeamConnection,
  useDisableTeamConnection,
  getListConnectionsQueryKey,
  getListTeamConnectionsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTenantContext } from "@/components/tenant-context";

export default function ConnectionsPage() {
  const { organizationId, teamId, organizations, setOrganizationId } = useTenantContext();
  const connectionsQuery = useListConnections(organizationId ?? "", {
    query: { enabled: Boolean(organizationId), queryKey: getListConnectionsQueryKey(organizationId ?? "") },
  });
  const oauth = useStartConnectionOAuth();
  const enabledQuery = useListTeamConnections(
    teamId ?? "",
    { query: { enabled: Boolean(teamId), queryKey: getListTeamConnectionsQueryKey(teamId ?? "") } },
  );
  const enable = useEnableTeamConnection();
  const disable = useDisableTeamConnection();

  useEffect(() => {
    if (!organizationId && organizations[0]) setOrganizationId(organizations[0].id);
  }, [organizationId, organizations, setOrganizationId]);

  const connect = (provider: "notion" | "confluence") => {
    if (!organizationId) return;
    oauth.mutate(
      { organizationId, data: { provider } },
      {
        onSuccess: (result) => {
          window.location.assign(result.authorizationUrl);
        },
      },
    );
  };

  return (
    <div className="flex-1 overflow-auto p-6 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Organization</p>
            <h1 className="text-2xl font-semibold tracking-tight mt-1">Connections</h1>
            <p className="text-muted-foreground mt-2 max-w-2xl">
              Connect provider accounts once, then explicitly enable them for each team.
              New teams start with no connections.
            </p>
          </div>
          <Badge variant="outline" className="gap-1.5">
            <Link2 className="w-3.5 h-3.5" />
            Reusable at organization level
          </Badge>
        </div>

        {organizations.length > 1 && (
          <select
            value={organizationId ?? ""}
            onChange={(event) => setOrganizationId(event.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm"
            aria-label="Select organization"
          >
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {(["notion", "confluence"] as const).map((provider) => (
            <Card key={provider}>
              <CardHeader>
                <CardTitle className="capitalize">{provider}</CardTitle>
                <CardDescription>
                  Authorize {provider} for this organization.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => connect(provider)}
                  disabled={!organizationId || oauth.isPending}
                >
                  <Plus className="w-4 h-4" />
                  Connect {provider}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Organization connections</h2>
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
                    {enabledQuery.data?.some((item) => item.id === connection.id) ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          if (teamId) {
                            disable.mutate({ teamId, connectionId: connection.id }, {
                              onSuccess: () => enabledQuery.refetch(),
                            });
                          }
                        }}
                      >
                        Enabled for team
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (teamId) {
                            enable.mutate({ teamId, connectionId: connection.id }, {
                              onSuccess: () => enabledQuery.refetch(),
                            });
                          }
                        }}
                      >
                        Enable for team
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No organization connections yet. Connect a provider above to make it available
                for explicit team assignment.
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
