/*
# Add user_id ownership to conversations and scope RLS per user

1. Modified Tables
  - `conversations` - Added `user_id` (uuid, nullable, defaults to auth.uid())
    References auth.users(id) ON DELETE CASCADE.
    Nullable so existing rows without a user are preserved.

2. Security Changes
  - `conversations` - RLS policies now scoped to authenticated users by user_id.
    Users can only see/modify their own conversations.
  - `messages` - RLS policies now scoped through parent conversation's user_id.
  - `orchestrator_logs` - RLS policies now scoped through parent conversation's user_id.
  - `conversation_feedback` - RLS policies now scoped through parent conversation's user_id.

3. Indexes
  - `idx_conversations_user_id` on conversations(user_id)

4. Important Notes
  - Existing conversations without a user_id will not be visible to any authenticated user.
  - Config tables (intent_categories, orchestrator_rules, etc.) remain shared/public.
*/

-- Add user_id column to conversations
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE conversations ADD COLUMN user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);

-- Conversations: owner-scoped policies
DROP POLICY IF EXISTS "anon_select_conversations" ON conversations;
DROP POLICY IF EXISTS "anon_insert_conversations" ON conversations;
DROP POLICY IF EXISTS "anon_update_conversations" ON conversations;
DROP POLICY IF EXISTS "anon_delete_conversations" ON conversations;

CREATE POLICY "select_own_conversations" ON conversations FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "insert_own_conversations" ON conversations FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_conversations" ON conversations FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_conversations" ON conversations FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Messages: scoped through parent conversation
DROP POLICY IF EXISTS "anon_select_messages" ON messages;
DROP POLICY IF EXISTS "anon_insert_messages" ON messages;
DROP POLICY IF EXISTS "anon_update_messages" ON messages;
DROP POLICY IF EXISTS "anon_delete_messages" ON messages;

CREATE POLICY "select_own_messages" ON messages FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM conversations WHERE conversations.id = messages.conversation_id AND conversations.user_id = auth.uid())
  );

CREATE POLICY "insert_own_messages" ON messages FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM conversations WHERE conversations.id = messages.conversation_id AND conversations.user_id = auth.uid())
  );

CREATE POLICY "update_own_messages" ON messages FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM conversations WHERE conversations.id = messages.conversation_id AND conversations.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM conversations WHERE conversations.id = messages.conversation_id AND conversations.user_id = auth.uid()));

CREATE POLICY "delete_own_messages" ON messages FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM conversations WHERE conversations.id = messages.conversation_id AND conversations.user_id = auth.uid())
  );

-- Orchestrator Logs: scoped through parent conversation
DROP POLICY IF EXISTS "anon_select_orchestrator_logs" ON orchestrator_logs;
DROP POLICY IF EXISTS "anon_insert_orchestrator_logs" ON orchestrator_logs;
DROP POLICY IF EXISTS "anon_update_orchestrator_logs" ON orchestrator_logs;
DROP POLICY IF EXISTS "anon_delete_orchestrator_logs" ON orchestrator_logs;

CREATE POLICY "select_own_orchestrator_logs" ON orchestrator_logs FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM conversations WHERE conversations.id = orchestrator_logs.conversation_id AND conversations.user_id = auth.uid())
  );

CREATE POLICY "insert_own_orchestrator_logs" ON orchestrator_logs FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM conversations WHERE conversations.id = orchestrator_logs.conversation_id AND conversations.user_id = auth.uid())
  );

CREATE POLICY "update_own_orchestrator_logs" ON orchestrator_logs FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM conversations WHERE conversations.id = orchestrator_logs.conversation_id AND conversations.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM conversations WHERE conversations.id = orchestrator_logs.conversation_id AND conversations.user_id = auth.uid()));

CREATE POLICY "delete_own_orchestrator_logs" ON orchestrator_logs FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM conversations WHERE conversations.id = orchestrator_logs.conversation_id AND conversations.user_id = auth.uid())
  );

-- Conversation Feedback: scoped through parent conversation
DROP POLICY IF EXISTS "anon_select_conversation_feedback" ON conversation_feedback;
DROP POLICY IF EXISTS "anon_insert_conversation_feedback" ON conversation_feedback;
DROP POLICY IF EXISTS "anon_update_conversation_feedback" ON conversation_feedback;
DROP POLICY IF EXISTS "anon_delete_conversation_feedback" ON conversation_feedback;

CREATE POLICY "select_own_conversation_feedback" ON conversation_feedback FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM conversations WHERE conversations.id = conversation_feedback.conversation_id AND conversations.user_id = auth.uid())
  );

CREATE POLICY "insert_own_conversation_feedback" ON conversation_feedback FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM conversations WHERE conversations.id = conversation_feedback.conversation_id AND conversations.user_id = auth.uid())
  );

CREATE POLICY "update_own_conversation_feedback" ON conversation_feedback FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM conversations WHERE conversations.id = conversation_feedback.conversation_id AND conversations.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM conversations WHERE conversations.id = conversation_feedback.conversation_id AND conversations.user_id = auth.uid()));

CREATE POLICY "delete_own_conversation_feedback" ON conversation_feedback FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM conversations WHERE conversations.id = conversation_feedback.conversation_id AND conversations.user_id = auth.uid())
  );