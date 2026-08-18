import { Link, useParams } from "wouter";
import { useGetAgent, useUpdateAgent, getListAgentsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { CategoriesTab, ConversationsTab, RulesTab, SourcesTab } from "@/pages/admin";
import { AppearanceEditor } from "@/components/appearance-editor";

export default function EditAgentPage() {
  const params = useParams<{ id: string }>();
  const agentId = params.id;
  const { data: agent, isLoading } = useGetAgent(agentId);
  const updateAgent = useUpdateAgent();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!agent) return;
    setName(agent.name);
    setDescription(agent.description);
  }, [agent]);

  if (!agentId) return null;

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      <div className="h-14 px-6 border-b border-border flex items-center justify-between bg-card shrink-0 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link href="/agents"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <h1 className="text-lg font-medium tracking-tight truncate">{agent?.name || "Agent"}</h1>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading agent...</p>
          ) : (
            <Accordion type="multiple" defaultValue={["details", "conversations"]} className="space-y-3">
              <AccordionItem value="details" className="border border-border rounded-xl px-4 bg-card">
                <AccordionTrigger className="text-sm font-medium">Details</AccordionTrigger>
                <AccordionContent className="space-y-4 pb-4">
                  <div className="space-y-2 max-w-lg">
                    <Label htmlFor="edit-agent-name">Name</Label>
                    <Input id="edit-agent-name" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="space-y-2 max-w-lg">
                    <Label htmlFor="edit-agent-description">Description</Label>
                    <Textarea id="edit-agent-description" value={description} onChange={(e) => setDescription(e.target.value)} />
                  </div>
                  <Button
                    size="sm"
                    disabled={!name.trim() || updateAgent.isPending}
                    onClick={() =>
                      updateAgent.mutate(
                        { id: agentId, data: { name: name.trim(), description } },
                        { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey() }) },
                      )
                    }
                  >
                    Save details
                  </Button>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="conversations" className="border border-border rounded-xl px-4 bg-card">
                <AccordionTrigger className="text-sm font-medium">Conversations</AccordionTrigger>
                <AccordionContent className="pb-4">
                  <ConversationsTab agentId={agentId} />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="categories" className="border border-border rounded-xl px-4 bg-card">
                <AccordionTrigger className="text-sm font-medium">Categories</AccordionTrigger>
                <AccordionContent className="pb-4">
                  <CategoriesTab agentId={agentId} />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="rules" className="border border-border rounded-xl px-4 bg-card">
                <AccordionTrigger className="text-sm font-medium">Rules</AccordionTrigger>
                <AccordionContent className="pb-4">
                  <RulesTab agentId={agentId} />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="sources" className="border border-border rounded-xl px-4 bg-card">
                <AccordionTrigger className="text-sm font-medium">Sources</AccordionTrigger>
                <AccordionContent className="pb-4">
                  <SourcesTab agentId={agentId} />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="appearance" className="border border-border rounded-xl px-4 bg-card">
                <AccordionTrigger className="text-sm font-medium">Appearance</AccordionTrigger>
                <AccordionContent className="pb-4">
                  <AppearanceEditor agentId={agentId} />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </div>
      </div>
    </div>
  );
}
