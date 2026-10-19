import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import {
  audienceTargetsTable,
  db,
  knowledgeArticlesTable,
  knowledgeChunkAssetsTable,
  knowledgeChunksTable,
  targetConditionsTable,
} from "@workspace/db";
import type { EmbeddingProvider, RetrievedChunk } from "./llm";
import { getKnowledgeAssetContext } from "./knowledge-assets";
import {
  matchesAudienceTarget,
  type AudienceTargetForMatching,
  type PersonAttributes,
} from "./targets";

const DEFAULT_MAX_DISTANCE = 0.45;

export function retrievalMaxDistance(): number {
  const raw = Number(process.env.RETRIEVAL_MAX_DISTANCE ?? DEFAULT_MAX_DISTANCE);
  if (!Number.isFinite(raw) || raw <= 0 || raw > 2) return DEFAULT_MAX_DISTANCE;
  return raw;
}

export function passesRetrievalThreshold(
  distance: number,
  maxDistance = retrievalMaxDistance(),
): boolean {
  return Number.isFinite(distance) && distance <= maxDistance;
}

export type EligibleArticle = {
  id: string;
  title: string;
  targetId: string | null;
};

export function isArticleRetrievalEligible(
  article: { status: string; targetId: string | null },
  matchedTargetIds: ReadonlySet<string>,
): boolean {
  if (article.status !== "published") return false;
  if (!article.targetId) return true;
  return matchedTargetIds.has(article.targetId);
}

export async function listEligiblePublishedArticles(
  agentId: string,
  person: PersonAttributes,
): Promise<EligibleArticle[]> {
  const articles = await db
    .select({
      id: knowledgeArticlesTable.id,
      title: knowledgeArticlesTable.title,
      targetId: knowledgeArticlesTable.targetId,
      status: knowledgeArticlesTable.status,
    })
    .from(knowledgeArticlesTable)
    .where(
      and(
        eq(knowledgeArticlesTable.agentId, agentId),
        eq(knowledgeArticlesTable.status, "published"),
      ),
    );
  const targetIds = [
    ...new Set(articles.map((article) => article.targetId).filter((id): id is string => Boolean(id))),
  ];
  const matchedTargetIds = await matchingTargetIds(targetIds, person);
  return articles
    .filter((article) => isArticleRetrievalEligible(article, matchedTargetIds))
    .map(({ id, title, targetId }) => ({ id, title, targetId }));
}

async function matchingTargetIds(
  targetIds: string[],
  person: PersonAttributes,
): Promise<Set<string>> {
  if (targetIds.length === 0) return new Set();
  const [targets, conditions] = await Promise.all([
    db
      .select()
      .from(audienceTargetsTable)
      .where(
        and(
          inArray(audienceTargetsTable.id, targetIds),
          eq(audienceTargetsTable.isEnabled, true),
        ),
      ),
    db
      .select()
      .from(targetConditionsTable)
      .where(inArray(targetConditionsTable.targetId, targetIds)),
  ]);
  const conditionsByTarget = new Map<string, typeof conditions>();
  for (const condition of conditions) {
    const list = conditionsByTarget.get(condition.targetId) ?? [];
    list.push(condition);
    conditionsByTarget.set(condition.targetId, list);
  }
  const matched = new Set<string>();
  for (const target of targets) {
    const audienceTarget: AudienceTargetForMatching = {
      conditions: (conditionsByTarget.get(target.id) ?? []).map((condition) => ({
        personType: condition.personType,
        attribute: condition.attribute,
        operator: condition.operator,
        value: condition.value,
      })),
    };
    if (matchesAudienceTarget(audienceTarget, person)) matched.add(target.id);
  }
  return matched;
}

export async function retrieveRelevantChunks(
  articleIds: string[],
  queryText: string,
  embeddingProvider: EmbeddingProvider,
  limit = 5,
  options: { agentId?: string; maxDistance?: number } = {},
): Promise<{
  chunks: RetrievedChunk[];
  totalTokens: number;
  model: string;
  diagnostics: {
    vectorCandidates: number;
    lexicalCandidates: number;
    lexicalAccepted: number;
  };
}> {
  if (articleIds.length === 0 || !queryText.trim()) {
    return {
      chunks: [],
      totalTokens: 0,
      model: "none",
      diagnostics: {
        vectorCandidates: 0,
        lexicalCandidates: 0,
        lexicalAccepted: 0,
      },
    };
  }
  const embeddingResult = await embeddingProvider.embed([queryText]);
  const queryEmbedding = embeddingResult.embeddings[0];
  if (!queryEmbedding) {
    throw new Error("The embedding model returned no query embedding.");
  }
  const maxDistance = options.maxDistance ?? retrievalMaxDistance();
  const distance = sql<number>`${knowledgeChunksTable.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`;
  const vectorRows = await db
    .select({
      articleId: knowledgeChunksTable.articleId,
      chunkId: knowledgeChunksTable.id,
      chunkIndex: knowledgeChunksTable.chunkIndex,
      articleTitle: knowledgeArticlesTable.title,
      content: knowledgeChunksTable.content,
      distance,
    })
    .from(knowledgeChunksTable)
    .innerJoin(
      knowledgeArticlesTable,
      eq(knowledgeChunksTable.articleId, knowledgeArticlesTable.id),
    )
    .where(
      and(
        inArray(knowledgeChunksTable.articleId, articleIds),
        eq(knowledgeArticlesTable.status, "published"),
        options.agentId ? eq(knowledgeArticlesTable.agentId, options.agentId) : undefined,
        sql`(${knowledgeArticlesTable.embeddingModel}) = ${embeddingResult.model}`,
        sql`${distance} <= ${maxDistance}`,
      ),
    )
    .orderBy(asc(distance))
    .limit(Math.max(1, Math.min(limit, 20)));

  type CandidateRow = {
    articleId: string;
    chunkId: string;
    chunkIndex: number;
    articleTitle: string;
    content: string;
    distance: number;
    lexicalScore: number;
    exactPhraseMatch: boolean;
  };
  const candidates = new Map<string, CandidateRow>();
  for (const row of vectorRows) {
    candidates.set(row.chunkId, {
      ...row,
      distance: Number(row.distance),
      lexicalScore: 0,
      exactPhraseMatch: false,
    });
  }

  const terms = lexicalSearchTerms(queryText);
  const vectorHasRelevantText = vectorRows.some(
    (row) => scoreLexicalMatch(queryText, row.content).accepted,
  );
  let lexicalCandidateCount = 0;
  let lexicalAcceptedCount = 0;
  if (terms.length > 0 && !vectorHasRelevantText) {
    const normalizedContent = sql`translate(lower(${knowledgeChunksTable.content}), 'áéíóúüñ', 'aeiouun')`;
    const lexicalConditions = terms.map(
      (term) => sql`${normalizedContent} LIKE ${`%${term}%`}`,
    );
    const lexicalRows = await db
      .select({
        articleId: knowledgeChunksTable.articleId,
        chunkId: knowledgeChunksTable.id,
        chunkIndex: knowledgeChunksTable.chunkIndex,
        articleTitle: knowledgeArticlesTable.title,
        content: knowledgeChunksTable.content,
      })
      .from(knowledgeChunksTable)
      .innerJoin(
        knowledgeArticlesTable,
        eq(knowledgeChunksTable.articleId, knowledgeArticlesTable.id),
      )
      .where(
        and(
          inArray(knowledgeChunksTable.articleId, articleIds),
          eq(knowledgeArticlesTable.status, "published"),
          options.agentId
            ? eq(knowledgeArticlesTable.agentId, options.agentId)
            : undefined,
          or(...lexicalConditions),
        ),
      )
      .limit(Math.max(12, Math.min(limit * 4, 40)));
    lexicalCandidateCount = lexicalRows.length;
    for (const row of lexicalRows) {
      const match = scoreLexicalMatch(queryText, row.content);
      if (!match.accepted) continue;
      lexicalAcceptedCount += 1;
      const semanticCandidate = candidates.get(row.chunkId);
      candidates.set(row.chunkId, {
        ...row,
        distance: semanticCandidate?.distance ?? 1,
        lexicalScore: match.score,
        exactPhraseMatch: match.exactPhraseMatch,
      });
    }
  }

  const rows = [...candidates.values()]
    .sort((left, right) => {
      const leftScore =
        left.lexicalScore * 0.6 +
        Math.max(0, 1 - left.distance / 2) * 0.4;
      const rightScore =
        right.lexicalScore * 0.6 +
        Math.max(0, 1 - right.distance / 2) * 0.4;
      return (
        rightScore - leftScore ||
        Number(right.exactPhraseMatch) - Number(left.exactPhraseMatch) ||
        left.distance - right.distance
      );
    })
    .slice(0, Math.max(1, Math.min(limit, 20)));

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
      sourceId: row.articleId,
      sourceName: row.articleTitle,
      articleId: row.articleId,
      articleName: row.articleTitle,
      content: row.content.replace(/\[\[image:[0-9a-f-]+\]\]\s*/gi, ""),
      distance: Number(row.distance),
      assets: assetContext.filter((asset) => (assetsByChunk.get(row.chunkId) ?? []).includes(asset.id)),
    })),
    totalTokens: embeddingResult.totalTokens,
    model: embeddingResult.model,
    diagnostics: {
      vectorCandidates: vectorRows.length,
      lexicalCandidates: lexicalCandidateCount,
      lexicalAccepted: lexicalAcceptedCount,
    },
  };
}

const LEXICAL_STOP_WORDS = new Set([
  "a", "al", "and", "are", "as", "at", "by", "can", "could", "de", "del",
  "do", "el", "en", "for", "from", "has", "have", "how", "i", "in", "is",
  "it", "la", "las", "lo", "los", "me", "mi", "my", "of", "on", "or",
  "para", "por", "que", "se", "si", "the", "to", "tu", "un", "una", "y",
  "yo",
]);

export function scoreLexicalMatch(
  query: string,
  content: string,
): { score: number; exactPhraseMatch: boolean; accepted: boolean } {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedContent = normalizeSearchText(content);
  if (!normalizedQuery || !normalizedContent) {
    return { score: 0, exactPhraseMatch: false, accepted: false };
  }

  const exactPhraseMatch = normalizedContent.includes(normalizedQuery);
  const terms = lexicalSearchTerms(query);
  if (terms.length === 0) {
    return {
      score: exactPhraseMatch ? 1 : 0,
      exactPhraseMatch,
      accepted: exactPhraseMatch,
    };
  }

  const matches = terms.filter((term) => normalizedContent.includes(term));
  const score = matches.length / terms.length;
  return {
    score,
    exactPhraseMatch,
    accepted:
      exactPhraseMatch || (matches.length >= 2 && score >= 0.67),
  };
}

function lexicalSearchTerms(text: string): string[] {
  const words = normalizeSearchText(text)
    .split(" ")
    .filter((word) => word.length >= 3 && !LEXICAL_STOP_WORDS.has(word));
  return [...new Set(words.map(stemSearchWord))].slice(0, 8);
}

function stemSearchWord(word: string): string {
  const suffixes = [
    "amientos",
    "imientos",
    "aciones",
    "adores",
    "adoras",
    "ando",
    "iendo",
    "ados",
    "idas",
    "idos",
    "adas",
    "aron",
    "ieron",
    "ado",
    "ido",
    "es",
    "as",
    "os",
    "en",
    "an",
    "ar",
    "er",
    "ir",
  ];
  for (const suffix of suffixes) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 4) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
