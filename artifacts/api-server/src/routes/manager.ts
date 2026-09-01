import { Router, type IRouter } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  actionsTable,
  clientContactLogTable,
  db,
  healthRulesTable,
  pmNotesTable,
} from "@workspace/db";
import {
  requireDashboardAccess,
  requireDashboardAdmin,
  requireDashboardEditor,
} from "../middlewares/requireDashboardAccess";
import {
  computePortfolio,
  inferDiscipline,
  invalidatePortfolioCache,
  isValidHealthCondition,
  refreshAllHealthSnapshots,
  resolvePortfolioProjectId,
  setHealthOverride,
  type HealthSeverity,
} from "../lib/projectHealth";

const router: IRouter = Router();
router.use(requireDashboardAccess);

function scalar(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function projectId(req: { params: Record<string, unknown> }, key = "id"): string | null {
  const value = scalar(req.params[key]);
  return value && value.length <= 200 ? value : null;
}

function projectSummary(project: Awaited<ReturnType<typeof computePortfolio>>["projects"][number]) {
  return {
    id: project.id,
    number: project.number,
    name: project.name,
    client: project.client,
    pm: project.pm,
    fee: project.fee,
    severity: project.severity,
    computedSeverity: project.computedSeverity,
    triggeredRules: project.triggeredRules,
    unknownRules: project.unknownRules,
    override: project.override,
    riskLine: project.riskLine,
    actionLine: project.actionLine,
    percentComplete: project.percentComplete,
    daysSinceLastPmNote: project.daysSinceLastPmNote,
    metrics: project.metrics,
  };
}

router.get("/manager/portfolio", async (req, res): Promise<void> => {
  const view = scalar(req.query.view) ?? "portfolio";
  const pm = scalar(req.query.pm);
  if (!["portfolio", "mine"].includes(view) || (pm && pm.length > 200)) {
    res.status(400).json({ error: "view must be portfolio or mine; pm is optional." });
    return;
  }
  const portfolio = await computePortfolio();
  const all = portfolio.projects;
  const selected = view === "mine" && pm ? all.filter((project) => project.pm === pm) : all;
  const rows = selected.map(projectSummary);
  const bySeverity = (severity: HealthSeverity) =>
    rows.filter((project) => project.severity === severity)
      .sort((a, b) => b.fee - a.fee);
  res.json({
    view,
    pm: pm ?? null,
    scoreboard: {
      activeCount: rows.length,
      feeUnderManagement: rows.reduce((sum, row) => sum + row.fee, 0),
      unbilledWipEstimate: rows.reduce((sum, row) => sum + row.metrics.wipEstimate, 0),
      arTotal: portfolio.portfolioAr.total,
      arOver60: portfolio.portfolioAr.over60,
      arDataAsOf: portfolio.portfolioAr.dataAsOf,
      arActiveExternalRootCount: portfolio.portfolioAr.activeExternalRootCount,
      redCount: bySeverity("red").length,
      yellowCount: bySeverity("yellow").length,
      grayCount: bySeverity("gray").length,
    },
    red: bySeverity("red"),
    yellow: bySeverity("yellow"),
    gray: bySeverity("gray"),
    green: bySeverity("green"),
    projects: rows,
    pms: [...new Set(all.map((project) => project.pm).filter(Boolean))].sort(),
  });
});

router.get("/manager/plan-vs-actual/:projectId", async (req, res): Promise<void> => {
  const id = projectId(req, "projectId");
  if (!id) {
    res.status(400).json({ error: "A valid projectId is required." });
    return;
  }
  const data = await computePortfolio();
  const project = data.projects.find((row) => row.id === id || row.number === id);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  res.json({
    project: { id: project.id, number: project.number, name: project.name },
    hasBudget: project.metrics.budgetHours !== null,
    phases: data.phaseByProject.get(project.id) ?? [],
  });
});

router.get("/manager/capacity", async (req, res): Promise<void> => {
  const weeks = Number(scalar(req.query.weeks) ?? "4");
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 12) {
    res.status(400).json({ error: "weeks must be an integer from 1 through 12." });
    return;
  }
  const result = await db.execute<{
    employee: string;
    activityCode: string | null;
    actualHours: string | number;
    projectCount: string | number;
  }>(sql`
    SELECT employee,
      activity_code AS "activityCode",
      SUM(hours) AS "actualHours",
      COUNT(DISTINCT COALESCE(project_id, project_code)) AS "projectCount"
    FROM bqe_time_entries
    WHERE employee IS NOT NULL
      AND entry_date >= current_date - (${weeks}::integer * 7)
      AND entry_date <= current_date
    GROUP BY employee, activity_code
  `);
  const employeeStats = new Map<string, {
    actualHours: number;
    projectCount: number;
    byDiscipline: Map<string, number>;
  }>();
  for (const row of result.rows) {
    const actualHours = Number(row.actualHours);
    const discipline = inferDiscipline(row.activityCode);
    const current = employeeStats.get(row.employee) ?? {
      actualHours: 0,
      projectCount: 0,
      byDiscipline: new Map<string, number>(),
    };
    current.actualHours += actualHours;
    current.projectCount += Number(row.projectCount);
    current.byDiscipline.set(discipline, (current.byDiscipline.get(discipline) ?? 0) + actualHours);
    employeeStats.set(row.employee, current);
  }
  const people = new Map<string, {
    employee: string;
    discipline: string;
    actualHours: number;
    availableHours: number;
    utilization: number;
    flag: "over 90%" | "under 40%" | null;
    projectCount: number;
  }>();
  for (const [employee, stats] of employeeStats) {
    const discipline = [...stats.byDiscipline.entries()]
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "General";
    const current: {
      employee: string;
      discipline: string;
      actualHours: number;
      availableHours: number;
      utilization: number;
      flag: "over 90%" | "under 40%" | null;
      projectCount: number;
    } = {
      employee,
      discipline,
      actualHours: stats.actualHours,
      availableHours: 40 * weeks,
      utilization: 0,
      flag: null,
      projectCount: stats.projectCount,
    };
    current.utilization = current.availableHours ? current.actualHours / current.availableHours : 0;
    current.flag = current.utilization > 0.9 ? "over 90%" : current.utilization < 0.4 ? "under 40%" : null;
    people.set(employee, current);
  }
  const disciplines = [...new Set([...people.values()].map((person) => person.discipline))].map((discipline) => {
    const disciplinePeople = [...people.values()].filter((person) => person.discipline === discipline)
      .sort((a, b) => b.utilization - a.utilization);
    const actualHours = disciplinePeople.reduce((sum, person) => sum + person.actualHours, 0);
    const availableHours = disciplinePeople.length * 40 * weeks;
    return {
      discipline,
      headcount: disciplinePeople.length,
      actualHours,
      availableHours,
      utilization: availableHours ? actualHours / availableHours : 0,
      people: disciplinePeople,
    };
  });
  res.json({ weeks, label: "based on recent actuals", disciplines });
});

router.get("/actions", async (req, res): Promise<void> => {
  const requestedId = scalar(req.query.projectId);
  const id = requestedId ? await resolvePortfolioProjectId(requestedId) : undefined;
  if (requestedId && !id) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  const status = scalar(req.query.status);
  const filters = [
    id ? eq(actionsTable.projectId, id) : undefined,
    status ? eq(actionsTable.status, status) : undefined,
  ].filter((filter): filter is NonNullable<typeof filter> => Boolean(filter));
  const rows = await db.select().from(actionsTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(actionsTable.dueDate));
  res.json(rows);
});

router.post("/actions", requireDashboardEditor, async (req, res): Promise<void> => {
  const what = scalar(req.body?.what)?.trim();
  const status = scalar(req.body?.status) ?? "open";
  const requestedProjectId = scalar(req.body?.projectId);
  const canonicalProjectId = requestedProjectId ? await resolvePortfolioProjectId(requestedProjectId) : null;
  if (requestedProjectId && !canonicalProjectId) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  if (!what || what.length > 2_000 || !["open", "closed"].includes(status)) {
    res.status(400).json({ error: "what is required and status must be open or closed." });
    return;
  }
  const [row] = await db.insert(actionsTable).values({
    projectId: canonicalProjectId,
    what,
    ownerEmployeeId: scalar(req.body?.ownerEmployeeId) ?? null,
    dueDate: scalar(req.body?.dueDate)?.trim() || null,
    amount: req.body?.amount == null || req.body.amount === "" ? null : String(Number(req.body.amount)),
    status,
    createdInMeeting: req.body?.createdInMeeting === true,
    closedAt: status === "closed" ? new Date().toISOString().slice(0, 10) : null,
    closeNote: scalar(req.body?.closeNote) ?? null,
  }).returning();
  req.log.info({ actionId: row.id, projectId: row.projectId }, "Created manager action");
  res.status(201).json(row);
});

router.patch("/actions/:id", requireDashboardEditor, async (req, res): Promise<void> => {
  const id = projectId(req);
  const status = scalar(req.body?.status);
  if (!id || (status && !["open", "closed"].includes(status))) {
    res.status(400).json({ error: "A valid action id and status are required." });
    return;
  }
  const update = {
    ...(scalar(req.body?.what) != null ? { what: scalar(req.body.what)!.trim() } : {}),
    ...(scalar(req.body?.ownerEmployeeId) != null ? { ownerEmployeeId: scalar(req.body.ownerEmployeeId) } : {}),
    ...(scalar(req.body?.dueDate) != null ? { dueDate: scalar(req.body.dueDate) } : {}),
    ...(req.body?.amount !== undefined ? { amount: req.body.amount == null ? null : String(Number(req.body.amount)) } : {}),
    ...(status ? { status, closedAt: status === "closed" ? new Date().toISOString().slice(0, 10) : null } : {}),
    ...(scalar(req.body?.closeNote) != null ? { closeNote: scalar(req.body.closeNote) } : {}),
  };
  const [row] = await db.update(actionsTable).set(update).where(eq(actionsTable.id, id)).returning();
  if (!row) {
    res.status(404).json({ error: "Action not found." });
    return;
  }
  res.json(row);
});

router.post("/projects/:id/notes", requireDashboardEditor, async (req, res): Promise<void> => {
  const requestedId = projectId(req);
  const id = requestedId ? await resolvePortfolioProjectId(requestedId) : null;
  const asOf = scalar(req.body?.asOf) ?? new Date().toISOString().slice(0, 10);
  const percent = req.body?.percentComplete == null || req.body.percentComplete === ""
    ? null
    : Number(req.body.percentComplete);
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(asOf) || (percent !== null && (!Number.isFinite(percent) || percent < 0 || percent > 100))) {
    res.status(400).json({ error: "Valid project, asOf, and percentComplete 0–100 are required." });
    return;
  }
  const [row] = await db.insert(pmNotesTable).values({
    projectId: id,
    asOf,
    riskLine: scalar(req.body?.riskLine) ?? "",
    actionLine: scalar(req.body?.actionLine) ?? "",
    percentComplete: percent === null ? null : String(percent),
    enteredBy: res.locals.userId,
  }).onConflictDoUpdate({
    target: [pmNotesTable.projectId, pmNotesTable.asOf],
    set: {
      riskLine: scalar(req.body?.riskLine) ?? "",
      actionLine: scalar(req.body?.actionLine) ?? "",
      percentComplete: percent === null ? null : String(percent),
      enteredBy: res.locals.userId,
    },
  }).returning();
  invalidatePortfolioCache();
  res.status(201).json(row);
});

router.post("/projects/:id/contact-log", requireDashboardEditor, async (req, res): Promise<void> => {
  const requestedId = projectId(req);
  const id = requestedId ? await resolvePortfolioProjectId(requestedId) : null;
  const method = scalar(req.body?.method)?.trim();
  const summary = scalar(req.body?.summary)?.trim();
  const contactDate = scalar(req.body?.contactDate) ?? new Date().toISOString().slice(0, 10);
  if (!id || !method || !summary || !/^\d{4}-\d{2}-\d{2}$/.test(contactDate)) {
    res.status(400).json({ error: "project, contactDate, method, and summary are required." });
    return;
  }
  const [row] = await db.insert(clientContactLogTable).values({
    projectId: id,
    contactDate,
    method,
    summary,
    loggedBy: res.locals.userId,
  }).returning();
  invalidatePortfolioCache();
  res.status(201).json(row);
});

router.post("/projects/:id/health-override", requireDashboardEditor, async (req, res): Promise<void> => {
  const id = projectId(req);
  const severity = (scalar(req.body?.severity) ?? scalar(req.body?.status)) as HealthSeverity | undefined;
  const reason = scalar(req.body?.reason)?.trim();
  if (!id || !severity || !["red", "yellow", "green", "gray"].includes(severity) || !reason) {
    res.status(400).json({ error: "severity and a non-empty reason are required." });
    return;
  }
  const snapshot = await setHealthOverride(id, severity, reason, res.locals.userId);
  if (!snapshot) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  res.json(snapshot);
});

router.get("/health-rules", async (_req, res): Promise<void> => {
  res.json(await db.select().from(healthRulesTable)
    .where(eq(healthRulesTable.active, true)).orderBy(healthRulesTable.sortOrder));
});

router.patch("/health-rules/:id", requireDashboardAdmin, async (req, res): Promise<void> => {
  const id = projectId(req);
  const severity = scalar(req.body?.severity);
  const condition = req.body?.condition;
  if (severity !== undefined && !["red", "yellow", "gray"].includes(severity)) {
    res.status(400).json({ error: "severity must be red, yellow, or gray." });
    return;
  }
  if (condition !== undefined && !isValidHealthCondition(condition)) {
    res.status(400).json({ error: "condition must use a supported rule type and valid numeric thresholds." });
    return;
  }
  const update = {
    ...(scalar(req.body?.name)?.trim() ? { name: scalar(req.body.name)!.trim() } : {}),
    ...(severity && ["red", "yellow", "gray"].includes(severity) ? { severity } : {}),
    ...(condition && typeof condition === "object" && !Array.isArray(condition) ? { condition } : {}),
    ...(typeof req.body?.active === "boolean" ? { active: req.body.active } : {}),
    ...(Number.isInteger(req.body?.sortOrder) ? { sortOrder: req.body.sortOrder } : {}),
  };
  if (!id || Object.keys(update).length === 0) {
    res.status(400).json({ error: "Provide a valid rule id and at least one supported change." });
    return;
  }
  const [row] = await db.update(healthRulesTable).set(update)
    .where(eq(healthRulesTable.id, id)).returning();
  if (!row) {
    res.status(404).json({ error: "Health rule not found." });
    return;
  }
  invalidatePortfolioCache();
  res.json(row);
});

router.post("/manager/health-refresh", requireDashboardAdmin, async (_req, res): Promise<void> => {
  const refreshed = await refreshAllHealthSnapshots();
  res.json({ refreshed });
});

router.get("/projects", async (_req, res): Promise<void> => {
  res.json((await computePortfolio()).projects.map(projectSummary));
});

router.get("/manager/projects/:id", async (req, res): Promise<void> => {
  const id = projectId(req);
  if (!id) {
    res.status(400).json({ error: "A valid project id is required." });
    return;
  }
  const data = await computePortfolio();
  const project = data.projects.find((row) => row.id === id || row.number === id);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  const [actions] = await Promise.all([
    db.select().from(actionsTable).where(eq(actionsTable.projectId, project.id)).orderBy(asc(actionsTable.dueDate)),
  ]);
  const detail = data.detailByProject.get(project.id);
  res.json({
    ...projectSummary(project),
    phases: data.phaseByProject.get(project.id) ?? [],
    activities: project.metrics.activities,
    timeEntries: detail?.timeEntries ?? [],
    invoices: detail?.invoices ?? [],
    contacts: detail?.contacts ?? [],
    pmNote: detail?.pmNote ?? null,
    actions,
    nextMilestone: null,
  });
});

export default router;