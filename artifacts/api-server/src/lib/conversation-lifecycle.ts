import { and, ne, lt } from "drizzle-orm";
import { conversationsTable, db } from "@workspace/db";
import { logger } from "./logger";
import { updateConversationAnalytics } from "./conversation-analytics";

const INACTIVITY_MS = 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export async function closeInactiveConversations(
  now = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - INACTIVITY_MS);
  const rows = await db
    .update(conversationsTable)
    .set({ status: "closed", resolvedAt: now })
    .where(
      and(
        ne(conversationsTable.status, "closed"),
        ne(conversationsTable.status, "escalated"),
        lt(conversationsTable.lastActivityAt, cutoff),
      ),
    )
    .returning({ id: conversationsTable.id });
  await Promise.all(rows.map((row) => updateConversationAnalytics(row.id)));
  return rows.length;
}

export function startConversationLifecycleSweep(): NodeJS.Timeout | null {
  if (process.env.NODE_ENV === "test") return null;
  const sweep = async () => {
    try {
      const closed = await closeInactiveConversations();
      if (closed > 0) logger.info({ closed }, "Closed inactive conversations");
    } catch (error) {
      logger.error({ error }, "Failed to close inactive conversations");
    }
  };
  const timer = setInterval(sweep, SWEEP_INTERVAL_MS);
  timer.unref();
  return timer;
}
