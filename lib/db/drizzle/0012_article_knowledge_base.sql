ALTER TABLE "knowledge_sources" ADD COLUMN IF NOT EXISTS "target_id" uuid;--> statement-breakpoint
CREATE TABLE "knowledge_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"agent_id" uuid NOT NULL,
	"target_id" uuid,
	"title" text NOT NULL,
	"body_html" text DEFAULT '' NOT NULL,
	"body_text" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"index_status" text DEFAULT 'idle' NOT NULL,
	"index_error" text,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"image_count" integer DEFAULT 0 NOT NULL,
	"image_failed_count" integer DEFAULT 0 NOT NULL,
	"embedding_model" text,
	"last_indexed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
INSERT INTO "knowledge_articles" (
	"id",
	"user_id",
	"agent_id",
	"target_id",
	"title",
	"body_html",
	"body_text",
	"status",
	"published_at",
	"index_status",
	"chunk_count",
	"image_count",
	"created_at",
	"updated_at"
)
SELECT
	source."id",
	source."user_id",
	source."agent_id",
	CASE
		WHEN source."target_id" IS NOT NULL
			AND EXISTS (
				SELECT 1 FROM "audience_targets" target WHERE target."id" = source."target_id"
			)
		THEN source."target_id"
		ELSE NULL
	END,
	source."name",
	CASE
		WHEN btrim(coalesce(source."connection_config"->>'body', '')) = '' THEN ''
		ELSE '<p>' || replace(
			replace(
				replace(
					replace(replace(btrim(source."connection_config"->>'body'), '&', '&amp;'), '<', '&lt;'),
					'>',
					'&gt;'
				),
				E'\r\n',
				E'\n'
			),
			E'\n',
			'</p><p>'
		) || '</p>'
	END,
	btrim(coalesce(source."connection_config"->>'body', '')),
	CASE WHEN source."is_enabled" THEN 'published' ELSE 'archived' END,
	CASE WHEN source."is_enabled" THEN source."updated_at" ELSE NULL END,
	'idle',
	0,
	0,
	source."created_at",
	source."updated_at"
FROM "knowledge_sources" source
WHERE source."source_type" = 'article'
	AND source."agent_id" IS NOT NULL;--> statement-breakpoint
UPDATE "knowledge_articles" article
SET
	"body_html" = rtrim(article."body_html") || coalesce(images.html, ''),
	"image_count" = images.image_count
FROM (
	SELECT
		asset."source_id" AS article_id,
		count(*)::int AS image_count,
		string_agg(
			'<p><img data-asset-id="' || asset."id"::text || '" alt="' ||
			replace(replace(replace(coalesce(asset."alt_text", ''), '&', '&amp;'), '"', '&quot;'), '<', '&lt;') ||
			'" /></p>',
			''
			ORDER BY asset."position", asset."created_at"
		) AS html
	FROM "knowledge_assets" asset
	GROUP BY asset."source_id"
) images
WHERE article."id" = images.article_id;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD COLUMN "article_id" uuid;--> statement-breakpoint
UPDATE "knowledge_chunks" chunk
SET "article_id" = chunk."source_id"
WHERE EXISTS (
	SELECT 1 FROM "knowledge_articles" article WHERE article."id" = chunk."source_id" AND article."status" = 'published'
);--> statement-breakpoint
DELETE FROM "knowledge_chunks" WHERE "article_id" IS NULL;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" DROP CONSTRAINT IF EXISTS "knowledge_chunks_source_id_knowledge_sources_id_fk";--> statement-breakpoint
ALTER TABLE "knowledge_chunks" DROP COLUMN "source_id";--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ALTER COLUMN "article_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_assets" ADD COLUMN "article_id" uuid;--> statement-breakpoint
UPDATE "knowledge_assets" asset
SET "article_id" = asset."source_id"
WHERE EXISTS (
	SELECT 1 FROM "knowledge_articles" article WHERE article."id" = asset."source_id"
);--> statement-breakpoint
DELETE FROM "knowledge_assets" WHERE "article_id" IS NULL;--> statement-breakpoint
ALTER TABLE "knowledge_assets" DROP CONSTRAINT IF EXISTS "knowledge_assets_source_id_knowledge_sources_id_fk";--> statement-breakpoint
ALTER TABLE "knowledge_assets" DROP COLUMN "source_id";--> statement-breakpoint
ALTER TABLE "knowledge_assets" ALTER COLUMN "article_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_target_id_audience_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."audience_targets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_article_id_knowledge_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."knowledge_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_assets" ADD CONSTRAINT "knowledge_assets_article_id_knowledge_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."knowledge_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
TRUNCATE TABLE "conversations" CASCADE;--> statement-breakpoint
ALTER TABLE "orchestrator_logs" DROP COLUMN IF EXISTS "detected_category";--> statement-breakpoint
ALTER TABLE "orchestrator_logs" DROP COLUMN IF EXISTS "confidence_score";--> statement-breakpoint
ALTER TABLE "orchestrator_logs" DROP COLUMN IF EXISTS "secondary_categories";--> statement-breakpoint
ALTER TABLE "orchestrator_logs" DROP COLUMN IF EXISTS "detected_entities";--> statement-breakpoint
ALTER TABLE "orchestrator_logs" DROP COLUMN IF EXISTS "rule_used";--> statement-breakpoint
ALTER TABLE "orchestrator_logs" DROP COLUMN IF EXISTS "data_sources_queried";--> statement-breakpoint
ALTER TABLE "orchestrator_logs" ADD COLUMN IF NOT EXISTS "articles_used" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "orchestrator_logs" ADD COLUMN IF NOT EXISTS "article_ids" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "orchestrator_logs" ADD COLUMN IF NOT EXISTS "answerable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_analytics" DROP COLUMN IF EXISTS "connectors_used";--> statement-breakpoint
ALTER TABLE "conversation_analytics" RENAME COLUMN "sources_used" TO "articles_used";--> statement-breakpoint
DROP TABLE IF EXISTS "agent_source_assignments";--> statement-breakpoint
DROP TABLE IF EXISTS "agent_connector_assignments";--> statement-breakpoint
DROP TABLE IF EXISTS "rule_source_links";--> statement-breakpoint
DROP TABLE IF EXISTS "rule_connector_links";--> statement-breakpoint
DROP TABLE IF EXISTS "rule_category_links";--> statement-breakpoint
DROP TABLE IF EXISTS "rule_audience_target_links";--> statement-breakpoint
DROP TABLE IF EXISTS "rule_vocabularies";--> statement-breakpoint
DROP TABLE IF EXISTS "orchestrator_rules";--> statement-breakpoint
DROP TABLE IF EXISTS "intent_categories";--> statement-breakpoint
DROP TABLE IF EXISTS "api_connectors";--> statement-breakpoint
DROP TABLE IF EXISTS "knowledge_sources";