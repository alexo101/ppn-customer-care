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

export default app;
