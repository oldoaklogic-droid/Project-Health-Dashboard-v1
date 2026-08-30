import { Router, type IRouter } from "express";
import { asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import {
  bqePullRunsTable,
  db,
  projectsTable,
  type InsertProject,
  type Project,
} from "@workspace/db";
import {
  GetDashboardResponse,
  GetProjectParams,
  GetProjectResponse,
  UpdateProjectBody,
  UpdateProjectParams,
  UpdateProjectResponse,
} from "@workspace/api-zod";
import {
  requireDashboardAccess,
  requireDashboardEditor,
} from "../middlewares/requireDashboardAccess";
import { getLatestBqeReconciliation } from "../lib/bqePull";
import {
  dashboardReportingPeriod,
  reconciliationForCompletedRun,
} from "../lib/dashboardBqe";

const router: IRouter = Router();
router.use(requireDashboardAccess);
const EXTRACT_DATE = "2026-08-19";
const OVERLAY_DATE = "2026-08-19";
const BQE_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

const names = [
  ["26-0078", "Riverview Ranch Lot 15", "Timberwood Homes, LLC"],
  ["26-0140", "CBCD Micro-irrigation Engineering", "Columbia Basin Conservation District"],
  ["26-0141", "Snyder W. Line Staking", "Snyder W. Holdings"],
  ["26-0142", "Barnes Condo Survey", "Barnes Development"],
  ["2020108", "Copperstone", "Copperstone Partners"],
  ["26-0120", "Canyon Ridge Plat", "Canyon Ridge LLC"],
  ["26-0121", "North Fork Access", "North Fork Holdings"],
  ["26-0122", "Juniper Creek Boundary", "Juniper Creek LLC"],
  ["23-0091", "Raj's Plaza", "Paul Jhuty"],
  ["23-0147", "Chelan Meadows", "Raja Venugopal"],
  ["24-0022", "Haystack Water System", "Raja Venugopal"],
] as const;
const pms = ["Arlen Brazill", "Rex Gallion", "Justin Wilson", "Megan Santos", "Kara Lee"];
const exposures = [125000, 108500, 97500, 87000, 76000, 65000, 54000, 43000, 32000, 21100, 15991, 125000];

function seedRows(): InsertProject[] {
  return Array.from({ length: 133 }, (_, index) => {
    const number = index + 1;
    const known = names[index];
    const code = known?.[0] ?? `26-${String(1500 + number).padStart(4, "0")}`;
    const amount = exposures[index] ?? (index === 11 ? 125000 : 0);
    return {
      code,
      name: known?.[1] ?? `Portfolio project ${number}`,
      client: known?.[2] ?? `Complete Design client ${number}`,
      pm: pms[index % pms.length],
      priority: index < 11 ? "HIGH" : index < 35 ? "MEDIUM" : "LOW",
      overall: "UNKNOWN",
      confidence: index === 0 ? "HIGH" : index < 4 ? "MEDIUM" : "LOW",
      contractValue: String(index < 72 ? (amount || 2200) : 0),
      contractValueVisible: index < 72,
      budgetExists: index < 11,
      pctAvail: index < 7,
      pctComplete: index < 7 ? String((index + 1) * 10) : "0",
      dueAvail: index < 4,
      dueDate: index < 4 ? "2026-09-30" : null,
      recent90: index < 98 ? 1 : 0,
      laborWip: String(index < 73 ? Math.round(amount * 0.2) : 0),
      expenseWip: "0",
      openAr: String(index < 76 ? Math.max(1, Math.round(amount * 0.8)) : 0),
      exposure: String(amount),
      deliverable: "",
      etcHours: null,
      scopeNote: "",
      blocker: "",
      nextAction: "",
      owner: "",
      actionDue: null,
      lastContact: null,
      pmUpdate: false,
    };
  });
}

let seedPromise: Promise<void> | null = null;
async function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      await db.insert(projectsTable).values(seedRows()).onConflictDoNothing();
    })();
  }
  await seedPromise;
}

function numberValue(value: string | number | null): number {
  return value == null ? 0 : Number(value);
}

type ProjectBqeMetrics = {
  code: string;
  bqeName: string | null;
  bqeClient: string | null;
  bqeManager: string | null;
  bqeContractAmount: string | null;
  bqePulledAt: Date | string | null;
  actualHours: string | null;
  budgetHours: string | null;
  invoicedAmount: string | null;
  paidAmount: string | null;
  openInvoiceBalance: string | null;
};

type EnrichedProject = ReturnType<typeof toProject>;
type ProjectReconciliation = {
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
};
type BqePortfolioTotals = {
  hours: string | null;
  budgetHours: string | null;
  invoicedAmount: string | null;
  paidAmount: string | null;
};

function nullableNumber(value: string | number | null): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestampString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function reconciliationFor(
  reconciliation: Awaited<ReturnType<typeof getLatestBqeReconciliation>>,
  code: string,
): ProjectReconciliation | undefined {
  return (reconciliation?.perProject as Record<string, ProjectReconciliation> | undefined)?.[
    code
  ];
}

function toProject(
  row: Project,
  metrics?: ProjectBqeMetrics,
  reconciliation?: {
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
  },
) {
  const bqePulledAt = timestampString(metrics?.bqePulledAt);
  const bqeMatched = bqePulledAt !== null;
  const contractAmount = nullableNumber(metrics?.bqeContractAmount ?? null);
  const openInvoiceBalance = nullableNumber(metrics?.openInvoiceBalance ?? null);
  return {
    code: row.code,
    name: metrics?.bqeName || row.name,
    client: metrics?.bqeClient || row.client,
    pm: metrics?.bqeManager || row.pm,
    priority: row.priority,
    overall: row.overall,
    confidence: row.confidence,
    contractValue: contractAmount ?? numberValue(row.contractValue),
    contractValueVisible: contractAmount !== null || row.contractValueVisible,
    budgetExists: metrics?.budgetHours != null || row.budgetExists,
    pctAvail: row.pctAvail,
    pctComplete: numberValue(row.pctComplete),
    dueAvail: row.dueAvail,
    dueDate: row.dueDate,
    recent90:
      metrics?.actualHours != null
        ? Number(metrics.actualHours) > 0
          ? 1
          : 0
        : row.recent90,
    laborWip: bqeMatched ? 0 : numberValue(row.laborWip),
    expenseWip: bqeMatched ? 0 : numberValue(row.expenseWip),
    openAr: openInvoiceBalance ?? numberValue(row.openAr),
    exposure: openInvoiceBalance ?? numberValue(row.exposure),
    bqeMatched,
    bqePulledAt,
    actualHours: nullableNumber(metrics?.actualHours ?? null),
    budgetHours: nullableNumber(metrics?.budgetHours ?? null),
    invoicedAmount: nullableNumber(metrics?.invoicedAmount ?? null),
    paidAmount: nullableNumber(metrics?.paidAmount ?? null),
    reconciliationHours: reconciliation?.exact.hours ?? null,
    reconciliationInvoicedAmount: reconciliation?.exact.invoicedAmount ?? null,
    reconciliationPaidAmount: reconciliation?.exact.paymentsReceived ?? null,
    reconciliationRolledUpHours: reconciliation?.rolledUp.hours ?? null,
    reconciliationRolledUpInvoicedAmount:
      reconciliation?.rolledUp.invoicedAmount ?? null,
    reconciliationRolledUpPaidAmount:
      reconciliation?.rolledUp.paymentsReceived ?? null,
    deliverable: row.deliverable,
    etcHours: row.etcHours == null ? null : numberValue(row.etcHours),
    scopeNote: row.scopeNote,
    blocker: row.blocker,
    nextAction: row.nextAction,
    owner: row.owner,
    actionDue: row.actionDue,
    lastContact: row.lastContact,
    pmUpdate: row.pmUpdate,
  };
}

async function loadProjectBqeMetrics(asOfDate: string): Promise<Map<string, ProjectBqeMetrics>> {
  const reportingPeriod = dashboardReportingPeriod(asOfDate);
  const result = await db.execute<ProjectBqeMetrics>(sql`
    WITH latest_bqe_projects AS (
      SELECT DISTINCT ON (code)
        record_id,
        code,
        name,
        client,
        manager,
        contract_amount,
        pulled_at
      FROM bqe_projects
      WHERE code IS NOT NULL
      ORDER BY code, pulled_at DESC
    ),
    time_by_project AS (
      SELECT project_id, SUM(hours) AS actual_hours, MAX(pulled_at) AS pulled_at
      FROM bqe_time_entries
      WHERE entry_date >= ${reportingPeriod.startDate}
        AND entry_date < ${reportingPeriod.endDateExclusive}
        AND entry_date <= ${reportingPeriod.asOfDate}
      GROUP BY project_id
    ),
    budget_by_code AS (
      SELECT COALESCE(project_code, name) AS code, SUM(total_hours) AS budget_hours, MAX(pulled_at) AS pulled_at
      FROM bqe_budgets
      WHERE COALESCE(project_code, name) IS NOT NULL
      GROUP BY COALESCE(project_code, name)
    ),
    invoice_by_project AS (
      SELECT
        project_id,
        SUM(amount) AS invoiced_amount,
        SUM(balance) AS open_invoice_balance,
        MAX(pulled_at) AS pulled_at
      FROM bqe_invoices
      WHERE invoice_date >= ${reportingPeriod.startDate}
        AND invoice_date < ${reportingPeriod.endDateExclusive}
        AND invoice_date <= ${reportingPeriod.asOfDate}
      GROUP BY project_id
    ),
    payment_by_project AS (
      SELECT project_id, SUM(amount) AS paid_amount, MAX(pulled_at) AS pulled_at
      FROM bqe_payments
      WHERE payment_date >= ${reportingPeriod.startDate}
        AND payment_date < ${reportingPeriod.endDateExclusive}
        AND payment_date <= ${reportingPeriod.asOfDate}
      GROUP BY project_id
    )
    SELECT
      hp.code,
      bp.name AS "bqeName",
      bp.client AS "bqeClient",
      bp.manager AS "bqeManager",
      bp.contract_amount AS "bqeContractAmount",
      GREATEST(bp.pulled_at, te.pulled_at, budget.pulled_at, invoice.pulled_at, payment.pulled_at) AS "bqePulledAt",
      CASE WHEN bp.record_id IS NULL THEN NULL ELSE COALESCE(te.actual_hours, 0) END AS "actualHours",
      budget.budget_hours AS "budgetHours",
      CASE WHEN bp.record_id IS NULL THEN NULL ELSE COALESCE(invoice.invoiced_amount, 0) END AS "invoicedAmount",
      CASE WHEN bp.record_id IS NULL THEN NULL ELSE COALESCE(payment.paid_amount, 0) END AS "paidAmount",
      CASE WHEN bp.record_id IS NULL THEN NULL ELSE COALESCE(invoice.open_invoice_balance, 0) END AS "openInvoiceBalance"
    FROM health_projects hp
    LEFT JOIN latest_bqe_projects bp ON bp.code = hp.code
    LEFT JOIN time_by_project te ON te.project_id = bp.record_id
    LEFT JOIN budget_by_code budget ON budget.code = hp.code
    LEFT JOIN invoice_by_project invoice ON invoice.project_id = bp.record_id
    LEFT JOIN payment_by_project payment ON payment.project_id = bp.record_id
  `);
  return new Map(result.rows.map((row) => [row.code, row]));
}

async function loadBqePortfolioTotals(asOfDate: string): Promise<{
  hours: number;
  budgetHours: number;
  invoicedAmount: number;
  paidAmount: number;
}> {
  const reportingPeriod = dashboardReportingPeriod(asOfDate);
  const result = await db.execute<BqePortfolioTotals>(sql`
    SELECT
      (SELECT COALESCE(SUM(hours), 0) FROM bqe_time_entries
        WHERE entry_date >= ${reportingPeriod.startDate}
          AND entry_date < ${reportingPeriod.endDateExclusive}
          AND entry_date <= ${reportingPeriod.asOfDate}) AS hours,
      (SELECT COALESCE(SUM(total_hours), 0) FROM bqe_budgets) AS "budgetHours",
      (SELECT COALESCE(SUM(amount), 0) FROM bqe_invoices
        WHERE invoice_date >= ${reportingPeriod.startDate}
          AND invoice_date < ${reportingPeriod.endDateExclusive}
          AND invoice_date <= ${reportingPeriod.asOfDate}) AS "invoicedAmount",
      (SELECT COALESCE(SUM(amount), 0) FROM bqe_payments
        WHERE payment_date >= ${reportingPeriod.startDate}
          AND payment_date < ${reportingPeriod.endDateExclusive}
          AND payment_date <= ${reportingPeriod.asOfDate}) AS "paidAmount"
  `);
  const row = result.rows[0];
  return {
    hours: nullableNumber(row?.hours ?? null) ?? 0,
    budgetHours: nullableNumber(row?.budgetHours ?? null) ?? 0,
    invoicedAmount: nullableNumber(row?.invoicedAmount ?? null) ?? 0,
    paidAmount: nullableNumber(row?.paidAmount ?? null) ?? 0,
  };
}

function summarize(rows: EnrichedProject[]) {
  const count = rows.length;
  const coverage = [
    ["Project manager", rows.filter((row) => row.pm.trim()).length, "Primary PM field on active root"],
    ["Contract value visible", rows.filter((row) => row.contractValueVisible).length, "Fixed/NTE 100%; many hourly are legitimately $0"],
    ["BQE budget object", rows.filter((row) => row.budgetExists).length, "Needed for automated On Budget + forecast"],
    ["Percent complete", rows.filter((row) => row.pctAvail).length, "Needed to compare progress with burn"],
    ["Due date", rows.filter((row) => row.dueAvail).length, "Needed for automated On Plan / milestone risk"],
    ["Time activity (90d)", rows.filter((row) => row.recent90 > 0).length, "Current movement indicator"],
    ["Open AR", rows.filter((row) => numberValue(row.openAr) > 0).length, "Open invoice balance allocated to root"],
  ].map(([label, value, note]) => ({
    label: String(label),
    count: Number(value),
    pct: count ? (Number(value) / count) * 100 : 0,
    note: String(note),
  }));
  return {
    activeRoots: count,
    namedPm: rows.filter((row) => row.pm.trim()).length,
    financialExposure: rows.reduce((total, row) => total + numberValue(row.exposure), 0),
    overall: rows.reduce<Record<string, number>>((result, row) => {
      result[row.overall] = (result[row.overall] ?? 0) + 1;
      return result;
    }, {}),
    confidence: rows.reduce<Record<string, number>>((result, row) => {
      result[row.confidence] = (result[row.confidence] ?? 0) + 1;
      return result;
    }, {}),
    coverage,
    byPm: rows.reduce<Record<string, number>>((result, row) => {
      result[row.pm] = (result[row.pm] ?? 0) + 1;
      return result;
    }, {}),
  };
}

router.get("/dashboard", async (req, res): Promise<void> => {
  await ensureSeeded();
  const [rows, latestRuns, reconciliation] = await Promise.all([
    db.select().from(projectsTable).orderBy(asc(projectsTable.code)),
    db
      .select()
      .from(bqePullRunsTable)
      .where(isNotNull(bqePullRunsTable.completedAt))
      .orderBy(desc(bqePullRunsTable.completedAt))
      .limit(1),
    getLatestBqeReconciliation(),
  ]);
  const latestRun = latestRuns[0] ?? null;
  const usableReconciliation = reconciliationForCompletedRun(latestRun, reconciliation);
  const asOfDate =
    usableReconciliation?.asOfDate ??
    latestRun?.completedAt?.toISOString().slice(0, 10) ??
    new Date().toISOString().slice(0, 10);
  const [bqeMetrics, bqeTotals] = await Promise.all([
    loadProjectBqeMetrics(asOfDate),
    loadBqePortfolioTotals(asOfDate),
  ]);
  const projects = rows.map((row) =>
    toProject(
      row,
      bqeMetrics.get(row.code),
      reconciliationFor(usableReconciliation, row.code),
    ),
  );
  const completedAt = latestRun?.completedAt ?? null;
  const isStale = completedAt
    ? Date.now() - completedAt.getTime() > BQE_STALE_AFTER_MS
    : false;
  const state =
    !latestRun
      ? "empty"
      : latestRun.status !== "completed"
        ? "partial"
        : isStale
          ? "stale"
          : "fresh";
  const matchedProjects = projects.filter((project) => project.bqeMatched);
  const payload = {
    extractDate: completedAt?.toISOString().slice(0, 10) ?? EXTRACT_DATE,
    overlayUpdated: OVERLAY_DATE,
    bqe: {
      state,
      pullStatus: latestRun?.status ?? null,
      completedAt: completedAt?.toISOString() ?? null,
      matchedProjects: matchedProjects.length,
      objectCounts: latestRun?.objectCounts ?? {},
      errors: latestRun?.errors ?? {},
      totals: bqeTotals,
      reconciliation: usableReconciliation
        ? {
            reportingYear: usableReconciliation.reportingYear,
            asOfDate: usableReconciliation.asOfDate,
            hours: usableReconciliation.total2026Hours,
            excludedFutureHours: usableReconciliation.excludedFutureHours,
            invoicedAmount: usableReconciliation.total2026InvoicedAmount,
            invoiceRegister: usableReconciliation.invoiceRegister,
            paidAmount: usableReconciliation.total2026PaymentsReceived,
          }
        : null,
    },
    summary: summarize(projects),
    projects,
  };
  res.json(GetDashboardResponse.parse(payload));
});

router.get("/access", (_req, res): void => {
  res.json({
    role: res.locals.dashboardRole,
    canEdit: res.locals.dashboardRole === "editor",
  });
});

router.get("/projects/:code", async (req, res): Promise<void> => {
  await ensureSeeded();
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db.select().from(projectsTable).where(eq(projectsTable.code, params.data.code));
  if (!row) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const [reconciliation, latestRuns] = await Promise.all([
    getLatestBqeReconciliation(),
    db
      .select()
      .from(bqePullRunsTable)
      .where(isNotNull(bqePullRunsTable.completedAt))
      .orderBy(desc(bqePullRunsTable.completedAt))
      .limit(1),
  ]);
  const usableReconciliation = reconciliationForCompletedRun(
    latestRuns[0] ?? null,
    reconciliation,
  );
  const asOfDate =
    usableReconciliation?.asOfDate ??
    latestRuns[0]?.completedAt?.toISOString().slice(0, 10) ??
    new Date().toISOString().slice(0, 10);
  const metrics = await loadProjectBqeMetrics(asOfDate);
  res.json(
    GetProjectResponse.parse(
      toProject(
        row,
        metrics.get(row.code),
        reconciliationFor(usableReconciliation, row.code),
      ),
    ),
  );
});

router.patch("/projects/:code", requireDashboardEditor, async (req, res): Promise<void> => {
  await ensureSeeded();
  const params = UpdateProjectParams.safeParse(req.params);
  const body = UpdateProjectBody.safeParse(req.body);
  if (!params.success || !body.success) {
    const message = params.success ? (body.success ? "Invalid request" : body.error.message) : params.error.message;
    res.status(400).json({ error: message });
    return;
  }
  const update = body.data;
  const [row] = await db
    .update(projectsTable)
    .set({
      ...update,
      etcHours: update.etcHours == null ? update.etcHours : String(update.etcHours),
    })
    .where(eq(projectsTable.code, params.data.code))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  req.log.info({ code: row.code }, "Updated project PM overlay");
  const [reconciliation, latestRuns] = await Promise.all([
    getLatestBqeReconciliation(),
    db
      .select()
      .from(bqePullRunsTable)
      .where(isNotNull(bqePullRunsTable.completedAt))
      .orderBy(desc(bqePullRunsTable.completedAt))
      .limit(1),
  ]);
  const usableReconciliation = reconciliationForCompletedRun(
    latestRuns[0] ?? null,
    reconciliation,
  );
  const asOfDate =
    usableReconciliation?.asOfDate ??
    latestRuns[0]?.completedAt?.toISOString().slice(0, 10) ??
    new Date().toISOString().slice(0, 10);
  const metrics = await loadProjectBqeMetrics(asOfDate);
  res.json(
    UpdateProjectResponse.parse(
      toProject(
        row,
        metrics.get(row.code),
        reconciliationFor(usableReconciliation, row.code),
      ),
    ),
  );
});

export default router;