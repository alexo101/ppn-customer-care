import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { ensureDefaultTenant, getTenantContext, type TenantContext } from "../lib/tenant";
import { and, eq } from "drizzle-orm";
import { db, agentDeploymentsTable, agentsTable } from "@workspace/db";
import { hashDeploymentToken } from "../lib/connection-secrets";

// Augment Express Request so downstream handlers can read req.userId without casts
declare global {
  namespace Express {
    interface Request {
      userId: string;
      userEmail?: string;
      tenant?: TenantContext;
      file?: Express.Multer.File;
    }
  }
}

/**
 * Resolves the application tenant after Clerk authentication.
 * The selected team may be supplied by route/query context or the
 * X-Team-Id header. A default tenant is created during first use so
 * existing installations can be migrated without a separate onboarding job.
 */
export async function requireTenant(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const requestedTeamId =
    typeof req.params.teamId === "string"
      ? req.params.teamId
      : typeof req.query.teamId === "string"
        ? req.query.teamId
        : typeof req.headers["x-team-id"] === "string"
          ? req.headers["x-team-id"]
          : undefined;
  const tenant =
    (await getTenantContext(req.userId, requestedTeamId)) ??
    (requestedTeamId ? null : await ensureDefaultTenant(req.userId));
  if (!tenant) {
    res.status(403).json({ error: "You are not a member of this team." });
    return;
  }
  req.tenant = tenant;
  next();
}

export async function requireAuthOrDeployment(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = getAuth(req);
  if (auth?.userId) {
    req.userId = auth.userId;
    const claims = (auth as unknown as { sessionClaims?: Record<string, unknown> })?.sessionClaims;
    if (typeof claims?.email === "string") req.userEmail = claims.email;
    next();
    return;
  }
  const rawToken = req.header("x-agent-deployment-token");
  if (!rawToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [deployment] = await db
    .select({ agent: agentsTable, deployment: agentDeploymentsTable })
    .from(agentDeploymentsTable)
    .innerJoin(agentsTable, eq(agentsTable.id, agentDeploymentsTable.agentId))
    .where(and(
      eq(agentDeploymentsTable.tokenHash, hashDeploymentToken(rawToken)),
      eq(agentDeploymentsTable.isActive, true),
    ))
    .limit(1);
  if (!deployment || deployment.deployment.revokedAt) {
    res.status(401).json({ error: "Invalid deployment token" });
    return;
  }
  req.userId = deployment.agent.userId;
  if (deployment.agent.teamId) req.headers["x-team-id"] = deployment.agent.teamId;
  next();
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader("Cache-Control", "private, no-store");
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.userId = userId;
  const claims = (
    auth as unknown as { sessionClaims?: Record<string, unknown> }
  )?.sessionClaims;
  if (typeof claims?.email === "string") {
    req.userEmail = claims.email;
  }
  next();
}
