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
import { MutatingControls, useWorkspaceAccess } from "@/components/workspace-access";
import { toast } from "@/hooks/use-toast";

const formSchema = z.object({
  endpointUrl: z.string().max(2048),
});

type FormValues = z.infer<typeof formSchema>;

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
    },
  });

  useEffect(() => {
    if (!data) return;
    form.reset({
      endpointUrl: data.endpointUrl,
    });
  }, [data, form]);

  const onSubmit = (values: FormValues) => {
    const payload: QueryLiveDataSettingsInput = {
      endpointUrl: values.endpointUrl.trim(),
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
