import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";

// Augment Express Request so downstream handlers can read req.userId without casts
declare global {
  namespace Express {
    interface Request {
      userId: string;
      file?: Express.Multer.File;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.userId = userId;
  next();
}
