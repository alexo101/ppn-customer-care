import { Router, type IRouter } from "express";
import {
  InviteMemberBody,
  UpdateMemberBody,
  UpdateMemberParams,
  DeleteMemberParams,
} from "@workspace/api-zod";
import { requireAuth, requireEditor } from "../middlewares/requireAuth";
import {
  WorkspaceAccessError,
  inviteMember,
  isMemberRole,
  listMembers,
  revokeMember,
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
    const created = await inviteMember(
      parsed.data.email,
      parsed.data.role,
      req.userEmail ?? "",
    );
    res.status(201).json(toMemberDto(created));
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
