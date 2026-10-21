import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const featuresTable = pgTable(
  "sf_features",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("sf_features_status_idx").on(table.status)],
);

export type Feature = typeof featuresTable.$inferSelect;
