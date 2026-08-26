import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, projectsTable, type InsertProject, type Project } from "@workspace/db";
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

const router: IRouter = Router();
router.use(requireDashboardAccess);
const EXTRACT_DATE = "2026-08-19";
const OVERLAY_DATE = "2026-08-19";

const names = [
  ["26-0078", "Riverview Ranch Lot 15", "Timberwood Homes, LLC"],
  ["26-0140", "CBCD Micro-irrigation Engineering", "Columbia Basin Conservation District"],
  ["26-0141", "Snyder W. Line Staking", "Snyder W. Holdings"],
  ["26-0142", "Barnes Condo Survey", "Barnes Development"],
  ["2020108", "Copperstone", "Copperstone Partners"],
  ["26-0120", "Canyon Ridge Plat", "Canyon Ridge LLC"],
  ["26-0121", "North Fork Access", "North Fork Holdings"],
  ["26-0122", "Juniper Creek Boundary", "Juniper Creek LLC"],
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
      const existing = await db.select({ code: projectsTable.code }).from(projectsTable).limit(1);
      if (existing.length === 0) {
        await db.insert(projectsTable).values(seedRows());
      }
    })();
  }
  await seedPromise;
}

function numberValue(value: string | number | null): number {
  return value == null ? 0 : Number(value);
}

function toProject(row: Project) {
  return {
    code: row.code,
    name: row.name,
    client: row.client,
    pm: row.pm,
    priority: row.priority,
    overall: row.overall,
    confidence: row.confidence,
    contractValue: numberValue(row.contractValue),
    contractValueVisible: row.contractValueVisible,
    budgetExists: row.budgetExists,
    pctAvail: row.pctAvail,
    pctComplete: numberValue(row.pctComplete),
    dueAvail: row.dueAvail,
    dueDate: row.dueDate,
    recent90: row.recent90,
    laborWip: numberValue(row.laborWip),
    expenseWip: numberValue(row.expenseWip),
    openAr: numberValue(row.openAr),
    exposure: numberValue(row.exposure),
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

function summarize(rows: Project[]) {
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
  const rows = await db.select().from(projectsTable).orderBy(asc(projectsTable.code));
  const payload = {
    extractDate: EXTRACT_DATE,
    overlayUpdated: OVERLAY_DATE,
    summary: summarize(rows),
    projects: rows.map(toProject),
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
  res.json(GetProjectResponse.parse(toProject(row)));
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
  res.json(UpdateProjectResponse.parse(toProject(row)));
});

export default router;