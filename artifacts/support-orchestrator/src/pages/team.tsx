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
import { Check, Copy, Plus, Trash } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [issuedInvite, setIssuedInvite] = useState<{ email: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyingId, setCopyingId] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
  };

  const copyUrl = async (url: string, successTitle: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast({ title: successTitle });
      return true;
    } catch {
      toast({
        title: "Could not copy the invite link",
        description: "Select the URL and copy it manually.",
        variant: "destructive",
      });
      return false;
    }
  };

  const handleInvite = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    try {
      const created = await inviteMember.mutateAsync({
        data: { email: inviteEmail.trim(), role: inviteRole },
      });
      setInviteEmail("");
      setInviteRole("viewer");
      setCopied(false);
      setIssuedInvite({
        email: created.email,
        url: inviteUrlForToken(created.token),
      });
      invalidate();
    } catch (err) {
      setFormError(apiErrorMessage(err, "Could not invite that person."));
    }
  };

  const handleCopyInvite = async (member: WorkspaceMember) => {
    setCopyingId(member.id);
    try {
      const issued = await regenerateInvite.mutateAsync({ id: member.id });
      const url = inviteUrlForToken(issued.token);
      await copyUrl(url, "Invite link copied");
      invalidate();
    } catch (err) {
      toast({
        title: "Could not create an invite link",
        description: apiErrorMessage(err, "Try again."),
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
                  Only @papernest.com Google accounts can be invited. Copy the link and paste it in Slack.
                  They sign in with Google using the invited account.
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
                  Invite
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

      <Dialog open={!!issuedInvite} onOpenChange={(open) => !open && setIssuedInvite(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite link ready</DialogTitle>
            <DialogDescription>
              Paste this link in Slack. It expires in 7 days and can only be used once.
              {issuedInvite ? ` ${issuedInvite.email} signs in with that Google account.` : null}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input readOnly value={issuedInvite?.url ?? ""} className="h-10 bg-background font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0"
              onClick={() => issuedInvite && void copyUrl(issuedInvite.url, "Invite link copied")}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setIssuedInvite(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
