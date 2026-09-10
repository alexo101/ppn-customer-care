export function formatWaitingDuration(value: string | Date, now = Date.now()) {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "—";
  const minutes = Math.max(1, Math.floor((now - timestamp) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function displayNameFromEmail(email: string) {
  const local = email.split("@")[0] ?? email;
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function customerDisplayName(escalation: {
  customerName?: string | null;
  customerEmail?: string | null;
}) {
  if (escalation.customerName?.trim()) return escalation.customerName.trim();
  if (escalation.customerEmail?.trim()) {
    return displayNameFromEmail(escalation.customerEmail);
  }
  return "Customer";
}

export function assigneeDisplayName(name: string | null | undefined) {
  if (!name?.trim()) return "Unassigned";
  return name.includes("@") ? displayNameFromEmail(name) : name;
}

export function escalationCode(conversationId: string) {
  const compact = conversationId.replace(/-/g, "").slice(-4).toUpperCase();
  return `ESC-${compact}`;
}

const AVATAR_TONES = [
  "bg-teal-600 text-white",
  "bg-violet-600 text-white",
  "bg-sky-700 text-white",
  "bg-rose-600 text-white",
  "bg-indigo-600 text-white",
];

export function avatarToneClass(value: string) {
  let hash = 0;
  for (const character of value) {
    hash = (hash + character.charCodeAt(0)) % AVATAR_TONES.length;
  }
  return AVATAR_TONES[hash] ?? AVATAR_TONES[0];
}
