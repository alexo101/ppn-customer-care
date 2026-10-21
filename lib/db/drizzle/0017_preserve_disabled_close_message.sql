UPDATE "agent_conversation_settings"
SET "auto_close_message" = "warning_message",
    "warning_message" = ''
WHERE "auto_close_after_minutes" = 0
  AND "warning_after_minutes" = 0
  AND "warning_message" <> '';
