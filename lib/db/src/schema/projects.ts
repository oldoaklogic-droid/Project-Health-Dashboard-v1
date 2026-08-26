import { boolean, date, integer, numeric, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const projectsTable = pgTable("health_projects", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  client: text("client").notNull(),
  pm: text("pm").notNull(),
  priority: text("priority").notNull(),
  overall: text("overall").notNull(),
  confidence: text("confidence").notNull(),
  contractValue: numeric("contract_value").notNull().default("0"),
  contractValueVisible: boolean("contract_value_visible").notNull().default(false),
  budgetExists: boolean("budget_exists").notNull().default(false),
  pctAvail: boolean("pct_avail").notNull().default(false),
  pctComplete: numeric("pct_complete").notNull().default("0"),
  dueAvail: boolean("due_avail").notNull().default(false),
  dueDate: date("due_date", { mode: "string" }),
  recent90: integer("recent_90").notNull().default(0),
  laborWip: numeric("labor_wip").notNull().default("0"),
  expenseWip: numeric("expense_wip").notNull().default("0"),
  openAr: numeric("open_ar").notNull().default("0"),
  exposure: numeric("exposure").notNull().default("0"),
  deliverable: text("deliverable").notNull().default(""),
  etcHours: numeric("etc_hours"),
  scopeNote: text("scope_note").notNull().default(""),
  blocker: text("blocker").notNull().default(""),
  nextAction: text("next_action").notNull().default(""),
  owner: text("owner").notNull().default(""),
  actionDue: date("action_due", { mode: "string" }),
  lastContact: date("last_contact", { mode: "string" }),
  pmUpdate: boolean("pm_update").notNull().default(false),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({
  code: true,
});
export type InsertProject = typeof projectsTable.$inferInsert;
export type Project = typeof projectsTable.$inferSelect;