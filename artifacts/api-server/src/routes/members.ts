import { Router, type IRouter } from "express";
import { appendFileSync } from "node:fs";
import {
  CreateMemberInvitationTokenParams,
  GetInvitationParams,
  InviteMemberBody,
  RedeemInvitationBody,
  UpdateMemberBody,
  UpdateMemberParams,
  DeleteMemberParams,
} from "@workspace/api-zod";
import { requireAuth, requireEditor } from "../middlewares/requireAuth";
import {
  WorkspaceAccessError,
  getInvitationStatus,
  inviteMember,
  isMemberRole,
  listMembers,
  redeemInvitation,
  regenerateInviteToken,
  revokeMember,
  toInviteDto,
  toMemberDto,
  updateMemberRole,
} from "../lib/workspace-access";

const router: IRouter = Router();

function sendAccessError(res: { status: (n: number) => { json: (b: unknown) => void } }, error: unknown): boolean {
  if (error instanceof WorkspaceAccessError) {
    res.status(error.statusCode).json({ error: error.message });
    return true;
  }
  return false;
}

router.get("/members", requireAuth, async (_req, res): Promise<void> => {
  const rows = await listMembers();
  res.json(rows.map(toMemberDto));
});

router.post("/members", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const parsed = InviteMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!isMemberRole(parsed.data.role)) {
    res.status(400).json({ error: "Choose whether they can edit or only view." });
    return;
  }
  try {
    const issued = await inviteMember(
      parsed.data.email,
      parsed.data.role,
      req.userEmail ?? "",
    );
    res.status(201).json(toInviteDto(issued));
  } catch (error) {
    if (!sendAccessError(res, error)) throw error;
  }
});

router.post("/members/:id/invitation-token", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const params = CreateMemberInvitationTokenParams.safeParse(req.params);
  // #region agent log
  { const _p={sessionId:'e273e6',runId:'post-fix',hypothesisId:'A',location:'members.ts:invitation-token',message:'invitation-token route hit',data:{rawParams:req.params,parseOk:params.success,parsedId:params.success?params.data.id:undefined,role:req.memberRole},timestamp:Date.now()}; try{appendFileSync('/home/runner/workspace/.cursor/debug-e273e6.log',JSON.stringify(_p)+'\n');}catch{} fetch('http://127.0.0.1:7600/ingest/a2a2da46-8d04-4e69-ad9d-61a4005dfe74',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e273e6'},body:JSON.stringify(_p)}).catch(()=>{}); }
  // #endregion
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    const issued = await regenerateInviteToken(params.data.id);
    res.status(201).json(toInviteDto(issued));
  } catch (error) {
    // #region agent log
    { const _p={sessionId:'e273e6',runId:'post-fix',hypothesisId:'C',location:'members.ts:invitation-token:catch',message:'regenerate threw',data:{errorName:error instanceof Error?error.name:'unknown',errorMessage:error instanceof Error?error.message:'unknown'},timestamp:Date.now()}; try{appendFileSync('/home/runner/workspace/.cursor/debug-e273e6.log',JSON.stringify(_p)+'\n');}catch{} fetch('http://127.0.0.1:7600/ingest/a2a2da46-8d04-4e69-ad9d-61a4005dfe74',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e273e6'},body:JSON.stringify(_p)}).catch(()=>{}); }
    // #endregion
    if (!sendAccessError(res, error)) throw error;
  }
});

router.get("/invitations/:token", async (req, res): Promise<void> => {
  const params = GetInvitationParams.safeParse(req.params);
  if (!params.success) {
    res.json({ status: "invalid" });
    return;
  }
  const result = await getInvitationStatus(params.data.token);
  res.json(result);
});

router.post("/invitations/redeem", requireAuth, async (req, res): Promise<void> => {
  const parsed = RedeemInvitationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const member = await redeemInvitation(
      parsed.data.token,
      req.userId,
      req.userEmail,
    );
    res.json(toMemberDto(member));
  } catch (error) {
    if (!sendAccessError(res, error)) throw error;
  }
});

router.patch("/members/:id", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const params = UpdateMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!isMemberRole(parsed.data.role)) {
    res.status(400).json({ error: "Choose whether they can edit or only view." });
    return;
  }
  try {
    const updated = await updateMemberRole(params.data.id, parsed.data.role);
    res.json(toMemberDto(updated));
  } catch (error) {
    if (!sendAccessError(res, error)) throw error;
  }
});

router.delete("/members/:id", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const params = DeleteMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    await revokeMember(params.data.id, req.userEmail ?? "");
    res.sendStatus(204);
  } catch (error) {
    if (!sendAccessError(res, error)) throw error;
  }
});

export default router;
