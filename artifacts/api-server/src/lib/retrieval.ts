import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  knowledgeChunksTable,
  knowledgeChunkAssetsTable,
  knowledgeSourcesTable,
  agentSourceAssignmentsTable,
} from "@workspace/db";
import type { EmbeddingProvider, RetrievedChunk } from "./llm";
import { getKnowledgeAssetContext } from "./knowledge-assets";

export async function retrieveRelevantChunks(
  sourceIds: string[],
  queryText: string,
  embeddingProvider: EmbeddingProvider,
  limit = 5,
  scope?: { agentId?: string },
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
      chunkId: knowledgeChunksTable.id,
      chunkIndex: knowledgeChunksTable.chunkIndex,
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

  const chunkIds = rows.map((row) => row.chunkId);
  const assetLinks = chunkIds.length
    ? await db
        .select({
          chunkId: knowledgeChunkAssetsTable.chunkId,
          assetId: knowledgeChunkAssetsTable.assetId,
        })
        .from(knowledgeChunkAssetsTable)
        .where(inArray(knowledgeChunkAssetsTable.chunkId, chunkIds))
    : [];
  const assetIds = [...new Set(assetLinks.map((link) => link.assetId))];
  let assetContext: Awaited<ReturnType<typeof getKnowledgeAssetContext>> = [];
  try {
    assetContext = await getKnowledgeAssetContext(assetIds);
  } catch {
    // Text retrieval remains available if private image storage is temporarily unavailable.
  }
  const assetsByChunk = new Map<string, string[]>();
  for (const link of assetLinks) {
    const ids = assetsByChunk.get(link.chunkId) ?? [];
    ids.push(link.assetId);
    assetsByChunk.set(link.chunkId, ids);
  }

  return {
    chunks: rows.map((row) => ({
      chunkId: row.chunkId,
      chunkIndex: row.chunkIndex,
      sourceId: row.sourceId,
      sourceName: row.sourceName,
      content: row.content.replace(/\[\[screenshot:[0-9a-f-]+\]\]\s*/gi, ""),
      distance: Number(row.distance),
      assets: assetContext.filter((asset) =>
        (assetsByChunk.get(row.chunkId) ?? []).includes(asset.id),
      ),
    })),
    totalTokens: embeddingResult.totalTokens,
    model: embeddingResult.model,
  };
}
