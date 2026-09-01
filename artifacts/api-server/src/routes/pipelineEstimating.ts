import { Router, type IRouter } from "express";
import { and, asc, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import {
  bqeProjectsTable,
  db,
  intakesTable,
  leadsTable,
  localProjectsTable,
} from "@workspace/db";
import {
  requireDashboardAccess,
  requireDashboardEditor,
} from "../middlewares/requireDashboardAccess";
import { calculateEstimate } from "../lib/estimating";
import { getQuestionTree } from "../lib/questionTreeSeed";
import { orchestrateBqeProjectCreation } from "../lib/bqeProjectOrchestrator";

const router: IRouter = Router();
router.use(requireDashboardAccess);

const DEFAULT_RATE = 220;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
const text = (value: unknown, required = false): string | undefined => {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || (required && !value.trim())) return undefined;
  return value.trim();
};
const number = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
const validDate = (value: unknown): value is string =>
  typeof value === "string" && DATE.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
const fail = (res: import("express").Response, status: number, error: string) =>
  res.status(status).json({ error });
const asNumber = (value: string | number) => Number(value);
const paramId = (value: string | string[] | undefined): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;
const dueDateFor = (startDate: string | null, hours: number): string | null => {
  if (!startDate || !validDate(startDate)) return null;
  const due = new Date(`${startDate}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + Math.max(14, Math.ceil(hours / 8) * 2));
  return due.toISOString().slice(0, 10);
};

function estimateFor(intake: typeof intakesTable.$inferSelect) {
  const estimate = calculateEstimate({
    disciplines: intake.disciplines,
    drivers: intake.drivers,
    stepFlags: intake.stepFlags,
    rate: DEFAULT_RATE,
  });
  if (!estimate) return null;
  const overrides = object(intake.overrides) ?? {};
  let totalHours = 0;
  const disciplines = estimate.disciplines.map((discipline) => {
    const activities = discipline.activities.map((activity) => {
      const override = object(overrides[activity.code]);
      const overrideHours = override ? number(override.hours) : undefined;
      return overrideHours === undefined
        ? activity
        : { ...activity, calculatedHours: overrideHours };
    });
    const activityByCode = new Map(activities.map((activity) => [activity.code, activity]));
    const phases = discipline.phases.map((phase) => ({
      ...phase,
      activities: phase.activities.map((activity) => activityByCode.get(activity.code) ?? activity),
    }));
    const disciplineHours = activities.reduce((sum, activity) => sum + (activity.calculatedHours ?? 0), 0);
    totalHours += disciplineHours;
    return {
      ...discipline,
      activities,
      phases,
      totalHours: disciplineHours,
      fee: disciplineHours * estimate.rate,
    };
  });
  return {
    ...estimate,
    disciplines,
    totalHours,
    totalFee: totalHours * estimate.rate,
  };
}

function intakePatch(body: Record<string, unknown>) {
  const allowed = [
    "leadId", "client", "contact", "phone", "email", "address", "parcel",
    "referralSource", "primaryRequest", "propertyPlans", "disciplines", "answers",
    "drivers", "stepFlags", "contractType", "paymentTerms", "startDate",
    "targetCompletion", "pmByDiscipline", "overrides",
  ] as const;
  const result: Record<string, unknown> = {};
  for (const key of allowed) if (body[key] !== undefined) result[key] = body[key];
  if (Object.keys(result).length === 0) return null;
  if (result.client !== undefined && !text(result.client, true)) return null;
  for (const key of ["contact", "phone", "email", "address", "parcel", "referralSource", "primaryRequest", "propertyPlans", "contractType", "paymentTerms"] as const) {
    if (result[key] !== undefined && result[key] !== null && !text(result[key])) return null;
  }
  if (result.disciplines !== undefined && (!Array.isArray(result.disciplines) || result.disciplines.some((x) => !text(x, true)))) return null;
  for (const key of ["answers", "drivers", "stepFlags", "pmByDiscipline", "overrides"] as const) {
    if (result[key] !== undefined && !object(result[key])) return null;
  }
  if (result.drivers && Object.values(result.drivers as Record<string, unknown>).some((x) => number(x) === undefined || number(x)! < 0)) return null;
  if (result.stepFlags && Object.values(result.stepFlags as Record<string, unknown>).some((x) => typeof x !== "boolean")) return null;
  for (const key of ["startDate", "targetCompletion"] as const) if (result[key] !== undefined && result[key] !== null && !validDate(result[key])) return null;
  return result;
}

router.get("/leads", async (_req, res): Promise<void> => {
  res.json(await db.select().from(leadsTable).orderBy(desc(leadsTable.createdAt)));
});

router.post("/leads", requireDashboardEditor, async (req, res): Promise<void> => {
  const body = object(req.body);
  if (!body) return void fail(res, 400, "A lead object is required.");
  const values = ["who", "what", "where", "source", "spotter"].map((key) => text(body[key], true));
  const status = body.status === undefined ? "New" : text(body.status, true);
  if (values.some((value) => !value) || !status || !["New", "Moved to Intake", "Dropped"].includes(status)) return void fail(res, 400, "Lead fields or status are invalid.");
  const [lead] = await db.insert(leadsTable).values({ who: values[0]!, what: values[1]!, where: values[2]!, source: values[3]!, spotter: values[4]!, status }).returning();
  res.status(201).json(lead);
});

router.patch("/leads/:id", requireDashboardEditor, async (req, res): Promise<void> => {
  const id = paramId(req.params.id);
  if (!id) return void fail(res, 400, "A valid lead id is required.");
  const body = object(req.body);
  if (!body) return void fail(res, 400, "A lead update object is required.");
  const update: Record<string, string> = {};
  for (const key of ["who", "what", "where", "source", "spotter", "status"]) {
    if (body[key] !== undefined) {
      const value = text(body[key], true);
      if (!value || (key === "status" && !["New", "Moved to Intake", "Dropped"].includes(value))) return void fail(res, 400, "Invalid lead update.");
      update[key] = value;
    }
  }
  if (!Object.keys(update).length) return void fail(res, 400, "No editable lead fields were supplied.");
  const [lead] = await db.update(leadsTable).set(update).where(eq(leadsTable.id, id)).returning();
  if (!lead) return void fail(res, 404, "Lead not found.");
  res.json(lead);
});

router.get("/intakes", async (_req, res): Promise<void> => {
  res.json(await db.select().from(intakesTable).orderBy(desc(intakesTable.createdAt)));
});

router.post("/intakes", requireDashboardEditor, async (req, res): Promise<void> => {
  const body = object(req.body);
  const update = body && intakePatch(body);
  if (!update || !text(update.client, true)) return void fail(res, 400, "A client and valid intake fields are required.");
  const [intake] = await db.insert(intakesTable).values(update as typeof intakesTable.$inferInsert).returning();
  if (intake.leadId) await db.update(leadsTable).set({ status: "Moved to Intake" }).where(eq(leadsTable.id, intake.leadId));
  res.status(201).json(intake);
});

router.patch("/intakes/:id", requireDashboardEditor, async (req, res): Promise<void> => {
  const id = paramId(req.params.id);
  if (!id) return void fail(res, 400, "A valid intake id is required.");
  const body = object(req.body);
  const update = body && intakePatch(body);
  if (!update) return void fail(res, 400, "Invalid intake update.");
  const [intake] = await db
    .update(intakesTable)
    .set(update)
    .where(and(eq(intakesTable.id, id), isNull(intakesTable.estimateApprovedAt)))
    .returning();
  if (!intake) {
    const [current] = await db.select({ id: intakesTable.id }).from(intakesTable).where(eq(intakesTable.id, id));
    return void fail(res, current ? 409 : 404, current ? "Approved intakes are locked." : "Intake not found.");
  }
  res.json(intake);
});

router.get("/intakes/:id/estimate", async (req, res): Promise<void> => {
  const id = paramId(req.params.id);
  if (!id) return void fail(res, 400, "A valid intake id is required.");
  const [intake] = await db.select().from(intakesTable).where(eq(intakesTable.id, id));
  if (!intake) return void fail(res, 404, "Intake not found.");
  const estimate = estimateFor(intake);
  if (!estimate) return void fail(res, 400, "The intake has no recognized estimating discipline.");
  res.json(estimate);
});

router.post("/intakes/:id/approve-estimate", requireDashboardEditor, async (req, res): Promise<void> => {
  const id = paramId(req.params.id);
  if (!id) return void fail(res, 400, "A valid intake id is required.");
  const outcome = await db.transaction(async (tx) => {
    const [intake] = await tx
      .select()
      .from(intakesTable)
      .where(eq(intakesTable.id, id))
      .for("update");
    if (!intake) return { approved: null, status: 404, message: "Intake not found." };
    if (intake.estimateApprovedAt) return { approved: null, status: 409, message: "The estimate is already approved." };
    if (!estimateFor(intake)) return { approved: null, status: 400, message: "A valid estimate is required before approval." };
    const [approved] = await tx
      .update(intakesTable)
      .set({ estimateApprovedAt: new Date() })
      .where(and(eq(intakesTable.id, intake.id), isNull(intakesTable.estimateApprovedAt)))
      .returning();
    return approved
      ? { approved, status: 200, message: "" }
      : { approved: null, status: 409, message: "The estimate changed while approval was in progress." };
  });
  if (!outcome.approved) return void fail(res, outcome.status, outcome.message);
  res.json(outcome.approved);
});

router.post("/intakes/:id/create-project", requireDashboardEditor, async (req, res): Promise<void> => {
  const id = paramId(req.params.id);
  if (!id) return void fail(res, 400, "A valid intake id is required.");
  const dryRun = req.query.dryRun === "true" ? true : req.query.dryRun === "false" ? false : null;
  if (dryRun === null) return void fail(res, 400, "dryRun must be true or false.");
  if (!dryRun && res.locals.dashboardRole !== "admin") return void fail(res, 403, "Administrator approval is required to create BQE projects.");
  const [intake] = await db.select().from(intakesTable).where(eq(intakesTable.id, id));
  if (!intake) return void fail(res, 404, "Intake not found.");
  if (!intake.estimateApprovedAt) return void fail(res, 409, "An approved estimate is required before creating a project.");
  const estimate = estimateFor(intake);
  if (!estimate) return void fail(res, 400, "The approved intake no longer has a valid estimate.");
  const requestBody = object(req.body) ?? {};
  const employeeGroupName =
    text(requestBody.employeeGroupName) ??
    text(object(intake.answers)?.employeeGroup);
  const pm = Object.values(intake.pmByDiscipline).find((value) => text(value, true));
  if (!pm) return void fail(res, 400, "At least one project manager is required.");
  if (!employeeGroupName) return void fail(res, 400, "A BQE employee group is required.");
  try {
    if (!dryRun) {
      const [existingProject] = await db
        .select({ id: localProjectsTable.id })
        .from(localProjectsTable)
        .where(eq(localProjectsTable.intakeId, intake.id))
        .limit(1);
      if (existingProject) {
        return void fail(res, 409, `A local project already exists for this intake (${existingProject.id}).`);
      }
    }
    const existing = await db.select({ projectNumber: localProjectsTable.projectNumber }).from(localProjectsTable);
    const projectNumber = String(existing.reduce((highest, row) => {
      const parsed = Number.parseInt(row.projectNumber, 10);
      return Number.isFinite(parsed) ? Math.max(highest, parsed) : highest;
    }, 25999) + 1);
    const activities = estimate.disciplines.flatMap((discipline) =>
      discipline.activities.map((activity) => ({
        code: activity.code,
        desc: activity.desc,
        phase: activity.phase,
        estimatedHours: activity.calculatedHours,
      })),
    );
    const answerProjectName = text(object(intake.answers)?.projectName);
    const projectValues = {
      id: crypto.randomUUID(),
      intakeId: intake.id,
      bqeParentProjectId: null,
      bqeChildProjectIds: {},
      projectNumber,
      name: answerProjectName || intake.primaryRequest || `${intake.client} Project`,
      client: intake.client,
      pm,
      address: intake.address,
      disciplines: intake.disciplines,
      originalHours: String(estimate.totalHours),
      approvedHours: String(estimate.totalHours),
      rate: String(DEFAULT_RATE),
      fee: String(estimate.totalFee),
      dueDate: dueDateFor(intake.startDate, estimate.totalHours),
      status: "Draft",
      phases: estimate.disciplines.flatMap((discipline) =>
        discipline.phases.map((phase) => ({ name: phase.name, status: "Not Started" })),
      ),
      activities,
      changeOrders: [],
      closeout: {},
      adjustmentLogs: [],
      createdAt: new Date(),
    };
    const localProject = dryRun
      ? projectValues
      : (await db.insert(localProjectsTable).values(projectValues).returning())[0];
    const result = await orchestrateBqeProjectCreation({
      intake,
      estimate,
      localProject,
      dryRun,
      employeeGroupName,
    });
    if (!dryRun) {
      await db
        .update(localProjectsTable)
        .set({
          bqeParentProjectId: result.projectIds.parent,
          bqeChildProjectIds: result.projectIds.children,
        })
        .where(eq(localProjectsTable.id, localProject.id));
    }
    if (result.status === "partial") {
      res.status(502).json({
        error: "BQE project creation stopped after a partial failure.",
        localProjectId: dryRun ? null : localProject.id,
        orchestration: result,
      });
      return;
    }
    res.status(dryRun ? 200 : 201).json({
      localProject: dryRun ? null : localProject,
      orchestration: result,
    });
  } catch (error) {
    fail(res, 502, `BQE project creation could not be completed: ${error instanceof Error ? error.message : "unknown error"}`);
  }
});

router.get("/local-projects", async (_req, res): Promise<void> => {
  res.json(await db.select().from(localProjectsTable).orderBy(desc(localProjectsTable.createdAt)));
});

router.get("/local-projects/:id", async (req, res): Promise<void> => {
  const id = paramId(req.params.id);
  if (!id) return void fail(res, 400, "A valid local project id is required.");
  const [project] = await db.select().from(localProjectsTable).where(eq(localProjectsTable.id, id));
  if (!project) return void fail(res, 404, "Local project not found.");
  res.json(project);
});

router.patch("/local-projects/:id", requireDashboardEditor, async (req, res): Promise<void> => {
  const id = paramId(req.params.id);
  if (!id) return void fail(res, 400, "A valid local project id is required.");
  const body = object(req.body);
  if (!body) return void fail(res, 400, "A project update object is required.");
  const [current] = await db.select().from(localProjectsTable).where(eq(localProjectsTable.id, id));
  if (!current) return void fail(res, 404, "Local project not found.");
  if (current.status === "Closed") return void fail(res, 409, "Closed projects are immutable.");
  const update: Record<string, unknown> = {};
  for (const key of ["name", "client", "pm", "address", "status", "dueDate"]) if (body[key] !== undefined) update[key] = body[key];
  if (update.name !== undefined && !text(update.name, true) || update.client !== undefined && !text(update.client, true) || update.pm !== undefined && !text(update.pm, true) || update.dueDate !== undefined && !validDate(update.dueDate)) return void fail(res, 400, "Invalid project update.");
  const rate = body.rate === undefined ? asNumber(current.rate) : number(body.rate);
  const hours = body.approvedHours === undefined ? asNumber(current.approvedHours) : number(body.approvedHours);
  if (rate === undefined || rate < 0 || hours === undefined || hours < 0) return void fail(res, 400, "Rate and approved hours must be nonnegative numbers.");
  update.rate = String(rate); update.approvedHours = String(hours); update.fee = String(rate * hours);
  const [project] = await db.update(localProjectsTable).set(update).where(eq(localProjectsTable.id, current.id)).returning();
  res.json(project);
});

router.patch("/local-projects/:id/phases", requireDashboardEditor, async (req, res): Promise<void> => {
  const id = paramId(req.params.id);
  const body = object(req.body);
  const phaseName = body && text(body.name, true);
  const status = body && text(body.status, true);
  if (!id || !phaseName || !status || !["Not Started", "In Progress", "Complete"].includes(status)) {
    return void fail(res, 400, "A valid phase name and status are required.");
  }
  const [project] = await db.select().from(localProjectsTable).where(eq(localProjectsTable.id, id));
  if (!project) return void fail(res, 404, "Local project not found.");
  if (project.status === "Closed") return void fail(res, 409, "Closed projects are immutable.");
  const phases = Array.isArray(project.phases) ? project.phases : [];
  let found = false;
  const next = phases.map((phase) => {
    const value = object(phase);
    if (value && text(value.name, true) === phaseName) {
      found = true;
      return { ...value, status };
    }
    return phase;
  });
  if (!found) return void fail(res, 404, "Project phase not found.");
  const [updated] = await db.update(localProjectsTable).set({ phases: next }).where(eq(localProjectsTable.id, id)).returning();
  res.json(updated);
});

router.post("/local-projects/:id/change-orders", requireDashboardEditor, async (req, res): Promise<void> => {
  const id = paramId(req.params.id);
  if (!id) return void fail(res, 400, "A valid local project id is required.");
  const body = object(req.body);
  const requestedHours = body ? number(body.requestedHours) : undefined;
  if (!body || !text(body.description, true) || !text(body.reason, true) || requestedHours === undefined || requestedHours < 0 || (body.authorized !== undefined && typeof body.authorized !== "boolean")) return void fail(res, 400, "A valid change order is required.");
  const [project] = await db.select().from(localProjectsTable).where(eq(localProjectsTable.id, id));
  if (!project) return void fail(res, 404, "Local project not found.");
  if (project.status === "Closed") return void fail(res, 409, "Closed projects are immutable.");
  const orders = Array.isArray(project.changeOrders) ? project.changeOrders : [];
  const order = { id: crypto.randomUUID(), description: text(body.description, true)!, reason: text(body.reason, true)!, requestedHours, authorized: body.authorized === true, createdAt: new Date().toISOString() };
  const next = [...orders, order];
  const approvedHours = asNumber(project.originalHours) + next.reduce<number>((sum, item) => {
    const value = object(item);
    const hours = value ? number(value.requestedHours) : undefined;
    return sum + (value?.authorized === true && hours !== undefined ? hours : 0);
  }, 0);
  const [updated] = await db.update(localProjectsTable).set({ changeOrders: next, approvedHours: String(approvedHours), fee: String(approvedHours * asNumber(project.rate)) }).where(eq(localProjectsTable.id, project.id)).returning();
  res.status(201).json(updated);
});

router.patch("/local-projects/:id/change-orders/:changeOrderId", requireDashboardEditor, async (req, res): Promise<void> => {
  const id = paramId(req.params.id);
  const changeOrderId = paramId(req.params.changeOrderId);
  const body = object(req.body);
  if (!id || !changeOrderId || !body || typeof body.authorized !== "boolean") {
    return void fail(res, 400, "An authorization decision is required.");
  }
  const [project] = await db.select().from(localProjectsTable).where(eq(localProjectsTable.id, id));
  if (!project) return void fail(res, 404, "Local project not found.");
  if (project.status === "Closed") return void fail(res, 409, "Closed projects are immutable.");
  const orders = Array.isArray(project.changeOrders) ? project.changeOrders : [];
  let found = false;
  const next = orders.map((item) => {
    const value = object(item);
    if (value && text(value.id, true) === changeOrderId) {
      found = true;
      return { ...value, authorized: body.authorized };
    }
    return item;
  });
  if (!found) return void fail(res, 404, "Change order not found.");
  const approvedHours = asNumber(project.originalHours) + next.reduce<number>((sum, item) => {
    const value = object(item);
    const hours = value ? number(value.requestedHours) : undefined;
    return sum + (value?.authorized === true && hours !== undefined ? hours : 0);
  }, 0);
  const [updated] = await db.update(localProjectsTable).set({
    changeOrders: next,
    approvedHours: String(approvedHours),
    fee: String(approvedHours * asNumber(project.rate)),
  }).where(eq(localProjectsTable.id, id)).returning();
  res.json(updated);
});

router.post("/local-projects/:id/closeout", requireDashboardEditor, async (req, res): Promise<void> => {
  const id = paramId(req.params.id);
  if (!id) return void fail(res, 400, "A valid local project id is required.");
  const body = object(req.body); const actualHours = body && object(body.actualHours);
  if (!body || !actualHours) return void fail(res, 400, "actualHours is required.");
  const [project] = await db.select().from(localProjectsTable).where(eq(localProjectsTable.id, id));
  if (!project) return void fail(res, 404, "Local project not found.");
  if (project.status === "Closed") return void fail(res, 409, "Closed projects are immutable.");
  const phases = Array.isArray(project.phases) ? project.phases : [];
  const activities = Array.isArray(project.activities) ? project.activities : [];
  if (phases.some((phase) => object(phase)?.status !== "Complete")) return void fail(res, 409, "All phases must be complete before closeout.");
  const logs = [];
  let totalActualHours = 0;
  for (const activity of activities) {
    const item = object(activity); const code = item && text(item.code, true); const estimated = item && number(item.estimatedHours);
    const actual = code ? number(actualHours[code]) : undefined;
    if (!code || estimated === undefined || estimated === null || actual === undefined || actual < 0) return void fail(res, 400, "A nonnegative actual hour value is required for every activity.");
    totalActualHours += actual;
    logs.push({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), activityCode: code, activityDescription: text(item.desc) ?? text(item.description) ?? "", estimatedHours: estimated, actualHours: actual, varianceHours: actual - estimated });
  }
  const approvedHours = asNumber(project.approvedHours);
  if (
    approvedHours > 0 &&
    Math.abs(totalActualHours - approvedHours) / approvedHours > .2 &&
    (!text(body.varianceReason, true) || !text(body.varianceNote, true))
  ) return void fail(res, 400, "Variance reason and note are required when total actual hours vary from approved hours by more than 20%.");
  const [closed] = await db.update(localProjectsTable).set({ status: "Closed", closeout: { actualHours, varianceReason: text(body.varianceReason), varianceNote: text(body.varianceNote), closedAt: new Date().toISOString() }, adjustmentLogs: logs }).where(eq(localProjectsTable.id, project.id)).returning();
  res.json(closed);
});

router.get("/estimating/fingerprints", async (_req, res): Promise<void> => {
  const { historicalFingerprint } = await import("../lib/historicalFingerprint.js");
  res.json(historicalFingerprint);
});

router.get("/question-tree", async (_req, res): Promise<void> => {
  res.json(await getQuestionTree());
});

router.get("/bqe/clients/search", async (req, res): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) return void fail(res, 400, "A client search query q is required.");
  const like = `%${q}%`;
  const rows = await db
    .selectDistinctOn([bqeProjectsTable.client], {
      name: bqeProjectsTable.client,
      bqeClientId: sql<string | null>`coalesce(
        ${bqeProjectsTable.rawJson}->>'clientId',
        ${bqeProjectsTable.rawJson}->>'clientID',
        ${bqeProjectsTable.rawJson}->'client'->>'id'
      )`,
      pulledAt: bqeProjectsTable.pulledAt,
    })
    .from(bqeProjectsTable)
    .where(ilike(bqeProjectsTable.client, like))
    .orderBy(asc(bqeProjectsTable.client), desc(bqeProjectsTable.pulledAt))
    .limit(50);
  res.json(rows);
});

export default router;