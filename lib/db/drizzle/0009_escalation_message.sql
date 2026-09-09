ALTER TABLE "agent_conversation_settings"
ADD COLUMN "escalation_message" text DEFAULT 'Sorry {user_name}, I''m not able to answer this message. I can escalate this question, or you can ask another question.' NOT NULL;
