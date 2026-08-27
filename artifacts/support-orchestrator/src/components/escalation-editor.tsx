import { useEffect, useState } from "react";
import {
  getGetAgentEscalationQueryKey,
  type AgentEscalationInput,
  useGetAgentEscalation,
  useListMembers,
  useUpdateAgentEscalation,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Inbox, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  MutatingControls,
  useWorkspaceAccess,
} from "@/components/workspace-access";
import { getAgentEscalationQueryOptions } from "@/lib/escalation-query-options";
import { toast } from "@/hooks/use-toast";

export function EscalationEditor({ agentId }: { agentId: string }) {
  const { canEdit } = useWorkspaceAccess();
  const queryClient = useQueryClient();
  const { data, isLoading } = useGetAgentEscalation(agentId, {
    query: getAgentEscalationQueryOptions(agentId),
  });
  const { data: members = [] } = useListMembers();
  const updateEscalation = useUpdateAgentEscalation();
  const [name, setName] = useState("Escalation team");
  const [isEnabled, setIsEnabled] = useState(false);
  const [createInboxConversation, setCreateInboxConversation] = useState(true);
  const [notifyAssignedMembers, setNotifyAssignedMembers] = useState(true);
  const [memberIds, setMemberIds] = useState<string[]>([]);

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setIsEnabled(data.isEnabled);
    setCreateInboxConversation(data.createInboxConversation);
    setNotifyAssignedMembers(data.notifyAssignedMembers);
    setMemberIds(data.members.map((member) => member.id));
  }, [data]);

  const activeMembers = members.filter((member) => member.status === "active");
  const saving = updateEscalation.isPending;

  const toggleMember = (id: string, checked: boolean | "indeterminate") => {
    if (checked === true) {
      setMemberIds((current) =>
        current.includes(id) ? current : [...current, id],
      );
    } else {
      setMemberIds((current) => current.filter((memberId) => memberId !== id));
    }
  };

  const save = async () => {
    if (!name.trim()) {
      toast({ title: "Enter a team name", variant: "destructive" });
      return;
    }
    if (isEnabled && createInboxConversation && memberIds.length === 0) {
      toast({
        title: "Select at least one member",
        description: "Enabled escalations need an inbox recipient.",
        variant: "destructive",
      });
      return;
    }
    const input: AgentEscalationInput = {
      name: name.trim(),
      isEnabled,
      createInboxConversation,
      notifyAssignedMembers,
      memberIds,
    };
    try {
      await updateEscalation.mutateAsync({ id: agentId, data: input });
      await queryClient.invalidateQueries({
        queryKey: getGetAgentEscalationQueryKey(agentId),
      });
      toast({ title: "Escalation settings saved" });
    } catch (error) {
      toast({
        title: "Could not save escalation settings",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">
        Loading escalation settings...
      </p>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <Card className="shadow-none border-border">
        <CardHeader>
          <CardTitle className="text-base">Escalation destination</CardTitle>
          <CardDescription>
            Choose the support group that receives conversations this Agent
            cannot resolve. This membership is separate from platform access
            permissions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="escalation-name">Team name</Label>
            <Input
              id="escalation-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={!canEdit}
              maxLength={160}
              placeholder="Customer Care France"
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
            <div className="flex items-start gap-3">
              <Inbox className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <Label htmlFor="escalation-enabled">
                  Enable escalation inbox
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Create an assigned inbox conversation when a Rule escalates.
                </p>
              </div>
            </div>
            <Switch
              id="escalation-enabled"
              checked={isEnabled}
              onCheckedChange={setIsEnabled}
              disabled={!canEdit}
            />
          </div>

          <div className="space-y-3">
            <div>
              <Label>Members who will receive escalations</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Members can receive support work regardless of whether their
                platform role is editor or viewer.
              </p>
            </div>
            <div className="rounded-lg border border-border divide-y divide-border">
              {activeMembers.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  No active workspace members are available.
                </p>
              ) : (
                activeMembers.map((member) => (
                  <label
                    key={member.id}
                    className="flex items-center gap-3 p-3 cursor-pointer"
                  >
                    <Checkbox
                      checked={memberIds.includes(member.id)}
                      onCheckedChange={(checked) =>
                        toggleMember(member.id, checked)
                      }
                      disabled={!canEdit}
                    />
                    <span className="text-sm">{member.email}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="space-y-3">
            <Label>Notification</Label>
            <label className="flex items-center gap-3">
              <Checkbox
                checked={createInboxConversation}
                onCheckedChange={(checked) =>
                  setCreateInboxConversation(checked === true)
                }
                disabled={!canEdit}
              />
              <span className="flex items-center gap-2 text-sm">
                <Inbox className="h-4 w-4 text-muted-foreground" />
                Create inbox conversation
              </span>
            </label>
            <label className="flex items-center gap-3">
              <Checkbox
                checked={notifyAssignedMembers}
                onCheckedChange={(checked) =>
                  setNotifyAssignedMembers(checked === true)
                }
                disabled={!canEdit || !createInboxConversation}
              />
              <span className="flex items-center gap-2 text-sm">
                <Bell className="h-4 w-4 text-muted-foreground" />
                Notify assigned members
              </span>
            </label>
          </div>

          <MutatingControls>
            <Button
              onClick={() => void save()}
              disabled={saving}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save escalation settings"}
            </Button>
          </MutatingControls>
        </CardContent>
      </Card>
    </div>
  );
}
