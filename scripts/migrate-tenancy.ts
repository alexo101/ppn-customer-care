import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "@workspace/db";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(currentDir, "../lib/db/drizzle/0001_multi_tenant_foundation.sql");

try {
  const [{ rows }] = await Promise.all([
    pool.query<{ agents: string; sources: string; connectors: string }>(
      "SELECT (SELECT count(*)::text FROM agents) agents, (SELECT count(*)::text FROM knowledge_sources) sources, (SELECT count(*)::text FROM api_connectors) connectors",
    ),
  ]);
  console.info("Tenant migration preflight:", rows[0]);
  const migration = await readFile(migrationPath, "utf8");
  const client = await pool.connect();
  await client.query("BEGIN");
  try {
    await client.query(migration);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  const [{ rows: verification }] = await Promise.all([
    pool.query("SELECT count(*) FILTER (WHERE team_id IS NULL)::text AS unassigned_agents FROM agents"),
  ]);
  if (verification[0]?.unassigned_agents !== "0") {
    throw new Error(`Tenant migration verification failed: ${verification[0]?.unassigned_agents} unassigned agents`);
  }
  console.info("Tenant migration completed:", verification[0]);
} finally {
  await pool.end();
}
