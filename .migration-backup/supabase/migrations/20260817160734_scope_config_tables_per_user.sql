/*
# Scope configuration tables per user

Each agency/account should have its own private categories, rules, sources, and connectors.
Previously these tables were shared (single-tenant USING(true) policies). This migration
adds a user_id owner column to each config table and replaces the open policies with
authenticated owner-scoped policies.

1. Modified Tables
  - `intent_categories` - Added `user_id` (uuid, nullable, DEFAULT auth.uid(), FK auth.users)
  - `orchestrator_rules` - Added `user_id` (uuid, nullable, DEFAULT auth.uid(), FK auth.users)
  - `knowledge_sources` - Added `user_id` (uuid, nullable, DEFAULT auth.uid(), FK auth.users)
  - `api_connectors` - Added `user_id` (uuid, nullable, DEFAULT auth.uid(), FK auth.users)

2. Security Changes
  - All four config tables: old anon open policies dropped, replaced with authenticated
    owner-scoped policies (SELECT/INSERT/UPDATE/DELETE by user_id).
  - `rule_category_links` - policies now scoped through parent orchestrator_rules.user_id.
  - `rule_data_sources` - policies now scoped through parent orchestrator_rules.user_id.
  - `llm_config` - remains shared (global system config, intentionally public).

3. Indexes
  - idx_intent_categories_user_id, idx_orchestrator_rules_user_id,
    idx_knowledge_sources_user_id, idx_api_connectors_user_id

4. Important Notes
  - Existing rows without a user_id will not be visible to any authenticated user.
    This is intentional — the old "generic" data belonged to no account.
  - The frontend does not pass user_id in inserts; DEFAULT auth.uid() fills it automatically.
  - llm_config stays shared so all accounts use the same LLM settings.
*/

----------------------------------------------------------------------
-- intent_categories
----------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'intent_categories' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE intent_categories ADD COLUMN user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_intent_categories_user_id ON intent_categories(user_id);

DROP POLICY IF EXISTS "anon_select_intent_categories" ON intent_categories;
DROP POLICY IF EXISTS "anon_insert_intent_categories" ON intent_categories;
DROP POLICY IF EXISTS "anon_update_intent_categories" ON intent_categories;
DROP POLICY IF EXISTS "anon_delete_intent_categories" ON intent_categories;

DROP POLICY IF EXISTS "select_own_intent_categories" ON intent_categories;
CREATE POLICY "select_own_intent_categories" ON intent_categories FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_intent_categories" ON intent_categories;
CREATE POLICY "insert_own_intent_categories" ON intent_categories FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_intent_categories" ON intent_categories;
CREATE POLICY "update_own_intent_categories" ON intent_categories FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_intent_categories" ON intent_categories;
CREATE POLICY "delete_own_intent_categories" ON intent_categories FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

----------------------------------------------------------------------
-- orchestrator_rules
----------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orchestrator_rules' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE orchestrator_rules ADD COLUMN user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orchestrator_rules_user_id ON orchestrator_rules(user_id);

DROP POLICY IF EXISTS "anon_select_orchestrator_rules" ON orchestrator_rules;
DROP POLICY IF EXISTS "anon_insert_orchestrator_rules" ON orchestrator_rules;
DROP POLICY IF EXISTS "anon_update_orchestrator_rules" ON orchestrator_rules;
DROP POLICY IF EXISTS "anon_delete_orchestrator_rules" ON orchestrator_rules;

DROP POLICY IF EXISTS "select_own_orchestrator_rules" ON orchestrator_rules;
CREATE POLICY "select_own_orchestrator_rules" ON orchestrator_rules FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_orchestrator_rules" ON orchestrator_rules;
CREATE POLICY "insert_own_orchestrator_rules" ON orchestrator_rules FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_orchestrator_rules" ON orchestrator_rules;
CREATE POLICY "update_own_orchestrator_rules" ON orchestrator_rules FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_orchestrator_rules" ON orchestrator_rules;
CREATE POLICY "delete_own_orchestrator_rules" ON orchestrator_rules FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

----------------------------------------------------------------------
-- knowledge_sources
----------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'knowledge_sources' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE knowledge_sources ADD COLUMN user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_knowledge_sources_user_id ON knowledge_sources(user_id);

DROP POLICY IF EXISTS "anon_select_knowledge_sources" ON knowledge_sources;
DROP POLICY IF EXISTS "anon_insert_knowledge_sources" ON knowledge_sources;
DROP POLICY IF EXISTS "anon_update_knowledge_sources" ON knowledge_sources;
DROP POLICY IF EXISTS "anon_delete_knowledge_sources" ON knowledge_sources;

DROP POLICY IF EXISTS "select_own_knowledge_sources" ON knowledge_sources;
CREATE POLICY "select_own_knowledge_sources" ON knowledge_sources FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_knowledge_sources" ON knowledge_sources;
CREATE POLICY "insert_own_knowledge_sources" ON knowledge_sources FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_knowledge_sources" ON knowledge_sources;
CREATE POLICY "update_own_knowledge_sources" ON knowledge_sources FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_knowledge_sources" ON knowledge_sources;
CREATE POLICY "delete_own_knowledge_sources" ON knowledge_sources FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

----------------------------------------------------------------------
-- api_connectors
----------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'api_connectors' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE api_connectors ADD COLUMN user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_api_connectors_user_id ON api_connectors(user_id);

DROP POLICY IF EXISTS "anon_select_api_connectors" ON api_connectors;
DROP POLICY IF EXISTS "anon_insert_api_connectors" ON api_connectors;
DROP POLICY IF EXISTS "anon_update_api_connectors" ON api_connectors;
DROP POLICY IF EXISTS "anon_delete_api_connectors" ON api_connectors;

DROP POLICY IF EXISTS "select_own_api_connectors" ON api_connectors;
CREATE POLICY "select_own_api_connectors" ON api_connectors FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_api_connectors" ON api_connectors;
CREATE POLICY "insert_own_api_connectors" ON api_connectors FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_api_connectors" ON api_connectors;
CREATE POLICY "update_own_api_connectors" ON api_connectors FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_api_connectors" ON api_connectors;
CREATE POLICY "delete_own_api_connectors" ON api_connectors FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

----------------------------------------------------------------------
-- rule_category_links  (scope through parent rule)
----------------------------------------------------------------------
DROP POLICY IF EXISTS "anon_select_rule_category_links" ON rule_category_links;
DROP POLICY IF EXISTS "anon_insert_rule_category_links" ON rule_category_links;
DROP POLICY IF EXISTS "anon_update_rule_category_links" ON rule_category_links;
DROP POLICY IF EXISTS "anon_delete_rule_category_links" ON rule_category_links;

DROP POLICY IF EXISTS "select_own_rule_category_links" ON rule_category_links;
CREATE POLICY "select_own_rule_category_links" ON rule_category_links FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM orchestrator_rules WHERE orchestrator_rules.id = rule_category_links.rule_id AND orchestrator_rules.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_rule_category_links" ON rule_category_links;
CREATE POLICY "insert_own_rule_category_links" ON rule_category_links FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM orchestrator_rules WHERE orchestrator_rules.id = rule_category_links.rule_id AND orchestrator_rules.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_rule_category_links" ON rule_category_links;
CREATE POLICY "update_own_rule_category_links" ON rule_category_links FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM orchestrator_rules WHERE orchestrator_rules.id = rule_category_links.rule_id AND orchestrator_rules.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM orchestrator_rules WHERE orchestrator_rules.id = rule_category_links.rule_id AND orchestrator_rules.user_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_rule_category_links" ON rule_category_links;
CREATE POLICY "delete_own_rule_category_links" ON rule_category_links FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM orchestrator_rules WHERE orchestrator_rules.id = rule_category_links.rule_id AND orchestrator_rules.user_id = auth.uid())
  );

----------------------------------------------------------------------
-- rule_data_sources  (scope through parent rule)
----------------------------------------------------------------------
DROP POLICY IF EXISTS "anon_select_rule_data_sources" ON rule_data_sources;
DROP POLICY IF EXISTS "anon_insert_rule_data_sources" ON rule_data_sources;
DROP POLICY IF EXISTS "anon_update_rule_data_sources" ON rule_data_sources;
DROP POLICY IF EXISTS "anon_delete_rule_data_sources" ON rule_data_sources;

DROP POLICY IF EXISTS "select_own_rule_data_sources" ON rule_data_sources;
CREATE POLICY "select_own_rule_data_sources" ON rule_data_sources FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM orchestrator_rules WHERE orchestrator_rules.id = rule_data_sources.rule_id AND orchestrator_rules.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_rule_data_sources" ON rule_data_sources;
CREATE POLICY "insert_own_rule_data_sources" ON rule_data_sources FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM orchestrator_rules WHERE orchestrator_rules.id = rule_data_sources.rule_id AND orchestrator_rules.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_rule_data_sources" ON rule_data_sources;
CREATE POLICY "update_own_rule_data_sources" ON rule_data_sources FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM orchestrator_rules WHERE orchestrator_rules.id = rule_data_sources.rule_id AND orchestrator_rules.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM orchestrator_rules WHERE orchestrator_rules.id = rule_data_sources.rule_id AND orchestrator_rules.user_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_rule_data_sources" ON rule_data_sources;
CREATE POLICY "delete_own_rule_data_sources" ON rule_data_sources FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM orchestrator_rules WHERE orchestrator_rules.id = rule_data_sources.rule_id AND orchestrator_rules.user_id = auth.uid())
  );