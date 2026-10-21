import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const projectsTable = pgTable("sf_projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Project = typeof projectsTable.$inferSelect;
