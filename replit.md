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
- Optional LLM configuration: `CLASSIFICATION_MODEL` and `ANSWER_MODEL` (default `gpt-5-nano`), `EMBEDDING_MODEL` (default `text-embedding-3-small`)
- Optional provider selectors: `CLASSIFICATION_LLM_PROVIDER`, `ANSWER_LLM_PROVIDER`, and `EMBEDDING_LLM_PROVIDER` (default `openai`)
- API connector credentials are configured with environment variables referenced by each connector's `authConfig` (for example `CONNECTOR_ACME_TOKEN`); secret values are never stored in the database.
- Before pushing the schema, enable pgvector once: `CREATE EXTENSION IF NOT EXISTS vector;`

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
- `artifacts/api-server/src/lib/knowledge-indexing.ts` — document chunking, embedding, and Notion/Confluence refresh
- `artifacts/api-server/src/lib/replit-integrations.ts` — Replit Integrations connection status and authenticated provider proxy
- `artifacts/api-server/src/lib/notion-knowledge.ts` / `confluence-knowledge.ts` — scoped listing and content normalization
- `artifacts/api-server/src/lib/api-connector.ts` — approved generic REST connector execution
- `artifacts/api-server/src/lib/conversation-lifecycle.ts` — inactive-conversation auto-close sweep
- `artifacts/api-server/src/lib/conversation-analytics.ts` — resolution and cost rollups
- `lib/db/src/schema/` — Drizzle/Postgres source-of-truth, including `knowledge-chunks.ts`

## Architecture decisions

- Runtime classification and answer generation fail with HTTP 503 when the LLM is unavailable; they do not silently fall back to heuristics.
- Greeting and resolution messages use deterministic shortcuts and do not require an LLM call.
- Uploaded `.docx` files, Notion pages/databases, and Confluence spaces/pages are chunked and indexed with `text-embedding-3-small`. Notion and Confluence use Replit Integrations rather than stored API keys; an explicit refresh re-fetches and replaces chunks.
- The orchestrator chooses the highest probability category returned by the classifier, then applies the highest-priority matching rule.
- Conversation statuses follow active, pending clarification, escalated, resolved, and closed states; resolved/closed conversations receive analytics rollups and inactive conversations are closed after one hour.
- `query_live_data` rules call their linked enabled API connectors with environment-backed authentication; missing credentials fail the workflow rather than silently sending ungrounded data.

## Product

- Configure agents, categories, rules, audience targets, and knowledge sources.
- Inspect per-message orchestration stages, confidence, retrieved sources, and LLM logs.
- Answer user questions with responses grounded in linked knowledge-source content.

## User preferences

The runtime answer and classification models should use `gpt-5-nano` in Replit because `gpt-5.6-luna` is not available there.

## Gotchas

- Run `CREATE EXTENSION IF NOT EXISTS vector;` before `pnpm --filter @workspace/db run push`.
- Existing document sources need `pnpm --filter @workspace/scripts run reindex-knowledge-sources` after the vector schema is applied.
- Source indexing is queued after source creation/update; an indexing failure is logged and does not roll back the source save.
- New connector and conversation analytics tables require the database schema push before deploying the API.
- The API server runs the inactivity sweep every five minutes in non-test environments.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
