import { Router, type IRouter } from "express";
import { and, count, eq } from "drizzle-orm";
import { db, trainingQuestionsTable } from "@workspace/db";
import { requireAuth, requireEditor } from "../middlewares/requireAuth";
import {
  ListTrainingQuestionsQueryParams,
  CreateTrainingQuestionBody,
  BulkCreateTrainingQuestionsBody,
  UpdateTrainingQuestionParams,
  UpdateTrainingQuestionBody,
  DeleteTrainingQuestionParams,
} from "@workspace/api-zod";
import { getOwnedAgent } from "../lib/agents";

const router: IRouter = Router();

export const MAX_TRAINING_QUESTIONS = 200;
const MAX_QUESTION_LENGTH = 2000;

function normalizeQuestion(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toTrainingQuestion(row: typeof trainingQuestionsTable.$inferSelect) {
  return {
    id: row.id,
    agentId: row.agentId,
    content: row.content,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

async function countQuestions(userId: string, agentId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(trainingQuestionsTable)
    .where(and(eq(trainingQuestionsTable.userId, userId), eq(trainingQuestionsTable.agentId, agentId)));
  return Number(row?.value ?? 0);
}

router.get("/training-questions", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListTrainingQuestionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const agent = await getOwnedAgent(req.userId, parsed.data.agentId);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const rows = await db
    .select()
    .from(trainingQuestionsTable)
    .where(
      and(
        eq(trainingQuestionsTable.userId, req.userId),
        eq(trainingQuestionsTable.agentId, parsed.data.agentId),
      ),
    )
    .orderBy(trainingQuestionsTable.createdAt);

  res.json(rows.map(toTrainingQuestion));
});

router.post("/training-questions", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const parsed = CreateTrainingQuestionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const content = normalizeQuestion(parsed.data.content);
  if (!content) {
    res.status(400).json({ error: "Question text is required." });
    return;
  }
  if (content.length > MAX_QUESTION_LENGTH) {
    res.status(400).json({ error: `Questions can be at most ${MAX_QUESTION_LENGTH} characters.` });
    return;
  }

  const agent = await getOwnedAgent(req.userId, parsed.data.agentId);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const existing = await countQuestions(req.userId, parsed.data.agentId);
  if (existing >= MAX_TRAINING_QUESTIONS) {
    res.status(409).json({ error: `This agent already has the maximum of ${MAX_TRAINING_QUESTIONS} training questions.` });
    return;
  }

  const [row] = await db
    .insert(trainingQuestionsTable)
    .values({
      userId: req.userId,
      agentId: parsed.data.agentId,
      content,
    })
    .returning();

  res.status(201).json(toTrainingQuestion(row));
});

router.post("/training-questions/bulk", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const parsed = BulkCreateTrainingQuestionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const agent = await getOwnedAgent(req.userId, parsed.data.agentId);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const seen = new Set<string>();
  const incoming: string[] = [];
  for (const raw of parsed.data.questions) {
    const content = normalizeQuestion(raw);
    if (!content || content.length > MAX_QUESTION_LENGTH) continue;
    const key = content.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    incoming.push(content);
  }

  const existingRows = await db
    .select({ content: trainingQuestionsTable.content })
    .from(trainingQuestionsTable)
    .where(
      and(
        eq(trainingQuestionsTable.userId, req.userId),
        eq(trainingQuestionsTable.agentId, parsed.data.agentId),
      ),
    );

  const existingKeys = new Set(existingRows.map((row) => row.content.toLowerCase()));
  const uniqueIncoming = incoming.filter((content) => !existingKeys.has(content.toLowerCase()));
  const remaining = Math.max(0, MAX_TRAINING_QUESTIONS - existingRows.length);
  const toInsert = uniqueIncoming.slice(0, remaining);
  const skipped = incoming.length - toInsert.length;
  const limitReached = remaining === 0 || uniqueIncoming.length > remaining;

  if (toInsert.length === 0) {
    res.status(201).json({ created: [], skipped, limitReached });
    return;
  }

  const rows = await db
    .insert(trainingQuestionsTable)
    .values(
      toInsert.map((content) => ({
        userId: req.userId,
        agentId: parsed.data.agentId,
        content,
      })),
    )
    .returning();

  res.status(201).json({
    created: rows.map(toTrainingQuestion),
    skipped,
    limitReached,
  });
});

router.patch("/training-questions/:id", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const params = UpdateTrainingQuestionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateTrainingQuestionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.content === undefined) {
    res.status(400).json({ error: "Question text is required." });
    return;
  }

  const content = normalizeQuestion(parsed.data.content);
  if (!content) {
    res.status(400).json({ error: "Question text is required." });
    return;
  }
  if (content.length > MAX_QUESTION_LENGTH) {
    res.status(400).json({ error: `Questions can be at most ${MAX_QUESTION_LENGTH} characters.` });
    return;
  }

  const [row] = await db
    .update(trainingQuestionsTable)
    .set({ content, updatedAt: new Date() })
    .where(
      and(
        eq(trainingQuestionsTable.id, params.data.id),
        eq(trainingQuestionsTable.userId, req.userId),
      ),
    )
    .returning();

  if (!row) {
    res.status(404).json({ error: "Question not found" });
    return;
  }

  res.json(toTrainingQuestion(row));
});

router.delete("/training-questions/:id", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const params = DeleteTrainingQuestionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const deleted = await db
    .delete(trainingQuestionsTable)
    .where(
      and(
        eq(trainingQuestionsTable.id, params.data.id),
        eq(trainingQuestionsTable.userId, req.userId),
      ),
    )
    .returning({ id: trainingQuestionsTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Question not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
