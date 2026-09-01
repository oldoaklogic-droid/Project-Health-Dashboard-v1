import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const healthRulesTable = pgTable("health_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  severity: text("severity").notNull(),
  condition: jsonb("condition").$type<Record<string, unknown>>().notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const projectHealthSnapshotTable = pgTable("project_health_snapshot", {
  projectId: text("project_id").notNull(),
  asOf: date("as_of", { mode: "string" }).notNull(),
  severity: text("severity").notNull(),
  triggeredRules: jsonb("triggered_rules").$type<Array<Record<string, unknown>>>().notNull(),
  overrideSeverity: text("override_severity"),
  overrideReason: text("override_reason"),
  overrideBy: text("override_by"),
}, (table) => [
  primaryKey({ columns: [table.projectId, table.asOf] }),
  index("project_health_snapshot_as_of_idx").on(table.asOf),
]);

export const actionsTable = pgTable("actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: text("project_id"),
  what: text("what").notNull(),
  ownerEmployeeId: text("owner_employee_id"),
  dueDate: date("due_date", { mode: "string" }),
  amount: numeric("amount"),
  status: text("status").notNull().default("open"),
  createdInMeeting: boolean("created_in_meeting").notNull().default(false),
  closedAt: date("closed_at", { mode: "string" }),
  closeNote: text("close_note"),
}, (table) => [
  index("actions_project_idx").on(table.projectId),
  index("actions_status_due_idx").on(table.status, table.dueDate),
]);

export const pmNotesTable = pgTable("pm_notes", {
  projectId: text("project_id").notNull(),
  asOf: date("as_of", { mode: "string" }).notNull(),
  riskLine: text("risk_line").notNull().default(""),
  actionLine: text("action_line").notNull().default(""),
  percentComplete: numeric("percent_complete"),
  enteredBy: text("entered_by").notNull(),
}, (table) => [
  primaryKey({ columns: [table.projectId, table.asOf] }),
  index("pm_notes_as_of_idx").on(table.asOf),
]);

export const clientContactLogTable = pgTable("client_contact_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: text("project_id").notNull(),
  contactDate: date("contact_date", { mode: "string" }).notNull(),
  method: text("method").notNull(),
  summary: text("summary").notNull(),
  loggedBy: text("logged_by").notNull(),
}, (table) => [
  index("client_contact_log_project_date_idx").on(table.projectId, table.contactDate),
]);

export const insertActionSchema = createInsertSchema(actionsTable).omit({ id: true });
export const insertPmNoteSchema = createInsertSchema(pmNotesTable).omit({ enteredBy: true });
export const insertClientContactSchema = createInsertSchema(clientContactLogTable).omit({ id: true, loggedBy: true });

export type HealthRule = typeof healthRulesTable.$inferSelect;
export type ProjectHealthSnapshot = typeof projectHealthSnapshotTable.$inferSelect;
export type Action = typeof actionsTable.$inferSelect;
export type PmNote = typeof pmNotesTable.$inferSelect;
export type ClientContact = typeof clientContactLogTable.$inferSelect;