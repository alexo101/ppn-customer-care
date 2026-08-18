/*
# Create AI Support Orchestrator Schema

This migration creates the complete database schema for the Customer Support AI Orchestrator,
which manages the full lifecycle of support requests from intent classification through resolution.

1. New Tables

  - `llm_config` - Single-row LLM provider configuration
    - `id` (uuid, primary key)
    - `provider` (text) - LLM provider name (e.g. 'openai', 'anthropic', 'simulated')
    - `model` (text) - Model identifier
    - `api_key_placeholder` (text) - Placeholder for the API key reference
    - `temperature` (numeric) - Generation temperature
    - `max_tokens` (integer) - Max tokens for response
    - `created_at` / `updated_at` (timestamptz)

  - `intent_categories` - Configurable intent classification catalog
    - `id` (uuid, primary key)
    - `name` (text) - Category name
    - `parent_id` (uuid, nullable FK to self) - Parent category for subcategories
    - `description` (text) - What this category covers
    - `examples` (text[]) - Example phrases that match this category
    - `confidence_threshold` (numeric) - Minimum confidence to select this category
    - `keywords` (text[]) - Keywords for simulated classification
    - `is_enabled` (boolean) - Whether this category is active
    - `sort_order` (integer) - Display ordering
    - `created_at` / `updated_at` (timestamptz)

  - `orchestrator_rules` - Configurable rules linked to categories
    - `id` (uuid, primary key)
    - `name` (text) - Rule name
    - `description` (text) - What this rule does
    - `prompt_template` (text) - Template for the final LLM prompt
    - `priority` (integer) - Rule priority (higher = preferred)
    - `requires_clarification_prompt` (text) - Prompt when info is missing
    - `escalation_trigger` (boolean) - Whether this rule should escalate to human
    - `is_enabled` (boolean)
    - `created_at` / `updated_at` (timestamptz)

  - `rule_category_links` - Many-to-many link between rules and categories
    - `id` (uuid, primary key)
    - `rule_id` (uuid, FK to orchestrator_rules)
    - `category_id` (uuid, FK to intent_categories)

  - `knowledge_sources` - Pluggable knowledge source registry
    - `id` (uuid, primary key)
    - `name` (text) - Source name
    - `source_type` (text) - e.g. 'notion', 'confluence', 'sharepoint'
    - `connection_config` (jsonb) - Connection configuration placeholder
    - `is_enabled` (boolean)
    - `created_at` / `updated_at` (timestamptz)

  - `api_connectors` - Pluggable API connector registry
    - `id` (uuid, primary key)
    - `name` (text) - Connector name
    - `endpoint_pattern` (text) - API endpoint pattern
    - `auth_type` (text) - e.g. 'bearer', 'api_key', 'oauth2'
    - `is_enabled` (boolean)
    - `created_at` / `updated_at` (timestamptz)

  - `rule_data_sources` - Links rules to their required knowledge sources and API connectors
    - `id` (uuid, primary key)
    - `rule_id` (uuid, FK to orchestrator_rules)
    - `knowledge_source_id` (uuid, nullable FK)
    - `api_connector_id` (uuid, nullable FK)

  - `conversations` - Chat sessions with lifecycle status tracking
    - `id` (uuid, primary key)
    - `status` (text) - One of: active, pending_clarification, escalated, resolved, closed
    - `metadata` (jsonb) - Context: user_role, current_url, etc.
    - `last_activity_at` (timestamptz)
    - `resolved_at` (timestamptz, nullable)
    - `created_at` (timestamptz)

  - `messages` - All messages in conversations
    - `id` (uuid, primary key)
    - `conversation_id` (uuid, FK to conversations)
    - `sender` (text) - 'user' or 'assistant'
    - `content` (text) - Message text
    - `created_at` (timestamptz)

  - `orchestrator_logs` - Per-interaction analytics
    - `id` (uuid, primary key)
    - `conversation_id` (uuid, FK to conversations)
    - `message_id` (uuid, FK to messages)
    - `detected_category` (text)
    - `confidence_score` (numeric)
    - `secondary_categories` (text[])
    - `detected_entities` (jsonb)
    - `rule_used` (text)
    - `data_sources_queried` (text[])
    - `prompt_assembled` (text)
    - `tokens_used` (integer)
    - `latency_ms` (integer)
    - `llm_model` (text)
    - `resolution_status` (text)
    - `created_at` (timestamptz)

  - `conversation_feedback` - User feedback on AI responses
    - `id` (uuid, primary key)
    - `conversation_id` (uuid, FK to conversations)
    - `message_id` (uuid, FK to messages)
    - `rating` (text) - 'positive' or 'negative'
    - `comment` (text, nullable)
    - `created_at` (timestamptz)

2. Security
  - RLS enabled on ALL tables.
  - All policies grant full CRUD to anon + authenticated (single-tenant, no auth, testing/demo app).

3. Indexes
  - conversations.status, conversations.last_activity_at
  - messages.conversation_id
  - intent_categories.parent_id, intent_categories.is_enabled
  - orchestrator_logs.conversation_id
  - conversation_feedback.conversation_id
  - rule_category_links.rule_id, rule_category_links.category_id

4. Important Notes
  - This is a single-tenant demo/testing application with no authentication.
  - USING(true) is intentional - all data is shared/public for testing purposes.
  - The llm_config table holds a single row for the current LLM configuration.
*/

-- LLM Configuration
CREATE TABLE IF NOT EXISTS llm_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'simulated',
  model text NOT NULL DEFAULT 'simulated-v1',
  api_key_placeholder text DEFAULT '',
  temperature numeric NOT NULL DEFAULT 0.7,
  max_tokens integer NOT NULL DEFAULT 1024,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE llm_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_llm_config" ON llm_config;
CREATE POLICY "anon_select_llm_config" ON llm_config FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_llm_config" ON llm_config;
CREATE POLICY "anon_insert_llm_config" ON llm_config FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_llm_config" ON llm_config;
CREATE POLICY "anon_update_llm_config" ON llm_config FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_llm_config" ON llm_config;
CREATE POLICY "anon_delete_llm_config" ON llm_config FOR DELETE TO anon, authenticated USING (true);

-- Intent Categories
CREATE TABLE IF NOT EXISTS intent_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  parent_id uuid REFERENCES intent_categories(id) ON DELETE SET NULL,
  description text NOT NULL DEFAULT '',
  examples text[] NOT NULL DEFAULT '{}',
  confidence_threshold numeric NOT NULL DEFAULT 0.7,
  keywords text[] NOT NULL DEFAULT '{}',
  is_enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intent_categories_parent ON intent_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_intent_categories_enabled ON intent_categories(is_enabled);

ALTER TABLE intent_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_intent_categories" ON intent_categories;
CREATE POLICY "anon_select_intent_categories" ON intent_categories FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_intent_categories" ON intent_categories;
CREATE POLICY "anon_insert_intent_categories" ON intent_categories FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_intent_categories" ON intent_categories;
CREATE POLICY "anon_update_intent_categories" ON intent_categories FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_intent_categories" ON intent_categories;
CREATE POLICY "anon_delete_intent_categories" ON intent_categories FOR DELETE TO anon, authenticated USING (true);

-- Orchestrator Rules
CREATE TABLE IF NOT EXISTS orchestrator_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  prompt_template text NOT NULL DEFAULT '',
  priority integer NOT NULL DEFAULT 0,
  requires_clarification_prompt text DEFAULT '',
  escalation_trigger boolean NOT NULL DEFAULT false,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE orchestrator_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_orchestrator_rules" ON orchestrator_rules;
CREATE POLICY "anon_select_orchestrator_rules" ON orchestrator_rules FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_orchestrator_rules" ON orchestrator_rules;
CREATE POLICY "anon_insert_orchestrator_rules" ON orchestrator_rules FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_orchestrator_rules" ON orchestrator_rules;
CREATE POLICY "anon_update_orchestrator_rules" ON orchestrator_rules FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_orchestrator_rules" ON orchestrator_rules;
CREATE POLICY "anon_delete_orchestrator_rules" ON orchestrator_rules FOR DELETE TO anon, authenticated USING (true);

-- Rule-Category Links
CREATE TABLE IF NOT EXISTS rule_category_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES orchestrator_rules(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES intent_categories(id) ON DELETE CASCADE,
  UNIQUE(rule_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_rule_category_rule ON rule_category_links(rule_id);
CREATE INDEX IF NOT EXISTS idx_rule_category_cat ON rule_category_links(category_id);

ALTER TABLE rule_category_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_rule_category_links" ON rule_category_links;
CREATE POLICY "anon_select_rule_category_links" ON rule_category_links FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_rule_category_links" ON rule_category_links;
CREATE POLICY "anon_insert_rule_category_links" ON rule_category_links FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_rule_category_links" ON rule_category_links;
CREATE POLICY "anon_update_rule_category_links" ON rule_category_links FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_rule_category_links" ON rule_category_links;
CREATE POLICY "anon_delete_rule_category_links" ON rule_category_links FOR DELETE TO anon, authenticated USING (true);

-- Knowledge Sources
CREATE TABLE IF NOT EXISTS knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  source_type text NOT NULL DEFAULT 'custom',
  connection_config jsonb NOT NULL DEFAULT '{}',
  is_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_knowledge_sources" ON knowledge_sources;
CREATE POLICY "anon_select_knowledge_sources" ON knowledge_sources FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_knowledge_sources" ON knowledge_sources;
CREATE POLICY "anon_insert_knowledge_sources" ON knowledge_sources FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_knowledge_sources" ON knowledge_sources;
CREATE POLICY "anon_update_knowledge_sources" ON knowledge_sources FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_knowledge_sources" ON knowledge_sources;
CREATE POLICY "anon_delete_knowledge_sources" ON knowledge_sources FOR DELETE TO anon, authenticated USING (true);

-- API Connectors
CREATE TABLE IF NOT EXISTS api_connectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  endpoint_pattern text NOT NULL DEFAULT '',
  auth_type text NOT NULL DEFAULT 'bearer',
  is_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE api_connectors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_api_connectors" ON api_connectors;
CREATE POLICY "anon_select_api_connectors" ON api_connectors FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_api_connectors" ON api_connectors;
CREATE POLICY "anon_insert_api_connectors" ON api_connectors FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_api_connectors" ON api_connectors;
CREATE POLICY "anon_update_api_connectors" ON api_connectors FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_api_connectors" ON api_connectors;
CREATE POLICY "anon_delete_api_connectors" ON api_connectors FOR DELETE TO anon, authenticated USING (true);

-- Rule Data Sources (join table)
CREATE TABLE IF NOT EXISTS rule_data_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES orchestrator_rules(id) ON DELETE CASCADE,
  knowledge_source_id uuid REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  api_connector_id uuid REFERENCES api_connectors(id) ON DELETE CASCADE
);

ALTER TABLE rule_data_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_rule_data_sources" ON rule_data_sources;
CREATE POLICY "anon_select_rule_data_sources" ON rule_data_sources FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_rule_data_sources" ON rule_data_sources;
CREATE POLICY "anon_insert_rule_data_sources" ON rule_data_sources FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_rule_data_sources" ON rule_data_sources;
CREATE POLICY "anon_update_rule_data_sources" ON rule_data_sources FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_rule_data_sources" ON rule_data_sources;
CREATE POLICY "anon_delete_rule_data_sources" ON rule_data_sources FOR DELETE TO anon, authenticated USING (true);

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}',
  last_activity_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_activity ON conversations(last_activity_at);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_conversations" ON conversations;
CREATE POLICY "anon_select_conversations" ON conversations FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_conversations" ON conversations;
CREATE POLICY "anon_insert_conversations" ON conversations FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_conversations" ON conversations;
CREATE POLICY "anon_update_conversations" ON conversations FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_conversations" ON conversations;
CREATE POLICY "anon_delete_conversations" ON conversations FOR DELETE TO anon, authenticated USING (true);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender text NOT NULL DEFAULT 'user',
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_messages" ON messages;
CREATE POLICY "anon_select_messages" ON messages FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_messages" ON messages;
CREATE POLICY "anon_insert_messages" ON messages FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_messages" ON messages;
CREATE POLICY "anon_update_messages" ON messages FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_messages" ON messages;
CREATE POLICY "anon_delete_messages" ON messages FOR DELETE TO anon, authenticated USING (true);

-- Orchestrator Logs
CREATE TABLE IF NOT EXISTS orchestrator_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  detected_category text,
  confidence_score numeric,
  secondary_categories text[] DEFAULT '{}',
  detected_entities jsonb DEFAULT '{}',
  rule_used text,
  data_sources_queried text[] DEFAULT '{}',
  prompt_assembled text,
  tokens_used integer DEFAULT 0,
  latency_ms integer DEFAULT 0,
  llm_model text DEFAULT 'simulated',
  resolution_status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orch_logs_conversation ON orchestrator_logs(conversation_id);

ALTER TABLE orchestrator_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_orchestrator_logs" ON orchestrator_logs;
CREATE POLICY "anon_select_orchestrator_logs" ON orchestrator_logs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_orchestrator_logs" ON orchestrator_logs;
CREATE POLICY "anon_insert_orchestrator_logs" ON orchestrator_logs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_orchestrator_logs" ON orchestrator_logs;
CREATE POLICY "anon_update_orchestrator_logs" ON orchestrator_logs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_orchestrator_logs" ON orchestrator_logs;
CREATE POLICY "anon_delete_orchestrator_logs" ON orchestrator_logs FOR DELETE TO anon, authenticated USING (true);

-- Conversation Feedback
CREATE TABLE IF NOT EXISTS conversation_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  rating text NOT NULL,
  comment text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_conversation ON conversation_feedback(conversation_id);

ALTER TABLE conversation_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_conversation_feedback" ON conversation_feedback;
CREATE POLICY "anon_select_conversation_feedback" ON conversation_feedback FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_conversation_feedback" ON conversation_feedback;
CREATE POLICY "anon_insert_conversation_feedback" ON conversation_feedback FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_conversation_feedback" ON conversation_feedback;
CREATE POLICY "anon_update_conversation_feedback" ON conversation_feedback FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_conversation_feedback" ON conversation_feedback;
CREATE POLICY "anon_delete_conversation_feedback" ON conversation_feedback FOR DELETE TO anon, authenticated USING (true);