import { appendFileSync } from "node:fs";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Clerk proxy must be mounted before body parsers (streams raw bytes)
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// Build the set of exact allowed origins.
// Parsed URL host+protocol matching prevents prefix-matching attacks
// (e.g. https://replit-domain.attacker.com would still be rejected).
const allowedOriginSet = new Set<string>();
if (process.env.REPLIT_DEV_DOMAIN) {
  allowedOriginSet.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
}

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // same-origin or server-to-server — no Origin header
  if (process.env.NODE_ENV !== "production") return true; // permissive in local dev
  try {
    const { protocol, host } = new URL(origin);
    return allowedOriginSet.has(`${protocol}//${host}`);
  } catch {
    return false;
  }
}

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
  }),
);
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// Resolve publishable key from incoming request host
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

app.use((req, res) => {
  // #region agent log
  { const _p={sessionId:'e273e6',runId:'post-fix',hypothesisId:'A',location:'app.ts:404',message:'api catch-all 404',data:{method:req.method,url:req.originalUrl ?? req.url,path:req.path},timestamp:Date.now()}; try{appendFileSync('/home/runner/workspace/.cursor/debug-e273e6.log',JSON.stringify(_p)+'\n');}catch{} fetch('http://127.0.0.1:7600/ingest/a2a2da46-8d04-4e69-ad9d-61a4005dfe74',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e273e6'},body:JSON.stringify(_p)}).catch(()=>{}); }
  // #endregion
  res.status(404).json({ error: "Not found" });
});

app.use((
  err: unknown,
  _req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => {
  logger.error({ err }, "Unhandled API error");
  if (res.headersSent) {
    next(err);
    return;
  }
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

export default app;
