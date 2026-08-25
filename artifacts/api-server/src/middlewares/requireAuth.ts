import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { and, eq } from "drizzle-orm";
import { db, agentDeploymentsTable, agentsTable } from "@workspace/db";
import { hashDeploymentToken } from "../lib/connection-secrets";

// Augment Express Request so downstream handlers can read req.userId without casts
declare global {
  namespace Express {
    interface Request {
      userId: string;
      userEmail?: string;
      file?: Express.Multer.File;
    }
  }
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
