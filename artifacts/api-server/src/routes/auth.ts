import { Router, type IRouter } from "express";
import { createClerkClient } from "@clerk/express";
import { RegisterBody } from "@workspace/api-zod";

const router: IRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post("/auth/register", async (req, res): Promise<void> => {
  // #region agent log
  fetch('http://127.0.0.1:7743/ingest/fbcc6644-f5ef-42d5-8361-4b0eb31d88ad',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0657f2'},body:JSON.stringify({sessionId:'0657f2',hypothesisId:'C',location:'routes/auth.ts:handler',message:'Register handler entered',data:{hasBody:Boolean(req.body),emailLen:typeof req.body?.email==='string'?req.body.email.length:0,passwordLen:typeof req.body?.password==='string'?req.body.password.length:0},timestamp:Date.now(),runId:'pre-fix'})}).catch(()=>{});
  // #endregion
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const password = parsed.data.password;

  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }
  if (password.length < 15) {
    res.status(400).json({ error: "Password must be at least 15 characters." });
    return;
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    res.status(500).json({ error: "Authentication is not configured." });
    return;
  }

  const clerk = createClerkClient({ secretKey });

  try {
    const user = await clerk.users.createUser({
      emailAddress: [email],
      password,
      skipLegalChecks: true,
    });

    const signInToken = await clerk.signInTokens.createSignInToken({
      userId: user.id,
      expiresInSeconds: 60,
    });

    res.status(201).json({ ticket: signInToken.token });
  } catch (err) {
    const message = clerkErrorMessage(err);
    res.status(400).json({ error: message });
  }
});

function clerkErrorMessage(err: unknown): string {
  const errors = extractClerkErrors(err);
  const first = errors[0];
  if (first?.code === "form_identifier_exists") {
    return "An account with this email already exists. Sign in instead.";
  }
  if (first?.longMessage) return first.longMessage;
  if (first?.message) return first.message;
  if (err instanceof Error && err.message) return err.message;
  return "Could not create your account.";
}

function extractClerkErrors(err: unknown): Array<{ code?: string; message?: string; longMessage?: string }> {
  if (!err || typeof err !== "object") return [];
  const record = err as Record<string, unknown>;
  const errors = record.errors;
  if (!Array.isArray(errors)) return [];
  return errors.map((item) => {
    if (!item || typeof item !== "object") return {};
    const entry = item as Record<string, unknown>;
    return {
      code: typeof entry.code === "string" ? entry.code : undefined,
      message: typeof entry.message === "string" ? entry.message : undefined,
      longMessage:
        typeof entry.longMessage === "string"
          ? entry.longMessage
          : typeof entry.long_message === "string"
            ? entry.long_message
            : undefined,
    };
  });
}

export default router;
