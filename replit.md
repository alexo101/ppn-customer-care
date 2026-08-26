# Customer Support AI Orchestrator

An authenticated support assistant that classifies questions, selects configured rules, retrieves knowledge, and generates grounded answers.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required for live orchestration and indexing: `OPENAI_API_KEY`
- Optional LLM configuration: `CLASSIFICATION_MODEL` and `ANSWER_MODEL` (default `gpt-5-nano`), `EMBEDDING_MODEL` (verified against the OpenAI project; must produce 1,536-dimensional vectors)
- Optional provider selectors: `CLASSIFICATION_LLM_PROVIDER`, `ANSWER_LLM_PROVIDER`, and `EMBEDDING_LLM_PROVIDER` (default `openai`)
- Managed API connector credentials use deployment environment variables; they are never returned to clients.
- Before pushing the schema, enable pgvector once: `CREATE EXTENSION IF NOT EXISTS vector;`
- This deployment is a single company: one shared set of agents, sources, and rules. Knowledge sources are in-app articles plus uploaded `.docx` and `.xlsx` files.
- Agent deployment tokens require `CONNECTION_ENCRYPTION_KEY`.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/routes/conversations.ts` — authenticated conversation API and orchestrator workflow
- `artifacts/api-server/src/lib/llm/` — OpenAI classification, answer, embedding, and rule-authoring providers
- `artifacts/api-server/src/lib/retrieval.ts` — pgvector similarity retrieval
- `artifacts/api-server/src/lib/knowledge-indexing.ts` — document chunking and embedding for articles, Word, and Excel files
- `artifacts/api-server/src/lib/api-connector.ts` — approved generic REST connector execution
- `artifacts/api-server/src/lib/conversation-lifecycle.ts` — inactive-conversation auto-close sweep
- `artifacts/api-server/src/lib/conversation-analytics.ts` — resolution and cost rollups
- `lib/db/src/schema/` — Drizzle/Postgres source-of-truth, including `knowledge-chunks.ts`

## Architecture decisions

- Runtime classification and answer generation fail with HTTP 503 when the LLM is unavailable; they do not silently fall back to heuristics.
- Greeting and resolution messages use deterministic shortcuts and do not require an LLM call.
- Uploaded `.docx` and `.xlsx` files and in-app articles are chunked and indexed with a project-verified embedding model that produces 1,536-dimensional vectors. An explicit refresh re-chunks and replaces stored embeddings.
- The orchestrator chooses the highest probability category returned by the classifier, then applies the highest-priority matching rule.
- Conversation statuses follow active, pending clarification, escalated, resolved, and closed states; resolved/closed conversations receive analytics rollups and inactive conversations are closed after one hour.
- `query_live_data` rules call linked enabled API connectors. Connector secrets come from deployment environment variables.

## Product

- Configure agents, categories, rules, audience targets, and knowledge sources.
- Inspect per-message orchestration stages, confidence, retrieved sources, and LLM logs.
- Answer user questions with responses grounded in linked knowledge-source content.

## User preferences

The runtime answer and classification models should use `gpt-5-nano` in Replit because `gpt-5.6-luna` is not available there.

## Gotchas

- Run `CREATE EXTENSION IF NOT EXISTS vector;` before `pnpm --filter @workspace/db run push`.
- Existing document and article sources are re-indexed on API startup when the verified embedding model changes. You can also run `pnpm --filter @workspace/scripts run reindex-knowledge-sources`.
- Source indexing is queued after source creation/update; an indexing failure is logged and does not roll back the source save.
- New connector and conversation analytics tables require the database schema push before deploying the API.
- The API server runs the inactivity sweep every five minutes in non-test environments.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
