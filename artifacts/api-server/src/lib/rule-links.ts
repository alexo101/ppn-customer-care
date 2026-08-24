import { eq } from "drizzle-orm";
import {
  db,
  ruleAudienceTargetLinksTable,
  ruleCategoryLinksTable,
  ruleConnectorLinksTable,
  ruleSourceLinksTable,
} from "@workspace/db";

type DbExecutor = Pick<typeof db, "delete" | "insert">;

export function uniqueLinkIds(ids: string[] | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids ?? []) {
    const value = id.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function ruleSaveClientMessage(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  if (code === "23503") {
    return "Could not save this rule because a selected category, source, connector, or audience is no longer available.";
  }
  if (code === "42P01") {
    return "Could not save this rule because the database is missing a required table. Please try again after setup completes.";
  }
  return "Could not save this rule. Please try again.";
}

export async function replaceRuleLinks(
  tx: DbExecutor,
  ruleId: string,
  categoryIds: string[] | undefined,
  sourceIds: string[] | undefined,
  connectorIds: string[] | undefined,
  audienceTargetIds: string[] | undefined,
): Promise<void> {
  const uniqueCategories = uniqueLinkIds(categoryIds);
  const uniqueSources = uniqueLinkIds(sourceIds);
  const uniqueConnectors = uniqueLinkIds(connectorIds);
  const uniqueAudienceTargets = uniqueLinkIds(audienceTargetIds);

  await tx
    .delete(ruleCategoryLinksTable)
    .where(eq(ruleCategoryLinksTable.ruleId, ruleId));
  await tx
    .delete(ruleSourceLinksTable)
    .where(eq(ruleSourceLinksTable.ruleId, ruleId));
  await tx
    .delete(ruleConnectorLinksTable)
    .where(eq(ruleConnectorLinksTable.ruleId, ruleId));
  await tx
    .delete(ruleAudienceTargetLinksTable)
    .where(eq(ruleAudienceTargetLinksTable.ruleId, ruleId));

  if (uniqueCategories.length > 0) {
    await tx.insert(ruleCategoryLinksTable).values(
      uniqueCategories.map((categoryId) => ({ ruleId, categoryId })),
    );
  }
  if (uniqueSources.length > 0) {
    await tx
      .insert(ruleSourceLinksTable)
      .values(uniqueSources.map((sourceId) => ({ ruleId, sourceId })));
  }
  if (uniqueConnectors.length > 0) {
    await tx.insert(ruleConnectorLinksTable).values(
      uniqueConnectors.map((connectorId) => ({ ruleId, connectorId })),
    );
  }
  if (uniqueAudienceTargets.length > 0) {
    await tx.insert(ruleAudienceTargetLinksTable).values(
      uniqueAudienceTargets.map((targetId) => ({ ruleId, targetId })),
    );
  }
}

export function databaseErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") {
    return { message: String(error) };
  }
  const record = error as {
    name?: unknown;
    message?: unknown;
    code?: unknown;
    constraint?: unknown;
    table?: unknown;
  };
  return {
    name: typeof record.name === "string" ? record.name : undefined,
    message: typeof record.message === "string" ? record.message : String(error),
    code: typeof record.code === "string" ? record.code : undefined,
    constraint:
      typeof record.constraint === "string" ? record.constraint : undefined,
    table: typeof record.table === "string" ? record.table : undefined,
  };
}
