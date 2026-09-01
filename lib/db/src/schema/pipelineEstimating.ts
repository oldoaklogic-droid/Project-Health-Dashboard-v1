import {
  boolean,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

type JsonObject = Record<string, unknown>;

export const leadsTable = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    who: text("who").notNull(),
    what: text("what").notNull(),
    where: text("where").notNull(),
    source: text("source").notNull(),
    spotter: text("spotter").notNull(),
    status: text("status").notNull().default("New"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("leads_status_idx").on(table.status)],
);

export const intakesTable = pgTable(
  "intakes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
    client: text("client").notNull(),
    contact: text("contact"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    parcel: text("parcel"),
    referralSource: text("referral_source"),
    primaryRequest: text("primary_request"),
    propertyPlans: text("property_plans"),
    disciplines: jsonb("disciplines").$type<string[]>().notNull().default([]),
    answers: jsonb("answers").$type<JsonObject>().notNull().default({}),
    drivers: jsonb("drivers").$type<Record<string, number>>().notNull().default({}),
    stepFlags: jsonb("step_flags").$type<Record<string, boolean>>().notNull().default({}),
    contractType: text("contract_type"),
    paymentTerms: text("payment_terms"),
    startDate: date("start_date", { mode: "string" }),
    targetCompletion: date("target_completion", { mode: "string" }),
    pmByDiscipline: jsonb("pm_by_discipline").$type<Record<string, string>>().notNull().default({}),
    overrides: jsonb("overrides").$type<JsonObject>().notNull().default({}),
    estimateApprovedAt: timestamp("estimate_approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("intakes_lead_id_idx").on(table.leadId),
    index("intakes_created_at_idx").on(table.createdAt),
  ],
);

export const localProjectsTable = pgTable(
  "local_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    intakeId: uuid("intake_id").notNull().references(() => intakesTable.id),
    bqeParentProjectId: uuid("bqe_parent_project_id"),
    bqeChildProjectIds: jsonb("bqe_child_project_ids").$type<Record<string, string>>().notNull().default({}),
    projectNumber: text("project_number").notNull(),
    name: text("name").notNull(),
    client: text("client").notNull(),
    pm: text("pm").notNull(),
    address: text("address"),
    disciplines: jsonb("disciplines").$type<string[]>().notNull().default([]),
    originalHours: numeric("original_hours").notNull().default("0"),
    approvedHours: numeric("approved_hours").notNull().default("0"),
    rate: numeric("rate").notNull().default("220"),
    fee: numeric("fee").notNull().default("0"),
    dueDate: date("due_date", { mode: "string" }),
    status: text("status").notNull().default("Draft"),
    phases: jsonb("phases").$type<unknown[]>().notNull().default([]),
    activities: jsonb("activities").$type<unknown[]>().notNull().default([]),
    changeOrders: jsonb("change_orders").$type<unknown[]>().notNull().default([]),
    closeout: jsonb("closeout").$type<JsonObject>().notNull().default({}),
    adjustmentLogs: jsonb("adjustment_logs").$type<unknown[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("local_projects_project_number_uidx").on(table.projectNumber),
    index("local_projects_intake_id_idx").on(table.intakeId),
  ],
);

export const questionTreeTable = pgTable(
  "question_tree",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    section: text("section").notNull(),
    discipline: text("discipline"),
    trigger: text("trigger"),
    prompt: text("prompt").notNull(),
    answerType: text("answer_type").notNull(),
    options: jsonb("options").$type<unknown[]>().notNull().default([]),
    mapsTo: jsonb("maps_to").$type<JsonObject>().notNull().default({}),
    sortOrder: numeric("sort_order").notNull().default("0"),
    active: boolean("active").notNull().default(true),
  },
  (table) => [
    index("question_tree_section_sort_idx").on(table.section, table.sortOrder),
  ],
);

export const uuidCacheTable = pgTable(
  "uuid_cache",
  {
    entityType: text("entity_type").notNull(),
    humanKey: text("human_key").notNull(),
    bqeUuid: uuid("bqe_uuid").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.entityType, table.humanKey] }),
  ],
);

export type Lead = typeof leadsTable.$inferSelect;
export type InsertLead = typeof leadsTable.$inferInsert;
export type Intake = typeof intakesTable.$inferSelect;
export type InsertIntake = typeof intakesTable.$inferInsert;
export type LocalProject = typeof localProjectsTable.$inferSelect;
export type InsertLocalProject = typeof localProjectsTable.$inferInsert;
export type QuestionTreeItem = typeof questionTreeTable.$inferSelect;