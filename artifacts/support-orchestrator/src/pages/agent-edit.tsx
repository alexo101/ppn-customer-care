import { Link, useParams } from "wouter";
import { useGetAgent } from "@workspace/api-client-react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
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
            <Accordion type="multiple" defaultValue={["appearance", "conversations"]} className="space-y-3">
              <AccordionItem value="appearance" className="border border-border rounded-xl px-4 bg-card">
                <AccordionTrigger className="text-sm font-medium">Appearance</AccordionTrigger>
                <AccordionContent className="pb-4">
                  <AppearanceEditor agentId={agentId} />
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
            </Accordion>
          )}
        </div>
      </div>
    </div>
  );
}
