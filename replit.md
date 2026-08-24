# Customer Support AI Orchestrator

An authenticated support assistant that classifies questions, selects configured rules, retrieves knowledge, and generates grounded answers.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run migrate-tenancy` — apply the audited organization/team backfill in a transaction
- Required env: `DATABASE_URL` — Postgres connection string
- Required for live orchestration and indexing: `OPENAI_API_KEY`
- Optional LLM configuration: `CLASSIFICATION_MODEL` and `ANSWER_MODEL` (default `gpt-5-nano`), `EMBEDDING_MODEL` (verified against the OpenAI project; must produce 1,536-dimensional vectors)
- Optional provider selectors: `CLASSIFICATION_LLM_PROVIDER`, `ANSWER_LLM_PROVIDER`, and `EMBEDDING_LLM_PROVIDER` (default `openai`)
- Managed API connector credentials are encrypted in PostgreSQL and never returned to clients; legacy connectors may still reference deployment environment variables while migration is in progress.
- Before pushing the schema, enable pgvector once: `CREATE EXTENSION IF NOT EXISTS vector;`
- Managed connections require `CONNECTION_ENCRYPTION_KEY` (or a dedicated `OAUTH_STATE_SECRET`) and provider OAuth settings:
  `NOTION_OAUTH_CLIENT_ID`, `NOTION_OAUTH_CLIENT_SECRET`, `NOTION_OAUTH_AUTHORIZE_URL`, `NOTION_OAUTH_TOKEN_URL`, `NOTION_OAUTH_REDIRECT_URI` and the equivalent `CONFLUENCE_*` variables.

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
- `artifacts/api-server/src/lib/managed-integrations.ts` — organization connection proxy with explicit team grants
- `artifacts/api-server/src/lib/replit-integrations.ts` — legacy Replit Integrations compatibility during migration
- `artifacts/api-server/src/lib/notion-knowledge.ts` / `confluence-knowledge.ts` — scoped listing and content normalization
- `artifacts/api-server/src/lib/api-connector.ts` — approved generic REST connector execution
- `artifacts/api-server/src/lib/conversation-lifecycle.ts` — inactive-conversation auto-close sweep
- `artifacts/api-server/src/lib/conversation-analytics.ts` — resolution and cost rollups
- `lib/db/src/schema/` — Drizzle/Postgres source-of-truth, including `knowledge-chunks.ts`
- `lib/db/src/schema/tenancy.ts` and `connections.ts` — organizations, teams, memberships, and reusable encrypted connections

## Architecture decisions

- Runtime classification and answer generation fail with HTTP 503 when the LLM is unavailable; they do not silently fall back to heuristics.
- Greeting and resolution messages use deterministic shortcuts and do not require an LLM call.
- Uploaded `.docx` files, Notion pages/databases, and Confluence spaces/pages are chunked and indexed with a project-verified embedding model that produces 1,536-dimensional vectors. Managed Notion and Confluence connections are organization resources; team and agent grants are explicit, and an explicit refresh re-fetches and replaces chunks.
- The orchestrator chooses the highest probability category returned by the classifier, then applies the highest-priority matching rule.
- Conversation statuses follow active, pending clarification, escalated, resolved, and closed states; resolved/closed conversations receive analytics rollups and inactive conversations are closed after one hour.
- `query_live_data` rules call linked enabled API connectors. Connectors may use an organization-managed encrypted connection; the legacy environment-variable form remains supported for migration only.

## Product

- Configure agents, categories, rules, audience targets, and knowledge sources.
- Inspect per-message orchestration stages, confidence, retrieved sources, and LLM logs.
- Answer user questions with responses grounded in linked knowledge-source content.

## User preferences

The runtime answer and classification models should use `gpt-5-nano` in Replit because `gpt-5.6-luna` is not available there.

## Gotchas

- Run `CREATE EXTENSION IF NOT EXISTS vector;` before `pnpm --filter @workspace/db run push`.
- Existing document and integration sources are re-indexed on API startup when the verified embedding model changes. You can also run `pnpm --filter @workspace/scripts run reindex-knowledge-sources`.
- Source indexing is queued after source creation/update; an indexing failure is logged and does not roll back the source save.
- New connector and conversation analytics tables require the database schema push before deploying the API.
- The API server runs the inactivity sweep every five minutes in non-test environments.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
