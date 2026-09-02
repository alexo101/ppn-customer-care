import { Router, type IRouter } from "express";
import {
  GetAgentConversationSettingsParams,
  UpdateAgentConversationSettingsBody,
  UpdateAgentConversationSettingsParams,
} from "@workspace/api-zod";
import { requireAuth, requireEditor } from "../middlewares/requireAuth";
import { getOwnedAgent } from "../lib/agents";
import {
  ConversationSettingsError,
  getAgentConversationSettings,
  updateAgentConversationSettings,
} from "../lib/conversation-settings";

const router: IRouter = Router();

router.get(
  "/agents/:id/conversation-settings",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = GetAgentConversationSettingsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const agent = await getOwnedAgent(req.userId, params.data.id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found." });
      return;
    }
    res.json(await getAgentConversationSettings(agent.id));
  },
);

router.patch(
  "/agents/:id/conversation-settings",
  requireAuth,
  requireEditor,
  async (req, res): Promise<void> => {
    const params = UpdateAgentConversationSettingsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateAgentConversationSettingsBody.safeParse(req.body);
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
      res.json(
        await updateAgentConversationSettings(agent.id, {
          autoCloseDays: parsed.data.autoCloseDays,
          autoCloseHours: parsed.data.autoCloseHours,
          autoCloseMinutes: parsed.data.autoCloseMinutes,
          closingMessage: parsed.data.closingMessage,
          askIfResolved: parsed.data.askIfResolved,
        }),
      );
    } catch (error) {
      if (error instanceof ConversationSettingsError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      throw error;
    }
  },
);

export default router;
