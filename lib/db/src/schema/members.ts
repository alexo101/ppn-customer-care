import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const MEMBER_ROLES = ["editor", "viewer"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const workspaceMembersTable = pgTable("workspace_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  clerkUserId: text("clerk_user_id"),
  role: text("role").notNull().default("viewer"),
  invitedByEmail: text("invited_by_email"),
  inviteTokenHash: text("invite_token_hash").unique(),
  inviteTokenPrefix: text("invite_token_prefix"),
  inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
  inviteRedeemedAt: timestamp("invite_redeemed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertWorkspaceMemberSchema = createInsertSchema(workspaceMembersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type WorkspaceMember = typeof workspaceMembersTable.$inferSelect;
export type InsertWorkspaceMember = z.infer<typeof insertWorkspaceMemberSchema>;
