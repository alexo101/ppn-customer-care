import { OpenAIEmbeddingProvider } from "../artifacts/api-server/src/lib/llm/openai-embedding-provider";
import {
  markAllIndexableSourcesError,
  reindexAllIndexableSources,
} from "../artifacts/api-server/src/lib/knowledge-indexing";
import { pool } from "@workspace/db";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY must be set.");
}

try {
  const provider = new OpenAIEmbeddingProvider();
  const model = await provider.resolveModel();
  console.log(`Verified embedding model: ${model}`);
  const result = await reindexAllIndexableSources(provider);
  console.log(
    `Indexed ${result.indexed} sources, skipped ${result.skipped}, failed ${result.failed}`,
  );
  if (result.failed > 0) {
    process.exitCode = 1;
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const updated = await markAllIndexableSourcesError(message);
  console.error(message);
  console.error(`Marked ${updated} sources as failed.`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
