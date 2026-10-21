import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { featuresTable } from "./features";

export const tasksTable = pgTable(
  "sf_tasks",
  {
    featureId: text("feature_id")
      .notNull()
      .references(() => featuresTable.id, { onDelete: "cascade" }),
    taskId: text("task_id").notNull(),
    groupId: text("group_id").notNull(),
    parentId: text("parent_id"),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("todo"),
    priority: text("priority").notNull().default("medium"),
    dependsOn: text("depends_on")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    files: text("files")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    requirementsRef: text("requirements_ref")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    worktree: text("worktree"),
    claimedBy: text("claimed_by"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    submissionNote: text("submission_note"),
    revision: integer("revision").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.featureId, table.taskId] }),
    index("sf_tasks_feature_status_idx").on(table.featureId, table.status),
    index("sf_tasks_lease_expiry_idx").on(table.leaseExpiresAt),
  ],
);

export type Task = typeof tasksTable.$inferSelect;
