import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { documentsTable } from "./documents";

export const commentsTable = pgTable(
  "sf_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => documentsTable.id, { onDelete: "cascade" }),
    selectedText: text("selected_text").notNull(),
    startLine: integer("start_line").notNull(),
    endLine: integer("end_line").notNull(),
    instruction: text("instruction").notNull(),
    status: text("status").notNull().default("open"),
    resolutionNote: text("resolution_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("sf_comments_document_status_idx").on(table.documentId, table.status),
  ],
);

export type Comment = typeof commentsTable.$inferSelect;
