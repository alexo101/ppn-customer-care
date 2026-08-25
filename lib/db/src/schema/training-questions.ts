import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";

export const trainingQuestionsTable = pgTable("training_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agentsTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTrainingQuestionSchema = createInsertSchema(trainingQuestionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type TrainingQuestion = typeof trainingQuestionsTable.$inferSelect;
export type InsertTrainingQuestion = z.infer<typeof insertTrainingQuestionSchema>;
