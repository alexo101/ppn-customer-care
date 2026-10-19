import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAgentQueryLiveDataQueryKey,
  useGetAgentQueryLiveData,
  useUpdateAgentQueryLiveData,
  type QueryLiveDataSettingsInput,
} from "@workspace/api-client-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsSection } from "@/components/settings-section";
import { Textarea } from "@/components/ui/textarea";
import { MutatingControls, useWorkspaceAccess } from "@/components/workspace-access";
import { toast } from "@/hooks/use-toast";

const formSchema = z.object({
  endpointUrl: z.string().max(2048),
  authorizationSecretName: z.string().max(64),
  allowedFields: z.string().max(1000),
  disambiguationFields: z.string().max(500),
});

type FormValues = z.infer<typeof formSchema>;

function parseFieldNames(value: string): string[] {
  return [...new Set(value.split(/[,\n]/).map((field) => field.trim()).filter(Boolean))];
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
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      endpointUrl: "",
      authorizationSecretName: "",
      allowedFields: "",
      disambiguationFields: "",
    },
  });

  useEffect(() => {
    if (!data) return;
    form.reset({
      endpointUrl: data.endpointUrl,
      authorizationSecretName: data.authorizationSecretName,
      allowedFields: data.allowedFields.join(", "),
      disambiguationFields: data.disambiguationFields.join(", "),
    });
  }, [data, form]);

  const onSubmit = (values: FormValues) => {
    const payload: QueryLiveDataSettingsInput = {
      endpointUrl: values.endpointUrl.trim(),
      authorizationSecretName: values.authorizationSecretName.trim(),
      allowedFields: parseFieldNames(values.allowedFields),
      disambiguationFields: parseFieldNames(values.disambiguationFields),
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
      <SettingsSection title="Query live data">
        <p className="text-sm text-muted-foreground">
          Look up a named client when a question asks for that client’s current information.
          General how-to questions continue to use the knowledge base.
        </p>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading live data settings…</p>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <div className="grid gap-2 max-w-sm">
                <Label htmlFor="query-live-method">HTTP method</Label>
                <Input
                  id="query-live-method"
                  value="GET"
                  disabled
                  aria-label="HTTP method, GET only"
                  data-testid="query-live-method"
                  className="bg-muted text-muted-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  GET is fixed for this integration.
                </p>
              </div>

              <FormField
                control={form.control}
                name="endpointUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Endpoint URL</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="https://api.example.com/clients?name={clientName}"
                        disabled={!canEdit || updateSettings.isPending}
                        data-testid="query-live-endpoint"
                        autoComplete="url"
                      />
                    </FormControl>
                    <FormDescription>
                      Use a public HTTPS URL and include {"{clientName}"} exactly once in the
                      path or query string. The name is URL-encoded before the request. Leave
                      empty to disable live lookups.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="authorizationSecretName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Authorization secret name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="LIVE_QUERY_CLIENT_API_TOKEN"
                        disabled={!canEdit || updateSettings.isPending}
                        data-testid="query-live-secret-name"
                        autoComplete="off"
                      />
                    </FormControl>
                    <FormDescription>
                      Add the token itself in Replit Secrets. The secret name must start with
                      LIVE_QUERY_; its value is never saved in this agent’s settings.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="allowedFields"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fields the assistant may use in replies</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={2}
                        placeholder="callStatus, contractStatus"
                        disabled={!canEdit || updateSettings.isPending}
                        data-testid="query-live-allowed-fields"
                      />
                    </FormControl>
                    <FormDescription>
                      Comma-separate the exact keys returned inside each client’s facts object.
                      Only these values can be used to answer.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="disambiguationFields"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Safe fields to distinguish same-name clients</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={2}
                        placeholder="city, office"
                        disabled={!canEdit || updateSettings.isPending}
                        data-testid="query-live-disambiguation-fields"
                      />
                    </FormControl>
                    <FormDescription>
                      Optional. Use non-sensitive values only; these are shown only when the
                      endpoint finds more than one match.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                The endpoint must authenticate the bearer token, enforce access for the
                signed-in workspace user, and return only records that user may view. Anonymous
                deployment sessions cannot query client data. Return JSON in this shape:
                <pre className="mt-2 overflow-x-auto rounded bg-background p-2 font-mono text-[11px] text-foreground">
{`{
  "authorized": true,
  "authorizedForUserId": "<X-Orchestrator-Caller-Id>",
  "clients": [{
    "authorized": true,
    "name": "Ana García",
    "facts": { "callStatus": "completed", "city": "Madrid" }
  }]
}`}
                </pre>
                The full contract and limits are in docs/query-live-data-endpoint.md.
              </div>

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
          </Form>
        )}
      </SettingsSection>
    </div>
  );
}
