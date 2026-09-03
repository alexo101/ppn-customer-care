ALTER TABLE "agent_conversation_settings" ADD COLUMN "welcome_message" text DEFAULT 'Hello {user_name}, you are speaking {agent_name} Ai Agent. How can I help you?' NOT NULL;
