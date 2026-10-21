import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const documentsTable = pgTable(
  "sf_documents",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    path: text("path").notNull().unique(),
    kind: text("kind").notNull(),
    featureId: text("feature_id"),
    status: text("status").notNull().default("draft"),
    content: text("content").notNull().default(""),
    approvedBy: text("approved_by"),
    revision: integer("revision").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("sf_documents_feature_id_idx").on(table.featureId)],
);

export type Document = typeof documentsTable.$inferSelect;
