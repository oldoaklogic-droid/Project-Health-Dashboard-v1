import { Router, type IRouter } from "express";
import { desc, isNotNull } from "drizzle-orm";
import { bqePullRunsTable, db } from "@workspace/db";
import { GetDashboardResponse, GetProjectParams } from "@workspace/api-zod";
import { requireDashboardAccess } from "../middlewares/requireDashboardAccess";
import { getLatestBqeReconciliation } from "../lib/bqePull";
import { reconciliationForCompletedRun } from "../lib/dashboardBqe";
import { computePortfolio } from "../lib/projectHealth";

const router: IRouter = Router();
router.use(requireDashboardAccess);
const BQE_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

type DashboardProject = ReturnType<typeof snapshotDashboardProject>;

function snapshotDashboardProject(project: Awaited<ReturnType<typeof computePortfolio>>["projects"][number], capturedAt: string) {
  return {
    code: project.number, name: project.name, client: project.client, pm: project.pm,
    priority: "UNKNOWN", overall: project.severity.toUpperCase(), confidence: "SNAPSHOT",
    contractValue: project.fee, contractValueVisible: project.fee > 0,
    budgetExists: project.metrics.budgetHours !== null, pctAvail: project.percentComplete !== null,
    pctComplete: project.percentComplete ?? 0, dueAvail: false, dueDate: null,
    recent90: project.metrics.daysSinceLastTime !== null && project.metrics.daysSinceLastTime <= 90 ? 1 : 0,
    laborWip: project.metrics.wipEstimate, expenseWip: 0, openAr: project.metrics.arTotal,
    exposure: project.metrics.arTotal, bqeMatched: true, bqePulledAt: capturedAt,
    actualHours: project.metrics.actualHours, budgetHours: project.metrics.budgetHours,
    invoicedAmount: project.metrics.invoicedAmount, paidAmount: null,
    reconciliationHours: null, reconciliationInvoicedAmount: null, reconciliationPaidAmount: null,
    reconciliationRolledUpHours: null, reconciliationRolledUpInvoicedAmount: null, reconciliationRolledUpPaidAmount: null,
    deliverable: "", etcHours: null, scopeNote: "", blocker: "", nextAction: "", owner: "",
    actionDue: null, lastContact: null, pmUpdate: false,
  };
}

function summarize(rows: DashboardProject[]) {
  const count = rows.length;
  const coverage = [
    ["Project manager", rows.filter((row) => row.pm.trim()).length],
    ["Contract value visible", rows.filter((row) => row.contractValueVisible).length],
    ["BQE budget object", rows.filter((row) => row.budgetExists).length],
    ["Percent complete", rows.filter((row) => row.pctAvail).length],
    ["Time activity (90d)", rows.filter((row) => row.recent90 > 0).length],
    ["Open AR", rows.filter((row) => row.openAr > 0).length],
  ].map(([label, value]) => ({ label: String(label), count: Number(value), pct: count ? Number(value) / count * 100 : 0, note: "Snapshot portfolio data" }));
  return {
    activeRoots: count, namedPm: rows.filter((row) => row.pm.trim()).length,
    financialExposure: rows.reduce((sum, row) => sum + row.exposure, 0),
    overall: rows.reduce<Record<string, number>>((out, row) => ({ ...out, [row.overall]: (out[row.overall] ?? 0) + 1 }), {}),
    confidence: rows.reduce<Record<string, number>>((out, row) => ({ ...out, [row.confidence]: (out[row.confidence] ?? 0) + 1 }), {}),
    coverage, byPm: rows.reduce<Record<string, number>>((out, row) => ({ ...out, [row.pm]: (out[row.pm] ?? 0) + 1 }), {}),
  };
}

router.get("/dashboard", async (_req, res): Promise<void> => {
  const [portfolio, latestRuns, reconciliation] = await Promise.all([
    computePortfolio(),
    db.select().from(bqePullRunsTable).where(isNotNull(bqePullRunsTable.completedAt)).orderBy(desc(bqePullRunsTable.completedAt)).limit(1),
    getLatestBqeReconciliation(),
  ]);
  const latestRun = latestRuns[0] ?? null;
  const usableReconciliation = reconciliationForCompletedRun(latestRun, reconciliation);
  const projects = portfolio.projects.map((project) => snapshotDashboardProject(project, portfolio.snapshot.capturedAt));
  const completedAt = latestRun?.completedAt ?? null;
  const state = !latestRun ? "empty" : latestRun.status !== "completed" ? "partial" :
    Date.now() - completedAt!.getTime() > BQE_STALE_AFTER_MS ? "stale" : "fresh";
  res.json(GetDashboardResponse.parse({
    extractDate: portfolio.asOf, overlayUpdated: "",
    bqe: {
      state, pullStatus: latestRun?.status ?? null, completedAt: completedAt?.toISOString() ?? null,
      matchedProjects: projects.length, objectCounts: latestRun?.objectCounts ?? {}, errors: latestRun?.errors ?? {},
      totals: {
        hours: projects.reduce((sum, row) => sum + (row.actualHours ?? 0), 0),
        budgetHours: projects.reduce((sum, row) => sum + (row.budgetHours ?? 0), 0),
        invoicedAmount: projects.reduce((sum, row) => sum + (row.invoicedAmount ?? 0), 0), paidAmount: 0,
      },
      reconciliation: usableReconciliation ? {
        reportingYear: usableReconciliation.reportingYear, asOfDate: usableReconciliation.asOfDate,
        hours: usableReconciliation.total2026Hours, excludedFutureHours: usableReconciliation.excludedFutureHours,
        invoicedAmount: usableReconciliation.total2026InvoicedAmount, invoiceRegister: usableReconciliation.invoiceRegister,
        paidAmount: usableReconciliation.total2026PaymentsReceived,
      } : null,
    },
    summary: summarize(projects), projects,
  }));
});

router.get("/access", (_req, res): void => {
  const isAdmin = res.locals.dashboardRole === "admin";
  res.json({ userId: res.locals.userId, role: res.locals.dashboardRole, canEdit: res.locals.dashboardRole === "editor" || isAdmin, isAdmin });
});

router.get("/projects/:code", async (req, res): Promise<void> => {
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const portfolio = await computePortfolio();
  const project = portfolio.projects.find((candidate) => candidate.number === params.data.code);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }
  res.json(snapshotDashboardProject(project, portfolio.snapshot.capturedAt));
});

export default router;