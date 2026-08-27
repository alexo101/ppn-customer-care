import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetAgentEscalationParams,
  ListInboxEscalationsQueryParams,
  MarkEscalationReadParams,
  ReplyToEscalationBody,
  ReplyToEscalationParams,
  ResolveEscalationParams,
  UpdateAgentEscalationBody,
  UpdateAgentEscalationParams,
} from "@workspace/api-zod";
import { requireAuth, requireEditor } from "../middlewares/requireAuth";
import { getOwnedAgent } from "../lib/agents";
import {
  EscalationError,
  countUnreadEscalations,
  getAgentEscalation,
  listAssignedEscalations,
  markEscalationRead,
  replyToAssignedEscalation,
  resolveAssignedEscalation,
  toAssignment,
  updateAgentEscalation,
} from "../lib/escalations";

const router: IRouter = Router();

function sendEscalationError(
  res: { status: (status: number) => { json: (body: unknown) => void } },
  error: unknown,
) {
  if (!(error instanceof EscalationError)) return false;
  res.status(error.statusCode).json({ error: error.message });
  return true;
}

function memberIdOrUnauthorized(req: Request, res: Response) {
  if (req.workspaceMemberId) return req.workspaceMemberId;
  res.status(403).json({ error: "A workspace member identity is required." });
  return null;
}

router.get(
  "/agents/:id/escalation",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = GetAgentEscalationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const agent = await getOwnedAgent(req.userId, params.data.id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found." });
      return;
    }
    res.json(await getAgentEscalation(agent.id));
  },
);

router.patch(
  "/agents/:id/escalation",
  requireAuth,
  requireEditor,
  async (req, res): Promise<void> => {
    const params = UpdateAgentEscalationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateAgentEscalationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const agent = await getOwnedAgent(req.userId, params.data.id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found." });
      return;
    }
    try {
      res.json(await updateAgentEscalation(agent.id, parsed.data));
    } catch (error) {
      if (!sendEscalationError(res, error)) throw error;
    }
  },
);

router.get(
  "/inbox/escalations",
  requireAuth,
  async (req, res): Promise<void> => {
    const memberId = memberIdOrUnauthorized(req, res);
    if (!memberId) return;
    const parsed = ListInboxEscalationsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    res.json(
      await listAssignedEscalations(
        memberId,
        parsed.data.status,
        parsed.data.unreadOnly,
      ),
    );
  },
);

router.get(
  "/inbox/escalations/unread-count",
  requireAuth,
  async (req, res): Promise<void> => {
    const memberId = memberIdOrUnauthorized(req, res);
    if (!memberId) return;
    res.json({ count: await countUnreadEscalations(memberId) });
  },
);

router.post(
  "/inbox/escalations/:id/read",
  requireAuth,
  async (req, res): Promise<void> => {
    const memberId = memberIdOrUnauthorized(req, res);
    if (!memberId) return;
    const params = MarkEscalationReadParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    try {
      res.json(
        toAssignment(await markEscalationRead(params.data.id, memberId)),
      );
    } catch (error) {
      if (!sendEscalationError(res, error)) throw error;
    }
  },
);

router.post(
  "/inbox/escalations/:id/reply",
  requireAuth,
  async (req, res): Promise<void> => {
    const memberId = memberIdOrUnauthorized(req, res);
    if (!memberId) return;
    const params = ReplyToEscalationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = ReplyToEscalationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      const message = await replyToAssignedEscalation(
        params.data.id,
        memberId,
        parsed.data.content,
      );
      res.status(201).json(toMessage(message));
    } catch (error) {
      if (!sendEscalationError(res, error)) throw error;
    }
  },
);

router.post(
  "/inbox/escalations/:id/resolve",
  requireAuth,
  async (req, res): Promise<void> => {
    const memberId = memberIdOrUnauthorized(req, res);
    if (!memberId) return;
    const params = ResolveEscalationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    try {
      const escalation = await resolveAssignedEscalation(
        params.data.id,
        memberId,
      );
      const assigned = await listAssignedEscalations(memberId, "all", false);
      const result = assigned.find((item) => item.id === escalation.id);
      res.json(
        result ?? {
          ...escalation,
          agentName: "",
          isRead: true,
          retrievedInformation: Array.isArray(escalation.retrievedInformation)
            ? escalation.retrievedInformation
            : [],
          context: escalation.context ?? {},
          createdAt: escalation.createdAt.toISOString(),
          updatedAt: escalation.updatedAt.toISOString(),
          resolvedAt: escalation.resolvedAt?.toISOString() ?? null,
        },
      );
    } catch (error) {
      if (!sendEscalationError(res, error)) throw error;
    }
  },
);

function toMessage(
  message: typeof import("@workspace/db").messagesTable.$inferSelect,
) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    sender: message.sender,
    content: message.content,
    metadata: message.metadata ?? {},
    createdAt: message.createdAt.toISOString(),
  };
}

export default router;
