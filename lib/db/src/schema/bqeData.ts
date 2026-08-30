import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const rawRecord = {
  recordId: text("record_id").primaryKey(),
  pulledAt: timestamp("pulled_at", { withTimezone: true }).notNull().defaultNow(),
  rawJson: jsonb("raw_json").$type<Record<string, unknown>>().notNull(),
};

export const bqeProjectsTable = pgTable(
  "bqe_projects",
  {
    ...rawRecord,
    code: text("code"),
    name: text("name"),
    client: text("client"),
    status: text("status"),
    contractType: text("contract_type"),
    contractAmount: numeric("contract_amount"),
    manager: text("manager"),
  },
  (table) => [
    index("bqe_projects_code_idx").on(table.code),
  ],
);

export const bqeTimeEntriesTable = pgTable(
  "bqe_time_entries",
  {
    ...rawRecord,
    entryDate: date("entry_date", { mode: "string" }),
    employee: text("employee"),
    projectId: text("project_id"),
    projectCode: text("project_code"),
    activityId: text("activity_id"),
    activityCode: text("activity_code"),
    hours: numeric("hours"),
    billable: boolean("billable"),
    billRate: numeric("bill_rate"),
    costRate: numeric("cost_rate"),
  },
  (table) => [
    index("bqe_time_entries_date_idx").on(table.entryDate),
    index("bqe_time_entries_project_code_idx").on(table.projectCode),
  ],
);

export const bqeActivitiesTable = pgTable(
  "bqe_activities",
  {
    ...rawRecord,
    code: text("code"),
    name: text("name"),
    active: boolean("active"),
    billable: boolean("billable"),
    rates: jsonb("rates").$type<unknown>(),
  },
  (table) => [
    index("bqe_activities_code_idx").on(table.code),
  ],
);

export const bqeBudgetsTable = pgTable(
  "bqe_budgets",
  {
    ...rawRecord,
    name: text("name"),
    projectId: text("project_id"),
    projectCode: text("project_code"),
    lineItems: jsonb("line_items").$type<unknown>(),
    totalHours: numeric("total_hours"),
  },
  (table) => [
    index("bqe_budgets_project_code_idx").on(table.projectCode),
  ],
);

export const bqeInvoicesTable = pgTable(
  "bqe_invoices",
  {
    ...rawRecord,
    invoiceNumber: text("invoice_number"),
    projectId: text("project_id"),
    projectCode: text("project_code"),
    invoiceDate: date("invoice_date", { mode: "string" }),
    amount: numeric("amount"),
    balance: numeric("balance"),
  },
  (table) => [
    index("bqe_invoices_date_idx").on(table.invoiceDate),
    index("bqe_invoices_project_code_idx").on(table.projectCode),
  ],
);

export const bqePaymentsTable = pgTable(
  "bqe_payments",
  {
    ...rawRecord,
    paymentDate: date("payment_date", { mode: "string" }),
    amount: numeric("amount"),
    projectId: text("project_id"),
    projectCode: text("project_code"),
    method: text("method"),
    reference: text("reference"),
  },
  (table) => [
    index("bqe_payments_date_idx").on(table.paymentDate),
    index("bqe_payments_project_code_idx").on(table.projectCode),
  ],
);

export const bqePullRunsTable = pgTable("bqe_pull_runs", {
  id: text("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  status: text("status").notNull(),
  objectCounts: jsonb("object_counts").$type<Record<string, number>>().notNull(),
  errors: jsonb("errors").$type<Record<string, string>>().notNull(),
});

export const bqeReconciliationTable = pgTable("bqe_reconciliation", {
  id: integer("id").primaryKey(),
  pullRunId: text("pull_run_id").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  reportingYear: integer("reporting_year"),
  asOfDate: date("as_of_date", { mode: "string" }),
  objectCounts: jsonb("object_counts").$type<Record<string, number>>().notNull(),
  total2026Hours: numeric("total_2026_hours").notNull(),
  excludedFutureHours: numeric("excluded_future_hours"),
  total2026InvoicedAmount: numeric("total_2026_invoiced_amount").notNull(),
  total2026PaymentsReceived: numeric("total_2026_payments_received").notNull(),
  perProject: jsonb("per_project")
    .$type<
      Record<
        string,
        {
          hours: number;
          invoicedAmount: number;
          paymentsReceived: number;
        }
      >
    >()
    .notNull(),
});

export type BqeProjectRecord = typeof bqeProjectsTable.$inferSelect;
export type BqeTimeEntryRecord = typeof bqeTimeEntriesTable.$inferSelect;
export type BqeActivityRecord = typeof bqeActivitiesTable.$inferSelect;
export type BqeBudgetRecord = typeof bqeBudgetsTable.$inferSelect;
export type BqeInvoiceRecord = typeof bqeInvoicesTable.$inferSelect;
export type BqePaymentRecord = typeof bqePaymentsTable.$inferSelect;
export type BqePullRun = typeof bqePullRunsTable.$inferSelect;
export type BqeReconciliation = typeof bqeReconciliationTable.$inferSelect;