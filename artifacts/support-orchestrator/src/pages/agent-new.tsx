import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useCreateAgent, getListAgentsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CategoriesTab, RulesTab, SourcesTab } from "@/pages/admin";
import { AppearanceEditor } from "@/components/appearance-editor";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: "appearance", label: "Appearance" },
  { id: "categories", label: "Categories" },
  { id: "rules", label: "Rules" },
  { id: "sources", label: "Sources" },
] as const;

export default function CreateAgentPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createAgent = useCreateAgent();
  const [step, setStep] = useState(0);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canContinue = step === 0 ? name.trim().length > 0 : Boolean(agentId);

  const handleNext = async () => {
    setError(null);
    if (step === 0 && !agentId) {
      try {
        const created = await createAgent.mutateAsync({
          data: { name: name.trim(), description: description.trim() },
        });
        setAgentId(created.id);
        queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey() });
        return;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create agent.");
      }
      return;
    }
    if (step < STEPS.length - 1) setStep(step + 1);
    else if (agentId) setLocation(`/agents/${agentId}`);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      <div className="h-14 px-6 border-b border-border flex items-center justify-between bg-card shrink-0 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link href="/agents"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <h1 className="text-lg font-medium tracking-tight truncate">Create agent</h1>
        </div>
        <div className="flex items-center gap-2">
          {step > 0 && (
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          <Button size="sm" className="h-8 text-xs" onClick={handleNext} disabled={!canContinue || createAgent.isPending}>
            {step === STEPS.length - 1 ? "Finish" : "Continue"}
            {step === STEPS.length - 1 ? <Check className="w-3.5 h-3.5 ml-1" /> : <ArrowRight className="w-3.5 h-3.5 ml-1" />}
          </Button>
        </div>
      </div>

      <div className="px-6 py-4 border-b border-border bg-card/50">
        <ol className="flex flex-wrap gap-2">
          {STEPS.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={index > 0 && !agentId}
                onClick={() => {
                  if (index === 0 || agentId) setStep(index);
                }}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-full border transition-colors",
                  index === step
                    ? "bg-primary text-primary-foreground border-primary"
                    : index < step || (index === 0 && agentId)
                      ? "bg-primary/10 text-primary border-primary/20"
                      : "bg-background text-muted-foreground border-border",
                )}
              >
                {index + 1}. {item.label}
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto">
          {error && <p className="text-sm text-destructive mb-4">{error}</p>}

          {step === 0 && !agentId && (
            <div className="max-w-lg space-y-3">
              <div className="rounded-lg border border-border bg-background p-4 space-y-3">
                <div className="pb-3 border-b border-border">
                  <h3 className="text-sm font-medium">Name</h3>
                  <p className="text-xs text-muted-foreground mt-1">Display name for this agent.</p>
                </div>
                <Label htmlFor="agent-name" className="sr-only">Name</Label>
                <Input id="agent-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Billing support" />
              </div>
              <div className="rounded-lg border border-border bg-background p-4 space-y-3">
                <div className="pb-3 border-b border-border">
                  <h3 className="text-sm font-medium">Description</h3>
                  <p className="text-xs text-muted-foreground mt-1">What this agent handles.</p>
                </div>
                <Label htmlFor="agent-description" className="sr-only">Description</Label>
                <Textarea id="agent-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short summary of this agent" />
              </div>
            </div>
          )}

          {step === 0 && agentId && <AppearanceEditor agentId={agentId} />}
          {step === 1 && agentId && <CategoriesTab agentId={agentId} />}
          {step === 2 && agentId && <RulesTab agentId={agentId} />}
          {step === 3 && agentId && <SourcesTab agentId={agentId} />}
        </div>
      </div>
    </div>
  );
}
