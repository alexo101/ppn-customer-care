import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, intentCategoriesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import {
  ListCategoriesQueryParams,
  CreateCategoryBody,
  UpdateCategoryParams,
  UpdateCategoryBody,
  DeleteCategoryParams,
} from "@workspace/api-zod";
import { getOwnedAgent } from "../lib/agents";
import { getTenantContext, ensureDefaultTenant } from "../lib/tenant";

const router: IRouter = Router();

function activeTeamId(req: { headers: Record<string, string | string[] | undefined> }): string | undefined {
  return typeof req.headers["x-team-id"] === "string" ? req.headers["x-team-id"] : undefined;
}

const ownerFilter = (userId: string) =>
  eq(intentCategoriesTable.userId, userId);

router.get("/categories", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListCategoriesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const agentId = parsed.data.agentId;
  let agent: Awaited<ReturnType<typeof getOwnedAgent>> | null = null;
  if (agentId) {
    agent = await getOwnedAgent(req.userId, agentId, activeTeamId(req));
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
  }

  const where = agentId
    ? and(ownerFilter(req.userId), eq(intentCategoriesTable.agentId, agentId), eq(intentCategoriesTable.teamId, agent?.teamId ?? ""))
    : ownerFilter(req.userId);

  const rows = await db
    .select()
    .from(intentCategoriesTable)
    .where(where)
    .orderBy(intentCategoriesTable.sortOrder, intentCategoriesTable.name);
  res.json(rows.map(toCategory));
});

router.post("/categories", requireAuth, async (req, res): Promise<void> => {
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
  const agent = await getOwnedAgent(req.userId, agentId, activeTeamId(req));
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  const tenant = activeTeamId(req)
    ? await getTenantContext(req.userId, activeTeamId(req))
    : agent.teamId ? await getTenantContext(req.userId, agent.teamId) : await ensureDefaultTenant(req.userId);
  if (!tenant) {
    res.status(403).json({ error: "Invalid team context." });
    return;
  }

  const [row] = await db
    .insert(intentCategoriesTable)
    .values({
      userId: req.userId,
      organizationId: tenant.organizationId,
      teamId: tenant.teamId,
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
  const requestedTeamId = activeTeamId(req) ?? (typeof req.query.teamId === "string" ? req.query.teamId : undefined);
  const tenant = requestedTeamId ? await getTenantContext(req.userId, requestedTeamId) : await ensureDefaultTenant(req.userId);
  if (!tenant) {
    res.status(403).json({ error: "Invalid team context." });
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
        eq(intentCategoriesTable.userId, req.userId),
        eq(intentCategoriesTable.teamId, tenant.teamId),
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
  const requestedTeamId = activeTeamId(req) ?? (typeof req.query.teamId === "string" ? req.query.teamId : undefined);
  const tenant = requestedTeamId ? await getTenantContext(req.userId, requestedTeamId) : await ensureDefaultTenant(req.userId);
  if (!tenant) {
    res.status(403).json({ error: "Invalid team context." });
    return;
  }

  // Delete all nested subcategories of this category first
  await db
    .delete(intentCategoriesTable)
    .where(
      and(
        eq(intentCategoriesTable.parentId, params.data.id),
        eq(intentCategoriesTable.userId, req.userId),
        eq(intentCategoriesTable.teamId, tenant.teamId),
      )
    );

  // Only allow deleting categories the user owns or system defaults
  const deleted = await db
    .delete(intentCategoriesTable)
    .where(
      and(
        eq(intentCategoriesTable.id, params.data.id),
        eq(intentCategoriesTable.userId, req.userId),
        eq(intentCategoriesTable.teamId, tenant.teamId),
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
    agentId: row.agentId ?? null,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export default router;
