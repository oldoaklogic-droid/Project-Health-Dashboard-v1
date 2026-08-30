import { createInsertSchema } from "drizzle-zod";
import { index, serial, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const dashboardAccessChangesTable = pgTable(
  "dashboard_access_changes",
  {
    id: serial("id").primaryKey(),
    actorUserId: text("actor_user_id").notNull(),
    targetUserId: text("target_user_id").notNull(),
    previousRole: text("previous_role"),
    newRole: text("new_role"),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("dashboard_access_changes_changed_at_idx").on(table.changedAt),
    index("dashboard_access_changes_target_user_id_idx").on(table.targetUserId),
  ],
);

export const insertDashboardAccessChangeSchema = createInsertSchema(
  dashboardAccessChangesTable,
).omit({ id: true, changedAt: true });

export type InsertDashboardAccessChange = z.infer<
  typeof insertDashboardAccessChangeSchema
>;
export type DashboardAccessChange =
  typeof dashboardAccessChangesTable.$inferSelect;