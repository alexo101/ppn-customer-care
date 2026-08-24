import app from "./app";
import { logger } from "./lib/logger";
import { ensureEveryoneTargetsForAllAgents } from "./lib/agents";
import { startConversationLifecycleSweep } from "./lib/conversation-lifecycle";
import { prepareKnowledgeEmbeddings } from "./lib/knowledge-indexing";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startConversationLifecycleSweep();
  void prepareKnowledgeEmbeddings();
  void ensureEveryoneTargetsForAllAgents()
    .then((created) => {
      if (created > 0) {
        logger.info({ created }, "Added Everyone target to existing agents");
      }
    })
    .catch((error) => {
      logger.error({ error }, "Failed to add Everyone target to existing agents");
    });
});
