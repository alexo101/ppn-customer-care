import { Router, type IRouter } from "express";
import { eq, and, or, isNull } from "drizzle-orm";
import { db, intentCategoriesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import {
  CreateCategoryBody,
  UpdateCategoryParams,
  UpdateCategoryBody,
  DeleteCategoryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// Returns categories belonging to the authenticated user,
// plus categories with no owner (seeded system defaults).
router.get("/categories", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(intentCategoriesTable)
    .where(or(eq(intentCategoriesTable.userId, req.userId), isNull(intentCategoriesTable.userId)))
    .orderBy(intentCategoriesTable.sortOrder, intentCategoriesTable.name);
  res.json(rows.map(toCategory));
});

router.post("/categories", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [row] = await db
    .insert(intentCategoriesTable)
    .values({
      userId: req.userId,
      name: parsed.data.name,
      parentId: (parsed.data as Record<string, unknown>).parentId as string | null ?? null,
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

router.patch("/categories/:id", requireAuth, async (req, res): Promise<void> => {
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

  // Only allow editing categories the user owns or system defaults
  const [row] = await db
    .update(intentCategoriesTable)
    .set(updates)
    .where(
      and(
        eq(intentCategoriesTable.id, params.data.id),
        or(eq(intentCategoriesTable.userId, req.userId), isNull(intentCategoriesTable.userId))
      )
    )
    .returning();

  if (!row) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  res.json(toCategory(row));
});

router.delete("/categories/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteCategoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Delete all nested subcategories of this category first
  await db
    .delete(intentCategoriesTable)
    .where(
      and(
        eq(intentCategoriesTable.parentId, params.data.id),
        or(eq(intentCategoriesTable.userId, req.userId), isNull(intentCategoriesTable.userId))
      )
    );

  // Only allow deleting categories the user owns or system defaults
  const deleted = await db
    .delete(intentCategoriesTable)
    .where(
      and(
        eq(intentCategoriesTable.id, params.data.id),
        or(eq(intentCategoriesTable.userId, req.userId), isNull(intentCategoriesTable.userId))
      )
    )
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
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export default router;
