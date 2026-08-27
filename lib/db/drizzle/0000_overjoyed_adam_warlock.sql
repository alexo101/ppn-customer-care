CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_analytics" (
	"conversation_id" uuid PRIMARY KEY NOT NULL,
	"resolution_status" text NOT NULL,
	"resolution_time_ms" integer,
	"interaction_count" integer DEFAULT 0 NOT NULL,
	"sources_used" text[] DEFAULT '{}' NOT NULL,
	"connectors_used" text[] DEFAULT '{}' NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost_usd" numeric(12, 8) DEFAULT '0' NOT NULL,
	"feedback_rating" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid,
	"rating" text NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"agent_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orchestrator_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid,
	"detected_category" text DEFAULT '' NOT NULL,
	"confidence_score" text DEFAULT '0' NOT NULL,
	"secondary_categories" text[] DEFAULT '{}' NOT NULL,
	"detected_entities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rule_used" text DEFAULT 'None' NOT NULL,
	"data_sources_queried" text[] DEFAULT '{}' NOT NULL,
	"prompt_assembled" text DEFAULT '' NOT NULL,
	"tokens_used" text DEFAULT '0' NOT NULL,
	"latency_ms" text DEFAULT '0' NOT NULL,
	"llm_model" text DEFAULT 'simulated-v1' NOT NULL,
	"resolution_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intent_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"agent_id" uuid,
	"name" text NOT NULL,
	"parent_id" uuid,
	"description" text DEFAULT '' NOT NULL,
	"examples" text[] DEFAULT '{}' NOT NULL,
	"confidence_threshold" numeric DEFAULT '0.7' NOT NULL,
	"keywords" text[] DEFAULT '{}' NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orchestrator_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"agent_id" uuid,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"prompt_template" text DEFAULT '' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"requires_clarification_prompt" text DEFAULT '' NOT NULL,
	"escalation_trigger" boolean DEFAULT false NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"condition_operator" text DEFAULT 'is' NOT NULL,
	"action" text DEFAULT 'search answer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_audience_target_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	CONSTRAINT "rule_audience_target_links_rule_id_target_id" UNIQUE("rule_id","target_id")
);
--> statement-breakpoint
CREATE TABLE "rule_category_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "rule_category_links_rule_id_category_id" UNIQUE("rule_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "rule_connector_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"connector_id" uuid NOT NULL,
	CONSTRAINT "rule_connector_links_rule_id_connector_id" UNIQUE("rule_id","connector_id")
);
--> statement-breakpoint
CREATE TABLE "rule_source_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	CONSTRAINT "rule_source_links_rule_id_source_id" UNIQUE("rule_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "rule_vocabularies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"agent_id" uuid,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"slug" text NOT NULL,
	"requires_source" boolean DEFAULT false NOT NULL,
	"is_builtin" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_connectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"agent_id" uuid,
	"name" text NOT NULL,
	"endpoint_pattern" text NOT NULL,
	"auth_type" text NOT NULL,
	"auth_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"agent_id" uuid,
	"name" text NOT NULL,
	"source_type" text NOT NULL,
	"connection_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appearance_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"agent_id" uuid,
	"website_url" text,
	"cta_color" text DEFAULT '#0EA5E9' NOT NULL,
	"background_color" text DEFAULT '#F8FAFC' NOT NULL,
	"logo_url" text,
	"imported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"agent_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audience_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"agent_id" uuid,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"match_mode" text DEFAULT 'all' NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "target_conditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_id" uuid NOT NULL,
	"person_type" text NOT NULL,
	"attribute" text NOT NULL,
	"operator" text NOT NULL,
	"value" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"original_name" text DEFAULT 'image' NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"checksum" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"alt_text" text DEFAULT '' NOT NULL,
	"ocr_text" text DEFAULT '' NOT NULL,
	"vision_description" text DEFAULT '' NOT NULL,
	"processing_status" text DEFAULT 'pending' NOT NULL,
	"processing_error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_assets_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "knowledge_chunk_assets" (
	"chunk_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	CONSTRAINT "knowledge_chunk_assets_chunk_id_asset_id_pk" PRIMARY KEY("chunk_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "agent_connector_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"connector_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_connector_assignments_agent_connector_unique" UNIQUE("agent_id","connector_id")
);
--> statement-breakpoint
CREATE TABLE "agent_source_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_source_assignments_agent_source_unique" UNIQUE("agent_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "agent_deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_settings" (
	"agent_id" uuid PRIMARY KEY NOT NULL,
	"prompt" text DEFAULT '' NOT NULL,
	"target_audience" text DEFAULT '' NOT NULL,
	"llm_provider" text DEFAULT 'openai' NOT NULL,
	"llm_model" text DEFAULT '' NOT NULL,
	"temperature" text DEFAULT '0.2' NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"clerk_user_id" text,
	"role" text DEFAULT 'viewer' NOT NULL,
	"invited_by_email" text,
	"invite_token_hash" text,
	"invite_token_prefix" text,
	"invite_expires_at" timestamp with time zone,
	"invite_redeemed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_email_unique" UNIQUE("email"),
	CONSTRAINT "workspace_members_invite_token_hash_unique" UNIQUE("invite_token_hash")
);
--> statement-breakpoint
ALTER TABLE "conversation_analytics" ADD CONSTRAINT "conversation_analytics_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_feedback" ADD CONSTRAINT "conversation_feedback_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestrator_logs" ADD CONSTRAINT "orchestrator_logs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intent_categories" ADD CONSTRAINT "intent_categories_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestrator_rules" ADD CONSTRAINT "orchestrator_rules_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_audience_target_links" ADD CONSTRAINT "rule_audience_target_links_rule_id_orchestrator_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."orchestrator_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_audience_target_links" ADD CONSTRAINT "rule_audience_target_links_target_id_audience_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."audience_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_category_links" ADD CONSTRAINT "rule_category_links_rule_id_orchestrator_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."orchestrator_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_category_links" ADD CONSTRAINT "rule_category_links_category_id_intent_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."intent_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_connector_links" ADD CONSTRAINT "rule_connector_links_rule_id_orchestrator_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."orchestrator_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_connector_links" ADD CONSTRAINT "rule_connector_links_connector_id_api_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."api_connectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_source_links" ADD CONSTRAINT "rule_source_links_rule_id_orchestrator_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."orchestrator_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_source_links" ADD CONSTRAINT "rule_source_links_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_vocabularies" ADD CONSTRAINT "rule_vocabularies_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_connectors" ADD CONSTRAINT "api_connectors_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appearance_settings" ADD CONSTRAINT "appearance_settings_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_questions" ADD CONSTRAINT "training_questions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_targets" ADD CONSTRAINT "audience_targets_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "target_conditions" ADD CONSTRAINT "target_conditions_target_id_audience_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."audience_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_assets" ADD CONSTRAINT "knowledge_assets_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunk_assets" ADD CONSTRAINT "knowledge_chunk_assets_chunk_id_knowledge_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."knowledge_chunks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunk_assets" ADD CONSTRAINT "knowledge_chunk_assets_asset_id_knowledge_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."knowledge_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_connector_assignments" ADD CONSTRAINT "agent_connector_assignments_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_connector_assignments" ADD CONSTRAINT "agent_connector_assignments_connector_id_api_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."api_connectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_source_assignments" ADD CONSTRAINT "agent_source_assignments_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_source_assignments" ADD CONSTRAINT "agent_source_assignments_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_deployments" ADD CONSTRAINT "agent_deployments_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_settings" ADD CONSTRAINT "agent_settings_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_chunks_embedding_idx" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);