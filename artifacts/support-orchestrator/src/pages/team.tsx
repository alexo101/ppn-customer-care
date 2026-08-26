import { useState, type FormEvent } from "react";
import {
  useListMembers,
  useInviteMember,
  useUpdateMember,
  useDeleteMember,
  useCreateMemberInvitationToken,
  getListMembersQueryKey,
  type MemberRole,
  type WorkspaceMember,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Plus, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { MutatingControls, useWorkspaceAccess } from "@/components/workspace-access";
import { toast } from "@/hooks/use-toast";
import { buildInviteUrl } from "@/lib/invite-url";

function roleLabel(role: MemberRole) {
  return role === "editor" ? "Can edit" : "View only";
}

function inviteUrlForToken(token: string) {
  return buildInviteUrl(token, window.location.origin, import.meta.env.BASE_URL);
}

function apiErrorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message.replace(/^HTTP \d+ [^:]+:\s*/, "") : fallback;
}

export default function Team() {
  const { email: currentEmail, canEdit } = useWorkspaceAccess();
  const queryClient = useQueryClient();
  const { data: members = [], isLoading, isError, error, refetch } = useListMembers({
    query: {
      queryKey: getListMembersQueryKey(),
      refetchOnMount: "always",
      staleTime: 0,
    },
  });
  const inviteMember = useInviteMember();
  const regenerateInvite = useCreateMemberInvitationToken();
  const updateMember = useUpdateMember();
  const deleteMember = useDeleteMember();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("viewer");
  const [formError, setFormError] = useState<string | null>(null);
  const [toRevoke, setToRevoke] = useState<WorkspaceMember | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
  };

  const handleInvite = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    try {
      await inviteMember.mutateAsync({
        data: { email: inviteEmail.trim(), role: inviteRole },
      });
      setInviteEmail("");
      setInviteRole("viewer");
      invalidate();
    } catch (err) {
      setFormError(apiErrorMessage(err, "Could not add that person."));
    }
  };

  const handleCopyInvite = async (member: WorkspaceMember) => {
    setCopyingId(member.id);
    // #region agent log
    fetch('http://127.0.0.1:7600/ingest/a2a2da46-8d04-4e69-ad9d-61a4005dfe74',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e273e6'},body:JSON.stringify({sessionId:'e273e6',runId:'pre-fix',hypothesisId:'B',location:'team.tsx:handleCopyInvite',message:'copy invite clicked',data:{memberId:member.id,status:member.status,idType:typeof member.id},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    try {
      const issued = await regenerateInvite.mutateAsync({ id: member.id });
      // #region agent log
      fetch('http://127.0.0.1:7600/ingest/a2a2da46-8d04-4e69-ad9d-61a4005dfe74',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e273e6'},body:JSON.stringify({sessionId:'e273e6',runId:'pre-fix',hypothesisId:'E',location:'team.tsx:handleCopyInvite:success',message:'regenerate succeeded',data:{hasToken:Boolean(issued?.token),hasInvitePath:Boolean(issued?.invitePath)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      await navigator.clipboard.writeText(inviteUrlForToken(issued.token));
      toast({ title: "Invite link copied" });
      invalidate();
    } catch (err) {
      const apiErr = err as { message?: string; status?: number; data?: unknown; url?: string };
      // #region agent log
      fetch('http://127.0.0.1:7600/ingest/a2a2da46-8d04-4e69-ad9d-61a4005dfe74',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e273e6'},body:JSON.stringify({sessionId:'e273e6',runId:'pre-fix',hypothesisId:'A',location:'team.tsx:handleCopyInvite:catch',message:'copy invite failed',data:{errMessage:apiErr?.message,status:apiErr?.status,url:apiErr?.url,data:apiErr?.data},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      toast({
        title: "Could not copy the invite link",
        description: apiErrorMessage(err, "Try again, or copy it manually from a new link."),
        variant: "destructive",
      });
    } finally {
      setCopyingId(null);
    }
  };

  const errorMessage =
    error instanceof Error ? error.message : "Could not load the team. Please try again.";

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      <div className="h-16 px-6 md:px-8 border-b border-border flex items-center justify-between bg-card shrink-0">
        <h1 className="text-xl font-semibold tracking-tight">Team</h1>
      </div>

      <div className="flex-1 overflow-auto p-6 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <MutatingControls>
            <form
              onSubmit={(event) => void handleInvite(event)}
              className="rounded-xl border border-border bg-card p-5 space-y-4"
            >
              <div>
                <h2 className="text-base font-semibold tracking-tight">Invite a teammate</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Only @papernest.com Google accounts can be added. Use Copy invite link on an Invited row,
                  paste it in Slack, and they sign in with that Google account.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-end">
                <div className="min-w-0 flex flex-col gap-2">
                  <Label htmlFor="invite-email" className="text-xs">Email</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="name@papernest.com"
                    className="h-10 bg-background"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="invite-role" className="text-xs">Access</Label>
                  <div>
                    <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as MemberRole)}>
                      <SelectTrigger id="invite-role" className="h-10 w-full bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="editor">Can edit</SelectItem>
                        <SelectItem value="viewer">View only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="submit" className="h-10 w-full md:w-auto" disabled={inviteMember.isPending}>
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </Button>
              </div>
              {formError ? <p className="text-xs text-destructive">{formError}</p> : null}
            </form>
          </MutatingControls>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {isLoading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading team…</p>
            ) : isError ? (
              <div className="p-6 space-y-3">
                <p className="text-sm text-destructive">{errorMessage}</p>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  Try again
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Access</TableHead>
                    {canEdit ? <TableHead className="w-48"><span className="sr-only">Actions</span></TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">
                        {member.email}
                        {member.email === currentEmail ? (
                          <span className="ml-2 text-xs text-muted-foreground">you</span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant={member.status === "active" ? "default" : "secondary"} className="shadow-none">
                          {member.status === "active" ? "Active" : "Invited"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {canEdit ? (
                          <Select
                            value={member.role}
                            onValueChange={(value) => {
                              updateMember.mutate(
                                { id: member.id, data: { role: value as MemberRole } },
                                {
                                  onSuccess: invalidate,
                                  onError: (err) => {
                                    toast({
                                      title: "Could not change access",
                                      description: apiErrorMessage(err, "Try again."),
                                      variant: "destructive",
                                    });
                                  },
                                },
                              );
                            }}
                          >
                            <SelectTrigger className="h-8 w-36 bg-background">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="editor">Can edit</SelectItem>
                              <SelectItem value="viewer">View only</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-sm">{roleLabel(member.role)}</span>
                        )}
                      </TableCell>
                      {canEdit ? (
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            {member.status === "invited" ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                disabled={copyingId === member.id}
                                onClick={() => void handleCopyInvite(member)}
                              >
                                <Copy className="w-3.5 h-3.5" />
                                Copy invite link
                              </Button>
                            ) : null}
                            {member.email !== currentEmail ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => setToRevoke(member)}
                                aria-label={`Remove ${member.email}`}
                              >
                                <Trash className="w-3.5 h-3.5" />
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={!!toRevoke} onOpenChange={(open) => !open && setToRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove teammate</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {toRevoke?.email}? They will no longer be able to sign in with Google.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!toRevoke) return;
                deleteMember.mutate(
                  { id: toRevoke.id },
                  {
                    onSuccess: () => {
                      setToRevoke(null);
                      invalidate();
                    },
                  },
                );
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
