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
    parentId: text("parent_id"),
    rootProjectId: text("root_project_id"),
    // BQE type values are labels in some tenants; preserve their exact spelling.
    projectType: text("project_type"),
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
    status: integer("status"),
    invoiceType: integer("invoice_type"),
    draft: boolean("draft"),
    void: boolean("void"),
    serviceAmount: numeric("service_amount"),
    expenseAmount: numeric("expense_amount"),
    serviceTaxAmount: numeric("service_tax_amount"),
    expenseTaxAmount: numeric("expense_tax_amount"),
    discount: numeric("discount"),
    registerAmount: numeric("register_amount"),
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
  invoiceRegister: jsonb("invoice_register").$type<{
    grossHeaderCount: number;
    grossInvoiceAmount: number;
    detailRowCount: number;
    registerCount: number;
    netBilledWithTax: number;
    excludedFinanceChargeCount: number;
    financeChargeAmount: number;
    excludedDraftCount: number;
    excludedZeroAmountCount: number;
    excluded250InvoiceNumber: string | null;
    classifications: Array<{
      status: number | null;
      type: number | null;
      isDraft: boolean;
      isVoid: boolean;
      count: number;
      grossInvoiceAmount: number;
      netBilledWithTax: number;
    }>;
  }>(),
  total2026PaymentsReceived: numeric("total_2026_payments_received").notNull(),
  perProject: jsonb("per_project")
    .$type<
      Record<
        string,
        {
          exact: {
            hours: number;
            invoicedAmount: number;
            paymentsReceived: number;
          };
          rolledUp: {
            hours: number;
            invoicedAmount: number;
            paymentsReceived: number;
          };
        }
      >
    >()
    .notNull(),
});

/**
 * Phase 2 is deliberately kept separate from the Phase 1 reconciliation.
 * A mapping is an operator controlled, case-sensitive BQE type value, rather
 * than a numeric enum: BQE installations do not share a type catalogue.
 */
export const bqeFingerprintKeysTable = pgTable("bqe_fingerprint_keys", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull(),
});

export const bqeProjectTypeMappingsTable = pgTable("bqe_project_type_mappings", {
  bqeProjectType: text("bqe_project_type").primaryKey(),
  fingerprintKey: text("fingerprint_key")
    .notNull()
    .references(() => bqeFingerprintKeysTable.key),
  active: boolean("active").notNull().default(true),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bqePhase2ReconciliationRunsTable = pgTable(
  "bqe_phase2_reconciliation_runs",
  {
    id: text("id").primaryKey(),
    sourceReconciliationId: integer("source_reconciliation_id")
      .notNull()
      .references(() => bqeReconciliationTable.id),
    sourcePullRunId: text("source_pull_run_id").notNull(),
    asOfDate: date("as_of_date", { mode: "string" }).notNull(),
    anchorHours: numeric("anchor_hours").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").notNull(),
    overallPass: boolean("overall_pass").notNull(),
    controls: jsonb("controls").$type<Record<string, number>>().notNull(),
  },
  (table) => [index("bqe_phase2_runs_created_idx").on(table.createdAt)],
);

export const bqePhase2ProjectDispositionsTable = pgTable(
  "bqe_phase2_project_dispositions",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => bqePhase2ReconciliationRunsTable.id),
    projectId: text("project_id"),
    projectCode: text("project_code"),
    projectName: text("project_name"),
    projectType: text("project_type"),
    status: text("status"),
    fingerprintKey: text("fingerprint_key"),
    disposition: text("disposition").notNull(),
    failedRules: jsonb("failed_rules").$type<string[]>().notNull(),
    hours: numeric("hours").notNull(),
  },
  (table) => [index("bqe_phase2_dispositions_run_idx").on(table.runId)],
);

export const bqePhase2NonProjectBucketsTable = pgTable(
  "bqe_phase2_nonproject_buckets",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => bqePhase2ReconciliationRunsTable.id),
    bucket: text("bucket").notNull(),
    hours: numeric("hours").notNull(),
    projectCount: integer("project_count").notNull(),
    entryCount: integer("entry_count").notNull(),
  },
  (table) => [index("bqe_phase2_buckets_run_idx").on(table.runId)],
);

export const bqePhase2TypeSubtotalsTable = pgTable(
  "bqe_phase2_type_subtotals",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => bqePhase2ReconciliationRunsTable.id),
    bqeProjectType: text("bqe_project_type"),
    fingerprintKey: text("fingerprint_key"),
    mapped: boolean("mapped").notNull(),
    hours: numeric("hours").notNull(),
    projectCount: integer("project_count").notNull(),
  },
  (table) => [index("bqe_phase2_type_subtotals_run_idx").on(table.runId)],
);

export type BqeProjectRecord = typeof bqeProjectsTable.$inferSelect;
export type BqeTimeEntryRecord = typeof bqeTimeEntriesTable.$inferSelect;
export type BqeActivityRecord = typeof bqeActivitiesTable.$inferSelect;
export type BqeBudgetRecord = typeof bqeBudgetsTable.$inferSelect;
export type BqeInvoiceRecord = typeof bqeInvoicesTable.$inferSelect;
export type BqePaymentRecord = typeof bqePaymentsTable.$inferSelect;
export type BqePullRun = typeof bqePullRunsTable.$inferSelect;
export type BqeReconciliation = typeof bqeReconciliationTable.$inferSelect;