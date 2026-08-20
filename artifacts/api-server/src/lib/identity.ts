import { createClerkClient } from "@clerk/express";

const emailCache = new Map<string, string | null>();

export async function resolveUserEmail(
  userId: string,
  emailFromSession?: string | null,
): Promise<string | null> {
  const sessionEmail = normalizeEmail(emailFromSession);
  if (sessionEmail) {
    emailCache.set(userId, sessionEmail);
    return sessionEmail;
  }

  if (emailCache.has(userId)) {
    return emailCache.get(userId) ?? null;
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    emailCache.set(userId, null);
    return null;
  }

  try {
    const clerk = createClerkClient({ secretKey });
    const user = await clerk.users.getUser(userId);
    const email = normalizeEmail(user.primaryEmailAddress?.emailAddress);
    emailCache.set(userId, email);
    return email;
  } catch {
    emailCache.set(userId, null);
    return null;
  }
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
