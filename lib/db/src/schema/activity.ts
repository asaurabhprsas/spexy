import { index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const activityTable = pgTable(
  "sf_activity",
  {
    id: serial("id").primaryKey(),
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("sf_activity_created_at_idx").on(table.createdAt)],
);

export type Activity = typeof activityTable.$inferSelect;
