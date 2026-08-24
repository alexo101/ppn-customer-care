import { asc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  knowledgeChunksTable,
  knowledgeSourcesTable,
} from "@workspace/db";
import type { EmbeddingProvider, RetrievedChunk } from "./llm";

export async function retrieveRelevantChunks(
  sourceIds: string[],
  queryText: string,
  embeddingProvider: EmbeddingProvider,
  limit = 5,
): Promise<{ chunks: RetrievedChunk[]; totalTokens: number; model: string }> {
  if (sourceIds.length === 0 || !queryText.trim()) {
    return { chunks: [], totalTokens: 0, model: "none" };
  }
  // #region agent log
  fetch("http://127.0.0.1:7743/ingest/fbcc6644-f5ef-42d5-8361-4b0eb31d88ad", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "65a883",
    },
    body: JSON.stringify({
      sessionId: "65a883",
      runId: "pre-fix",
      hypothesisId: "B",
      location: "retrieval.ts:before-embed",
      message: "retrieveRelevantChunks calling embed",
      data: { sourceCount: sourceIds.length, queryLen: queryText.length },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
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
      sql`${inArray(knowledgeChunksTable.sourceId, sourceIds)} AND ${eq(knowledgeSourcesTable.isEnabled, true)}`,
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
