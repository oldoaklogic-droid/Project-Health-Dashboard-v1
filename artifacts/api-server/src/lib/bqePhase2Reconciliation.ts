import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import {
  bqeActivitiesTable,
  bqeFingerprintKeysTable,
  bqePhase2NonProjectBucketsTable,
  bqePhase2ProjectDispositionsTable,
  bqePhase2ReconciliationRunsTable,
  bqePhase2TypeSubtotalsTable,
  bqeProjectTypeMappingsTable,
  bqeProjectsTable,
  bqePullRunsTable,
  bqeReconciliationTable,
  bqeTimeEntriesTable,
  db,
} from "@workspace/db";
import { logger } from "./logger";

export const PHASE2_ANCHOR_HOURS = 16556.00;
export const FINGERPRINT_SEEDS = [
  "Short Plat",
  "Boundary Survey",
  "ALTA Survey",
  "Topographic Survey",
  "Subdivision",
  "Plat (general)",
  "Site Plan",
] as const;
export const NON_PROJECT_BUCKETS = ["Admin", "Overhead", "PTO", "Business Development", "Internal"] as const;
type Bucket = (typeof NON_PROJECT_BUCKETS)[number];

export type ClassifierProject = { id: string | null; code: string | null; name: string | null; type: string | null; status: string | null };
export type ClassifierEntry = { projectId: string | null; projectCode: string | null; activityId: string | null; activityCode: string | null; hours: number };
export type Mapping = { fingerprintKey: string; active: boolean };
export type Disposition = {
  projectId: string | null; projectCode: string | null; projectName: string | null; projectType: string | null;
  status: string | null; fingerprintKey: string | null; disposition: "cohort_a" | "cohort_b" | "excluded";
  failedRules: string[]; hours: number;
};

export function nonProjectBucket(code: string | null, name: string | null): Bucket | null {
  const value = `${code ?? ""} ${name ?? ""}`.toLowerCase();
  if (/\b(office|admin)\b/.test(value)) return "Admin";
  if (/\boverhead\b/.test(value)) return "Overhead";
  if (/\b(pto|paid time off|holiday|vacation|sick)\b/.test(value)) return "PTO";
  if (/\b(new clients?|business development|business dev|marketing|proposal|sales)\b/.test(value)) return "Business Development";
  if (/\b(internal|training|company meeting|it)\b/.test(value)) return "Internal";
  return null;
}

export function normalizedProjectStatus(status: string | null): "active" | "completed" | null {
  const value = status?.trim().toLowerCase();
  if (value === "0" || value === "active" || value === "open" || value === "in progress") return "active";
  if (value === "2" || value === "completed" || value === "complete" || value === "closed") return "completed";
  return null;
}

/** Pure project classifier; non-projects must be removed before calling it. */
export function classifyProjects(
  projects: ClassifierProject[],
  entries: ClassifierEntry[],
  mappings: Map<string, Mapping>,
  activityCodesById: Map<string, string> = new Map(),
): Disposition[] {
  const known = new Map(projects.filter((p) => p.id).map((p) => [p.id!, p]));
  const byCode = new Map(projects.filter((p) => p.code).map((p) => [p.code!, p]));
  const entryCount = new Map<ClassifierProject, number>();
  const hours = new Map<ClassifierProject, number>();
  const unresolvedActivity = new Set<ClassifierProject>();
  for (const entry of entries) {
    const project = (entry.projectId ? known.get(entry.projectId) : undefined) ?? (entry.projectCode ? byCode.get(entry.projectCode) : undefined);
    if (!project) continue;
    entryCount.set(project, (entryCount.get(project) ?? 0) + 1);
    hours.set(project, (hours.get(project) ?? 0) + entry.hours);
    if (!entry.activityCode && (!entry.activityId || !activityCodesById.get(entry.activityId))) unresolvedActivity.add(project);
  }
  return projects.map((project) => {
    const mapping = project.type === null ? undefined : mappings.get(project.type);
    const failedRules: string[] = [];
    if (!project.id || !entryCount.get(project)) failedRules.push("I-1");
    if (!mapping?.active) failedRules.push("I-2");
    if (unresolvedActivity.has(project)) failedRules.push("I-3");
    if (!normalizedProjectStatus(project.status)) failedRules.push("I-4");
    const disposition = failedRules.length
      ? "excluded"
      : normalizedProjectStatus(project.status) === "completed"
        ? "cohort_a"
        : "cohort_b";
    return { projectId: project.id, projectCode: project.code, projectName: project.name, projectType: project.type, status: project.status, fingerprintKey: mapping?.fingerprintKey ?? null, disposition, failedRules, hours: round(hours.get(project) ?? 0) };
  });
}

function round(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }
function numberOrZero(value: string | null): number { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function csvCell(value: unknown): string { const text = value === null || value === undefined ? "" : String(value); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text; }
export function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  return [headers.map(csvCell).join(","), ...rows.map((row) => headers.map((h) => csvCell(row[h])).join(","))].join("\r\n") + "\r\n";
}
export function reconciliationControls(values: {
  population: number; exclusions: number; nonProject: number; sourceHours: number;
  dispositionProjectCount: number; universeProjectCount: number; nonProjectProjectCount: number; typeSubtotalHours: number;
}): Record<string, number> {
  return {
    anchorDifference: round(values.population + values.exclusions + values.nonProject - PHASE2_ANCHOR_HOURS),
    populationDifference: round(values.population + values.exclusions + values.nonProject - values.sourceHours),
    projectCountDifference: values.universeProjectCount - values.dispositionProjectCount - values.nonProjectProjectCount,
    typeSubtotalDifference: round(values.typeSubtotalHours - values.population - values.exclusions),
  };
}

export async function ensureFingerprintSeeds(): Promise<void> {
  for (const key of FINGERPRINT_SEEDS) {
    await db.insert(bqeFingerprintKeysTable).values({
      key,
      label: key,
      active: true,
      sortOrder: FINGERPRINT_SEEDS.indexOf(key) + 1,
    }).onConflictDoNothing();
  }
}

export async function createPhase2Reconciliation(createdBy: string) {
  await ensureFingerprintSeeds();
  const runId = await db.transaction(async (tx) => {
  const source = (await tx.select().from(bqeReconciliationTable).orderBy(desc(bqeReconciliationTable.completedAt)).limit(1))[0];
  const latestPull = (await tx.select().from(bqePullRunsTable).orderBy(desc(bqePullRunsTable.startedAt)).limit(1))[0];
  if (!source || !source.asOfDate) throw new Error("No Phase 1 BQE reconciliation with an as-of date is available.");
  if (
    source.asOfDate !== "2026-08-30"
    || numberOrZero(source.total2026Hours) !== PHASE2_ANCHOR_HOURS
  ) {
    throw new Error("D-1 requires the Phase 1 control snapshot for 2026-08-30 with exactly 16,556.00 hours.");
  }
  if (!latestPull || latestPull.id !== source.pullRunId || latestPull.status !== "completed") {
    throw new Error("D-1 cannot run because the current PostgreSQL dataset is not the latest completed Phase 1 pull.");
  }
  const [projects, entries, activities, mappings] = await Promise.all([
    tx.select().from(bqeProjectsTable), tx.select().from(bqeTimeEntriesTable),
    tx.select().from(bqeActivitiesTable), tx.select({
      bqeProjectType: bqeProjectTypeMappingsTable.bqeProjectType,
      fingerprintKey: bqeProjectTypeMappingsTable.fingerprintKey,
      active: bqeProjectTypeMappingsTable.active,
    }).from(bqeProjectTypeMappingsTable),
  ]);
  const inRange = entries.filter((e) => e.entryDate !== null && e.entryDate >= "2026-01-01" && e.entryDate <= source.asOfDate!);
  const latestProjects = new Map<string, (typeof projects)[number]>();
  for (const project of projects) {
    const key = project.code ?? project.recordId;
    const existing = latestProjects.get(key);
    if (!existing || project.pulledAt > existing.pulledAt) latestProjects.set(key, project);
  }
  const allProjectRows: ClassifierProject[] = [...latestProjects.values()].map((p) => ({
    id: p.recordId, code: p.code, name: p.name, type: p.projectType, status: p.status,
  }));
  const allById = new Map(allProjectRows.filter((p) => p.id).map((p) => [p.id!, p]));
  const allByCode = new Map(allProjectRows.filter((p) => p.code).map((p) => [p.code!, p]));
  const projectRows: ClassifierProject[] = [];
  const seenProjects = new Set<ClassifierProject>();
  for (const entry of inRange) {
    const project = (entry.projectId ? allById.get(entry.projectId) : undefined)
      ?? (entry.projectCode ? allByCode.get(entry.projectCode) : undefined);
    if (project && !seenProjects.has(project)) {
      projectRows.push(project);
      seenProjects.add(project);
    } else if (!project) {
      const orphan = projectRows.find((p) => !p.id && p.code === entry.projectCode);
      if (!orphan) projectRows.push({ id: null, code: entry.projectCode, name: null, type: null, status: null });
    }
  }
  const activityCodes = new Map(activities.filter((a) => a.code).map((a) => [a.recordId, a.code!]));
  const map = new Map(mappings.map((m) => [m.bqeProjectType, { fingerprintKey: m.fingerprintKey, active: m.active }]));
  const entryRows = inRange.map((e) => ({ projectId: e.projectId, projectCode: e.projectCode, activityId: e.activityId, activityCode: e.activityCode, hours: numberOrZero(e.hours) }));
  const buckets = new Map<Bucket, { hours: number; projects: Set<string>; entryCount: number }>(
    NON_PROJECT_BUCKETS.map((b) => [b, { hours: 0, projects: new Set(), entryCount: 0 }]),
  );
  const projectById = new Map(projectRows.filter((p) => p.id).map((p) => [p.id!, p]));
  const projectByCode = new Map(projectRows.filter((p) => p.code).map((p) => [p.code!, p]));
  const projectEntries = entryRows.filter((e) => {
    const p = (e.projectId ? projectById.get(e.projectId) : undefined) ?? (e.projectCode ? projectByCode.get(e.projectCode) : undefined);
    const bucket = nonProjectBucket(p?.code ?? e.projectCode, p?.name ?? null);
    if (!bucket) return true;
    buckets.get(bucket)!.hours += e.hours;
    buckets.get(bucket)!.entryCount += 1;
    buckets.get(bucket)!.projects.add(p?.id ?? p?.code ?? e.projectId ?? e.projectCode ?? "unknown");
    return false;
  });
  const dispositions = classifyProjects(projectRows.filter((p) => !nonProjectBucket(p.code, p.name)), projectEntries, map, activityCodes);
  const population = round(dispositions.filter((d) => d.disposition !== "excluded").reduce((n, d) => n + d.hours, 0));
  const exclusions = round(dispositions.filter((d) => d.disposition === "excluded").reduce((n, d) => n + d.hours, 0));
  const nonProject = round([...buckets.values()].reduce((n, b) => n + b.hours, 0));
  const typeTotal = round([...dispositions].reduce((n, d) => n + d.hours, 0));
  const sourceHours = round(entryRows.reduce((n, e) => n + e.hours, 0));
  const controls = {
    ...reconciliationControls({ population, exclusions, nonProject, sourceHours, universeProjectCount: projectRows.length, dispositionProjectCount: dispositions.length, nonProjectProjectCount: [...buckets.values()].reduce((n, b) => n + b.projects.size, 0), typeSubtotalHours: typeTotal }),
    sourceHours, population, exclusions, nonProject,
  };
  const overallPass = Object.entries(controls).filter(([key]) => key.endsWith("Difference")).every(([, value]) => value === 0);
  const snapshotRunId = randomUUID();
    await tx.insert(bqePhase2ReconciliationRunsTable).values({ id: snapshotRunId, sourceReconciliationId: source.id, sourcePullRunId: source.pullRunId, asOfDate: source.asOfDate!, anchorHours: String(PHASE2_ANCHOR_HOURS), createdBy, overallPass, controls });
    if (dispositions.length) await tx.insert(bqePhase2ProjectDispositionsTable).values(dispositions.map((d) => ({ id: randomUUID(), runId: snapshotRunId, ...d, hours: String(d.hours) })));
    await tx.insert(bqePhase2NonProjectBucketsTable).values(NON_PROJECT_BUCKETS.map((bucket) => ({
      id: randomUUID(),
      runId: snapshotRunId,
      bucket,
      hours: String(round(buckets.get(bucket)!.hours)),
      projectCount: buckets.get(bucket)!.projects.size,
      entryCount: buckets.get(bucket)!.entryCount,
    })));
    const subtotals = new Map<string, { hours: number; count: number; fingerprint: string | null; mapped: boolean }>();
    for (const d of dispositions) { const key = d.projectType ?? "(unmapped)"; const old = subtotals.get(key) ?? { hours: 0, count: 0, fingerprint: d.fingerprintKey, mapped: !!map.get(key)?.active }; old.hours += d.hours; old.count += 1; subtotals.set(key, old); }
    if (subtotals.size) await tx.insert(bqePhase2TypeSubtotalsTable).values([...subtotals.entries()].map(([bqeProjectType, s]) => ({ id: randomUUID(), runId: snapshotRunId, bqeProjectType: bqeProjectType === "(unmapped)" ? null : bqeProjectType, fingerprintKey: s.fingerprint, mapped: s.mapped, hours: String(round(s.hours)), projectCount: s.count })));
  logger.info({ runId: snapshotRunId, overallPass, asOfDate: source.asOfDate }, "Phase 2 BQE reconciliation snapshot created");
  return snapshotRunId;
  }, { isolationLevel: "repeatable read" });
  return getPhase2Run(runId);
}

export async function getPhase2Run(runId: string) {
  const run = (await db.select().from(bqePhase2ReconciliationRunsTable).where(eq(bqePhase2ReconciliationRunsTable.id, runId)).limit(1))[0];
  if (!run) return null;
  const [dispositions, buckets, typeSubtotals] = await Promise.all([db.select().from(bqePhase2ProjectDispositionsTable).where(eq(bqePhase2ProjectDispositionsTable.runId, runId)), db.select().from(bqePhase2NonProjectBucketsTable).where(eq(bqePhase2NonProjectBucketsTable.runId, runId)), db.select().from(bqePhase2TypeSubtotalsTable).where(eq(bqePhase2TypeSubtotalsTable.runId, runId))]);
  const dispositionRows = dispositions.map((d) => ({ ...d, hours: numberOrZero(d.hours) }));
  const control = run.controls;
  const subtotalRows = typeSubtotals.map((s) => ({
    projectType: s.bqeProjectType,
    fingerprintKey: s.fingerprintKey,
    mapped: s.mapped,
    projectCount: s.projectCount,
    hours: numberOrZero(s.hours),
  })).sort((a, b) => b.hours - a.hours);
  const cohort = (name: "cohort_a" | "cohort_b") => {
    const rows = dispositionRows.filter((d) => d.disposition === name);
    return { count: rows.length, hours: round(rows.reduce((total, row) => total + row.hours, 0)) };
  };
  return {
    id: run.id,
    sourceReconciliationId: run.sourceReconciliationId,
    sourcePullRunId: run.sourcePullRunId,
    asOfDate: run.asOfDate,
    createdAt: run.createdAt.toISOString(),
    createdBy: run.createdBy,
    passed: run.overallPass,
    anchorHours: numberOrZero(run.anchorHours),
    accountedHours: round((control.population ?? 0) + (control.exclusions ?? 0) + (control.nonProject ?? 0)),
    differenceHours: control.anchorDifference ?? 0,
    populationProjectCount: dispositionRows.filter((d) => d.disposition !== "excluded").length,
    populationHours: control.population ?? 0,
    exclusionProjectCount: dispositionRows.filter((d) => d.disposition === "excluded").length,
    exclusionHours: control.exclusions ?? 0,
    projectCountExpected: dispositionRows.length + buckets.reduce((total, bucket) => total + bucket.projectCount, 0),
    projectCountAccounted: dispositionRows.length + buckets.reduce((total, bucket) => total + bucket.projectCount, 0) - (control.projectCountDifference ?? 0),
    projectCountDifference: control.projectCountDifference ?? 0,
    typeSubtotalDifference: control.typeSubtotalDifference ?? 0,
    sourceHours: control.sourceHours ?? 0,
    cohortA: cohort("cohort_a"),
    cohortB: cohort("cohort_b"),
    exclusions: dispositionRows.filter((d) => d.disposition === "excluded"),
    dispositions: dispositionRows,
    nonProjectBuckets: buckets.map((b) => ({ ...b, hours: numberOrZero(b.hours) })),
    typeSubtotals: subtotalRows,
    unmappedTypes: subtotalRows.filter((row) => !row.mapped).map((row) => ({
      projectType: row.projectType,
      projectCount: row.projectCount,
      hours: row.hours,
    })),
  };
}