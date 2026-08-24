import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  knowledgeChunksTable,
  knowledgeSourcesTable,
} from "@workspace/db";
import { agentSourceAssignmentsTable, teamSourceGrantsTable } from "@workspace/db";
import type { EmbeddingProvider, RetrievedChunk } from "./llm";

export async function retrieveRelevantChunks(
  sourceIds: string[],
  queryText: string,
  embeddingProvider: EmbeddingProvider,
  limit = 5,
  scope?: { teamId?: string; agentId?: string },
): Promise<{ chunks: RetrievedChunk[]; totalTokens: number; model: string }> {
  if (sourceIds.length === 0 || !queryText.trim()) {
    return { chunks: [], totalTokens: 0, model: "none" };
  }
  const embeddingResult = await embeddingProvider.embed([queryText]);
  const queryEmbedding = embeddingResult.embeddings[0];
  if (!queryEmbedding) {
    throw new Error("The embedding model returned no query embedding.");
  }
  const distance = sql<number>`${knowledgeChunksTable.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`;
  const rows = await db
    .select({
      sourceId: knowledgeChunksTable.sourceId,
      sourceName: knowledgeSourcesTable.name,
      content: knowledgeChunksTable.content,
      distance,
    })
    .from(knowledgeChunksTable)
    .innerJoin(
      knowledgeSourcesTable,
      eq(knowledgeChunksTable.sourceId, knowledgeSourcesTable.id),
    )
    .where(
      and(
        inArray(knowledgeChunksTable.sourceId, sourceIds),
        eq(knowledgeSourcesTable.isEnabled, true),
        scope?.teamId ? eq(knowledgeSourcesTable.teamId, scope.teamId) : undefined,
        scope?.teamId
          ? sql`EXISTS (
              SELECT 1 FROM ${teamSourceGrantsTable} grant_row
              WHERE grant_row.source_id = ${knowledgeSourcesTable.id}
                AND grant_row.team_id = ${scope.teamId}
            )`
          : undefined,
        scope?.agentId
          ? sql`EXISTS (
              SELECT 1 FROM ${agentSourceAssignmentsTable} assignment
              WHERE assignment.source_id = ${knowledgeSourcesTable.id}
                AND assignment.agent_id = ${scope.agentId}
            )`
          : undefined,
        sql`(${knowledgeSourcesTable.connectionConfig}->>'embeddingModel') = ${embeddingResult.model}`,
      ),
    )
    .orderBy(asc(distance))
    .limit(Math.max(1, Math.min(limit, 20)));

  return {
    chunks: rows.map((row) => ({
      sourceId: row.sourceId,
      sourceName: row.sourceName,
      content: row.content,
      distance: Number(row.distance),
    })),
    totalTokens: embeddingResult.totalTokens,
    model: embeddingResult.model,
  };
}
