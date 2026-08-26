import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, intentCategoriesTable } from "@workspace/db";
import { requireAuth, requireEditor } from "../middlewares/requireAuth";
import {
  ListCategoriesQueryParams,
  CreateCategoryBody,
  UpdateCategoryParams,
  UpdateCategoryBody,
  DeleteCategoryParams,
} from "@workspace/api-zod";
import { getOwnedAgent } from "../lib/agents";

const router: IRouter = Router();

router.get("/categories", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListCategoriesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const agentId = parsed.data.agentId;
  if (agentId) {
    const agent = await getOwnedAgent(req.userId, agentId);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
  }

  const where = agentId
    ? eq(intentCategoriesTable.agentId, agentId)
    : undefined;

  const rows = await db
    .select()
    .from(intentCategoriesTable)
    .where(where)
    .orderBy(intentCategoriesTable.sortOrder, intentCategoriesTable.name);
  res.json(rows.map(toCategory));
});

router.post("/categories", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let agentId = parsed.data.agentId ?? null;
  if (!agentId) {
    res.status(400).json({ error: "agentId is required." });
    return;
  }
  const agent = await getOwnedAgent(req.userId, agentId);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const [row] = await db
    .insert(intentCategoriesTable)
    .values({
      userId: req.userId,
      agentId,
      name: parsed.data.name,
      parentId: parsed.data.parentId ?? null,
      description: parsed.data.description ?? "",
      examples: parsed.data.examples ?? [],
      confidenceThreshold: String(parsed.data.confidenceThreshold ?? 0.7),
      keywords: parsed.data.keywords ?? [],
      isEnabled: parsed.data.isEnabled ?? true,
      sortOrder: parsed.data.sortOrder ?? 0,
    })
    .returning();

  res.status(201).json(toCategory(row));
});

router.patch("/categories/:id", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const params = UpdateCategoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if ((parsed.data as Record<string, unknown>).parentId !== undefined)
    updates.parentId = (parsed.data as Record<string, unknown>).parentId;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.examples !== undefined) updates.examples = parsed.data.examples;
  if (parsed.data.confidenceThreshold !== undefined)
    updates.confidenceThreshold = String(parsed.data.confidenceThreshold);
  if (parsed.data.keywords !== undefined) updates.keywords = parsed.data.keywords;
  if (parsed.data.isEnabled !== undefined) updates.isEnabled = parsed.data.isEnabled;
  if (parsed.data.sortOrder !== undefined) updates.sortOrder = parsed.data.sortOrder;
  updates.updatedAt = new Date();

  const [row] = await db
    .update(intentCategoriesTable)
    .set(updates)
    .where(eq(intentCategoriesTable.id, params.data.id))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  res.json(toCategory(row));
});

router.delete("/categories/:id", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const params = DeleteCategoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db
    .delete(intentCategoriesTable)
    .where(eq(intentCategoriesTable.parentId, params.data.id));

  const deleted = await db
    .delete(intentCategoriesTable)
    .where(eq(intentCategoriesTable.id, params.data.id))
    .returning({ id: intentCategoriesTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  res.sendStatus(204);
});

function toCategory(row: typeof intentCategoriesTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parentId ?? null,
    description: row.description,
    examples: (row.examples as string[]) ?? [],
    confidenceThreshold: Number(row.confidenceThreshold),
    keywords: (row.keywords as string[]) ?? [],
    isEnabled: row.isEnabled,
    sortOrder: row.sortOrder,
    agentId: row.agentId ?? null,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export default router;
