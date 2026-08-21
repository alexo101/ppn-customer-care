import OpenAI from "openai";
import { eq } from "drizzle-orm";
import {
  db,
  knowledgeChunksTable,
  knowledgeSourcesTable,
  pool,
} from "@workspace/db";

const maxChars = 1_200;
const overlap = 150;

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY must be set.");
}

function chunkText(text: string): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const chunks: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxChars) {
      const previous = chunks.at(-1);
      if (previous && previous.length + paragraph.length + 1 <= maxChars) {
        chunks[chunks.length - 1] = `${previous} ${paragraph}`;
      } else {
        chunks.push(paragraph);
      }
      continue;
    }
    for (let start = 0; start < paragraph.length; start += maxChars - overlap) {
      chunks.push(paragraph.slice(start, start + maxChars).trim());
      if (start + maxChars >= paragraph.length) break;
    }
  }
  return chunks.filter(Boolean);
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
const sources = await db.select().from(knowledgeSourcesTable);

for (const source of sources) {
  const config = source.connectionConfig as Record<string, unknown>;
  if (source.sourceType !== "document" || typeof config.text !== "string") {
    continue;
  }
  const chunks = chunkText(config.text);
  if (chunks.length === 0) {
    await db
      .delete(knowledgeChunksTable)
      .where(eq(knowledgeChunksTable.sourceId, source.id));
    console.log(`Cleared ${source.name}: no text to index`);
    continue;
  }
  const response = await client.embeddings.create({
    model,
    input: chunks,
  });
  const embeddings = response.data
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
  await db.transaction(async (tx) => {
    await tx
      .delete(knowledgeChunksTable)
      .where(eq(knowledgeChunksTable.sourceId, source.id));
    await tx.insert(knowledgeChunksTable).values(
      chunks.map((content, index) => ({
        sourceId: source.id,
        chunkIndex: index,
        content,
        embedding: embeddings[index],
      })),
    );
  });
  console.log(`Indexed ${source.name}: ${chunks.length} chunks`);
}

await pool.end();
