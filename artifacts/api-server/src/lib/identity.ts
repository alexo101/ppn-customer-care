import { createClerkClient } from "@clerk/express";

const emailCache = new Map<string, string | null>();
const displayNameCache = new Map<string, string>();

export const USER_DISPLAY_NAME_FALLBACK = "there";

export function displayNameFromProfile(profile: {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  email?: string | null;
}): string {
  const firstName = profile.firstName?.trim();
  if (firstName) return firstName;
  const fullName = profile.fullName?.trim();
  if (fullName) return fullName;
  const combined = [profile.firstName, profile.lastName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" ");
  if (combined) return combined;
  const localPart = profile.email?.split("@")[0]?.trim();
  if (localPart) return localPart;
  return USER_DISPLAY_NAME_FALLBACK;
}

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

export async function resolveUserDisplayName(
  userId: string,
  emailFromSession?: string | null,
): Promise<string> {
  if (displayNameCache.has(userId)) {
    return displayNameCache.get(userId) ?? USER_DISPLAY_NAME_FALLBACK;
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (secretKey) {
    try {
      const clerk = createClerkClient({ secretKey });
      const user = await clerk.users.getUser(userId);
      const email =
        normalizeEmail(user.primaryEmailAddress?.emailAddress) ??
        (await resolveUserEmail(userId, emailFromSession));
      const name = displayNameFromProfile({
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        email,
      });
      displayNameCache.set(userId, name);
      return name;
    } catch {
      // Fall through to email / default.
    }
  }

  const email = await resolveUserEmail(userId, emailFromSession);
  const name = displayNameFromProfile({ email });
  displayNameCache.set(userId, name);
  return name;
}
