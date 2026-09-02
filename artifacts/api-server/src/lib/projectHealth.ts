import { and, desc, eq, inArray } from "drizzle-orm";
import {
  bqeBudgetsSnapTable,
  bqeInvoicesSnapTable,
  bqeProjectsSnapTable,
  bqeSnapshotsTable,
  bqeTimeEntriesSnapTable,
  clientContactLogTable,
  db,
  healthRulesTable,
  internalClientsTable,
  pmNotesTable,
  projectHealthSnapshotTable,
  type HealthRule,
} from "@workspace/db";
import { logger } from "./logger";

export type HealthSeverity = "red" | "yellow" | "green" | "gray";
type RuleSeverity = Exclude<HealthSeverity, "green">;

export type ActivityMetric = {
  code: string;
  name: string;
  planned: number | null;
  actual: number;
  variance: number | null;
  variancePercent: number | null;
};

export type HealthMetrics = {
  contractAmount: number;
  actualHours: number;
  budgetHours: number | null;
  budgetBurn: number | null;
  percentComplete: number | null;
  invoicedAmount: number;
  feeRemaining: number;
  arTotal: number;
  arOver60: number;
  oldestPastDueDays: number | null;
  wipHours: number;
  wipEstimate: number;
  wipAgeDays: number | null;
  daysSinceLastTime: number | null;
  daysSinceLastInvoice: number | null;
  daysSinceLastPmNote: number | null;
  daysSinceLastContact: number | null;
  activities: ActivityMetric[];
};

export type HealthRuleResult = {
  id: string;
  name: string;
  severity: RuleSeverity;
  result: "triggered" | "clear" | "unknown";
};

const RULE_TYPES = new Set([
  "budget_burn",
  "activity_variance",
  "unbilled_age",
  "invoice_past_due",
  "pm_note_age",
  "client_contact_age",
  "fee_exhausted",
  "time_entry_age",
  "fee_remaining",
  "dual_inactivity",
]);

export function isValidHealthCondition(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const condition = value as Record<string, unknown>;
  const type = typeof condition.type === "string" ? condition.type : "";
  if (!RULE_TYPES.has(type)) return false;
  const numeric = (key: string) =>
    condition[key] === undefined || (typeof condition[key] === "number" && Number.isFinite(condition[key]));
  if (!["minExclusive", "minInclusive", "maxExclusive", "maxInclusive", "percentCompleteMaxExclusive", "independentMinExclusive"]
    .every(numeric)) return false;
  if (condition.requiresBudget !== undefined && typeof condition.requiresBudget !== "boolean") return false;
  if (condition.activeOnly !== undefined && typeof condition.activeOnly !== "boolean") return false;
  const hasMin = condition.minExclusive !== undefined || condition.minInclusive !== undefined;
  const hasMax = condition.maxExclusive !== undefined || condition.maxInclusive !== undefined;
  if (type === "fee_exhausted") return true;
  if (type === "fee_remaining") return hasMax;
  if (type === "budget_burn") return hasMin && typeof condition.percentCompleteMaxExclusive === "number";
  return hasMin;
}

export function isBqeProjectActive(status: string | null | undefined): boolean {
  return status === "0";
}

type SnapshotProject = typeof bqeProjectsSnapTable.$inferSelect;

/** The sole definition used for every portfolio count and AR calculation. */
export function activeExternalRoots(
  projects: SnapshotProject[],
  internalClients: Iterable<string>,
): SnapshotProject[] {
  const internal = new Set([...internalClients].map((client) => client.trim().toLowerCase()));
  return projects.filter((project) =>
    project.status === "0" &&
    !project.parentId &&
    !project.rootProjectId &&
    Boolean(project.code) &&
    !project.code!.trim().toUpperCase().startsWith("TEST") &&
    !internal.has(project.client?.trim().toLowerCase() ?? ""),
  );
}

export type PortfolioProject = {
  id: string;
  number: string;
  name: string;
  client: string;
  pm: string;
  fee: number;
  noContractAmountOnFile: boolean;
  closeoutCandidate: boolean;
  portfolioAr: number;
  computedSeverity: HealthSeverity;
  severity: HealthSeverity;
  triggeredRules: HealthRuleResult[];
  unknownRules: HealthRuleResult[];
  override: null | { severity: HealthSeverity; reason: string; by: string };
  riskLine: string;
  actionLine: string;
  percentComplete: number | null;
  daysSinceLastPmNote: number | null;
  metrics: HealthMetrics;
};

type EvaluationInput = Omit<HealthMetrics, "activities"> & {
  activities: ActivityMetric[];
  active?: boolean;
};

export type PortfolioArSnapshot = {
  total: number;
  over60: number;
  dataAsOf: string;
  activeExternalRootCount: number;
};

const RULE_TYPES_WITHOUT_PROGRESS = new Set([
  "unbilled_age",
  "invoice_past_due",
  "pm_note_age",
  "client_contact_age",
  "fee_exhausted",
  "time_entry_age",
  "dual_inactivity",
]);
const MS_PER_DAY = 86_400_000;
const WIP_RATE = 220;

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function daysBetween(asOf: string, date: string | null | undefined): number | null {
  if (!date) return null;
  const then = new Date(`${date.slice(0, 10)}T00:00:00Z`).getTime();
  const now = new Date(`${asOf}T00:00:00Z`).getTime();
  return Number.isFinite(then) ? Math.max(0, Math.floor((now - then) / MS_PER_DAY)) : null;
}

/** Snapshot labels are the business checkpoint; captured_at is the safe fallback. */
export function snapshotAsOf(label: string, capturedAt: Date): string {
  if (/aug(?:ust)?\s*30\b/i.test(label)) return "2026-08-30";
  if (/sep(?:tember)?\s*1\b/i.test(label)) return "2026-09-01";
  return capturedAt.toISOString().slice(0, 10);
}

function inRange(value: number | null, condition: Record<string, unknown>): boolean {
  if (value === null) return false;
  if (condition.minExclusive != null && !(value > numberValue(condition.minExclusive))) return false;
  if (condition.minInclusive != null && !(value >= numberValue(condition.minInclusive))) return false;
  if (condition.maxExclusive != null && !(value < numberValue(condition.maxExclusive))) return false;
  if (condition.maxInclusive != null && !(value <= numberValue(condition.maxInclusive))) return false;
  return true;
}

export function evaluateHealth(
  metrics: EvaluationInput,
  rules: Pick<HealthRule, "id" | "name" | "severity" | "condition" | "active">[],
): { severity: HealthSeverity; results: HealthRuleResult[] } {
  const results = rules.filter((rule) => rule.active).map((rule): HealthRuleResult => {
    const condition = rule.condition;
    const type = String(condition.type ?? "");
    const budgetRequired = condition.requiresBudget === true;
    if (budgetRequired && metrics.budgetHours === null) {
      return { id: rule.id, name: rule.name, severity: rule.severity as RuleSeverity, result: "unknown" };
    }
    if (condition.activeOnly === true && metrics.active === false) {
      return { id: rule.id, name: rule.name, severity: rule.severity as RuleSeverity, result: "clear" };
    }
    if (type === "fee_exhausted" && metrics.contractAmount <= 0) {
      return { id: rule.id, name: rule.name, severity: rule.severity as RuleSeverity, result: "unknown" };
    }
    if (type === "budget_burn") {
      const independentMin = typeof condition.independentMinExclusive === "number"
        ? condition.independentMinExclusive
        : rule.severity === "red" ? 1 : null;
      if (independentMin !== null && metrics.budgetBurn !== null && metrics.budgetBurn > independentMin) {
        return { id: rule.id, name: rule.name, severity: rule.severity as RuleSeverity, result: "triggered" };
      }
      if (metrics.percentComplete === null) {
        return { id: rule.id, name: rule.name, severity: rule.severity as RuleSeverity, result: "unknown" };
      }
    }
    if (metrics.percentComplete === null && !RULE_TYPES_WITHOUT_PROGRESS.has(type)) {
      return { id: rule.id, name: rule.name, severity: rule.severity as RuleSeverity, result: "unknown" };
    }
    const missingHistory =
      (type === "pm_note_age" && metrics.daysSinceLastPmNote === null) ||
      (type === "client_contact_age" && metrics.daysSinceLastContact === null) ||
      (type === "time_entry_age" && metrics.daysSinceLastTime === null) ||
      (type === "dual_inactivity" &&
        (metrics.daysSinceLastTime === null || metrics.daysSinceLastInvoice === null));
    if (missingHistory) {
      return { id: rule.id, name: rule.name, severity: rule.severity as RuleSeverity, result: "unknown" };
    }

    let triggered = false;
    switch (type) {
      case "budget_burn":
        triggered = metrics.percentComplete !== null &&
          metrics.percentComplete < numberValue(condition.percentCompleteMaxExclusive) &&
          inRange(metrics.budgetBurn, condition);
        break;
      case "activity_variance":
        triggered = metrics.activities.some((activity) =>
          activity.planned !== null && activity.planned > 0 && inRange(activity.variancePercent, condition));
        break;
      case "unbilled_age":
        triggered = metrics.wipHours > 0 && inRange(metrics.wipAgeDays, condition);
        break;
      case "invoice_past_due":
        triggered = metrics.arTotal > 0 && inRange(metrics.oldestPastDueDays, condition);
        break;
      case "pm_note_age":
        triggered = metrics.daysSinceLastPmNote !== null && inRange(metrics.daysSinceLastPmNote, condition);
        break;
      case "client_contact_age":
        triggered = metrics.daysSinceLastContact !== null && inRange(metrics.daysSinceLastContact, condition);
        break;
      case "fee_exhausted":
        triggered = metrics.contractAmount > 0 &&
          metrics.invoicedAmount >= metrics.contractAmount &&
          ((metrics.daysSinceLastTime !== null && metrics.daysSinceLastTime <= 30) ||
            (metrics.percentComplete !== null && metrics.percentComplete < 100));
        break;
      case "time_entry_age":
        triggered = metrics.daysSinceLastTime !== null && inRange(metrics.daysSinceLastTime, condition);
        break;
      case "fee_remaining":
        triggered = metrics.contractAmount > 0 && metrics.feeRemaining >= 0 &&
          inRange(metrics.feeRemaining, condition);
        break;
      case "dual_inactivity":
        triggered = metrics.daysSinceLastTime !== null &&
          metrics.daysSinceLastInvoice !== null &&
          inRange(metrics.daysSinceLastTime, condition) &&
          inRange(metrics.daysSinceLastInvoice, condition);
        break;
    }
    return {
      id: rule.id,
      name: rule.name,
      severity: rule.severity as RuleSeverity,
      result: triggered ? "triggered" : "clear",
    };
  });

  const has = (severity: RuleSeverity) =>
    results.some((result) => result.result === "triggered" && result.severity === severity);
  return {
    severity: has("red") ? "red" : has("yellow") ? "yellow" : has("gray") ? "gray" : "green",
    results,
  };
}

function asArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  for (const key of ["lineItems", "budgetItems", "items", "details"]) {
    const nested = asArray(record[key]);
    if (nested.length) return nested;
  }
  return Object.values(record).flatMap(asArray);
}

function itemCode(item: Record<string, unknown>): string {
  const raw = String(item.item ?? item.activity ?? item.code ?? item.itemId ?? "Unspecified");
  return raw.split(":")[0]?.trim() || "Unspecified";
}

function invoiceDueDate(invoice: typeof bqeInvoicesSnapTable.$inferSelect): string | null {
  if (!invoice.invoiceDate) return null;
  const raw = invoice.rawJson as Record<string, unknown> | null;
  const details = asArray(raw?.invoiceDetails);
  const term = String(details[0]?.term ?? "");
  const netDays = Number(term.match(/Net\s*(\d+)/i)?.[1] ?? 0);
  const due = new Date(`${invoice.invoiceDate}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + (Number.isFinite(netDays) ? netDays : 0));
  return due.toISOString().slice(0, 10);
}

type LoadedData = {
  asOf: string;
  portfolioAr: PortfolioArSnapshot;
  snapshot: { id: string; label: string; capturedAt: string };
  comparison: { label: string; capturedAt: string; activeExternalRootCountDelta: number; arTotalDelta: number; arOver60Delta: number } | null;
  excludedInternalClients: Array<{ client: string; projectCount: number }>;
  projects: PortfolioProject[];
  phaseByProject: Map<string, Array<{
    id: string;
    code: string;
    name: string;
    planned: number | null;
    actual: number;
    variance: number | null;
    variancePercent: number | null;
    activities: ActivityMetric[];
  }>>;
  detailByProject: Map<string, {
    timeEntries: unknown[];
    invoices: unknown[];
    contacts: unknown[];
    pmNote: unknown | null;
  }>;
};

let portfolioCache: { expires: number; promise: Promise<LoadedData> } | null = null;

export function calculatePortfolioAr(
  asOf: string,
  completedAt: Date | null,
  projects: SnapshotProject[],
  invoices: typeof bqeInvoicesSnapTable.$inferSelect[],
  internalClients: Iterable<string>,
): PortfolioArSnapshot {
  const projectById = new Map(projects.map((project) => [project.recordId, project]));
  const projectByCode = new Map(projects.flatMap((project) =>
    project.code ? [[project.code, project] as const] : []));
  const eligibleRootIds = new Set(activeExternalRoots(projects, internalClients).map((project) => project.recordId));

  let total = 0;
  let over60 = 0;
  for (const invoice of invoices) {
    if (invoice.void || invoice.draft || invoice.invoiceType === 39 || numberValue(invoice.balance) <= 0) continue;
    if (invoice.invoiceDate && invoice.invoiceDate > asOf) continue;
    const project = (invoice.projectId ? projectById.get(invoice.projectId) : undefined) ??
      (invoice.projectCode ? projectByCode.get(invoice.projectCode) : undefined);
    if (!project) continue;
    const rootId = project.rootProjectId || project.parentId || project.recordId;
    if (!eligibleRootIds.has(rootId)) continue;
    const balance = numberValue(invoice.balance);
    total += balance;
    if ((daysBetween(asOf, invoiceDueDate(invoice)) ?? 0) > 60) over60 += balance;
  }

  return {
    total: Math.round(total * 100) / 100,
    over60: Math.round(over60 * 100) / 100,
    dataAsOf: completedAt?.toISOString() ?? `${asOf}T00:00:00.000Z`,
    activeExternalRootCount: eligibleRootIds.size,
  };
}

async function loadPortfolioData(force = false): Promise<LoadedData> {
  if (!force && portfolioCache && portfolioCache.expires > Date.now()) return portfolioCache.promise;
  const promise = (async (): Promise<LoadedData> => {
    const [allSnapshots, internalClients, notes, contacts, rules, snapshots] =
      await Promise.all([
        db.select().from(bqeSnapshotsTable).orderBy(desc(bqeSnapshotsTable.capturedAt)),
        db.select().from(internalClientsTable).where(eq(internalClientsTable.active, true)),
        db.select().from(pmNotesTable).orderBy(desc(pmNotesTable.asOf)),
        db.select().from(clientContactLogTable).orderBy(desc(clientContactLogTable.contactDate)),
        db.select().from(healthRulesTable).orderBy(healthRulesTable.sortOrder),
        db.select().from(projectHealthSnapshotTable),
      ]);
    const selectedSnapshot = allSnapshots.find((snapshot) => /sep(?:tember)?\s*1\b/i.test(snapshot.label))
      ?? allSnapshots[0];
    if (!selectedSnapshot) throw new Error("No BQE snapshot is available for project health.");
    const comparisonSnapshot = allSnapshots.find((snapshot) => /aug(?:ust)?\s*30\b/i.test(snapshot.label)) ?? null;
    const [bqeProjects, time, budgets, invoices, comparisonProjects, comparisonInvoices] = await Promise.all([
      db.select().from(bqeProjectsSnapTable).where(eq(bqeProjectsSnapTable.snapshotId, selectedSnapshot.id)),
      db.select().from(bqeTimeEntriesSnapTable).where(eq(bqeTimeEntriesSnapTable.snapshotId, selectedSnapshot.id)),
      db.select().from(bqeBudgetsSnapTable).where(eq(bqeBudgetsSnapTable.snapshotId, selectedSnapshot.id)),
      db.select().from(bqeInvoicesSnapTable).where(eq(bqeInvoicesSnapTable.snapshotId, selectedSnapshot.id)),
      comparisonSnapshot ? db.select().from(bqeProjectsSnapTable).where(eq(bqeProjectsSnapTable.snapshotId, comparisonSnapshot.id)) : Promise.resolve([]),
      comparisonSnapshot ? db.select().from(bqeInvoicesSnapTable).where(eq(bqeInvoicesSnapTable.snapshotId, comparisonSnapshot.id)) : Promise.resolve([]),
    ]);
    const asOf = snapshotAsOf(selectedSnapshot.label, selectedSnapshot.capturedAt);
    const internalClientNames = internalClients.map((row) => row.client);
    const portfolioAr = calculatePortfolioAr(
      asOf,
      selectedSnapshot.capturedAt,
      bqeProjects,
      invoices,
      internalClientNames,
    );
    const comparisonAr = comparisonSnapshot
      ? calculatePortfolioAr(snapshotAsOf(comparisonSnapshot.label, comparisonSnapshot.capturedAt), comparisonSnapshot.capturedAt, comparisonProjects, comparisonInvoices, internalClientNames)
      : null;
    const childrenByRoot = new Map<string, typeof bqeProjects>();
    for (const project of bqeProjects) {
      const rootId = project.rootProjectId || project.parentId || project.recordId;
      childrenByRoot.set(rootId, [...(childrenByRoot.get(rootId) ?? []), project]);
    }
    const latestNote = new Map<string, typeof notes[number]>();
    for (const note of notes) if (!latestNote.has(note.projectId)) latestNote.set(note.projectId, note);
    const latestPercentComplete = new Map<string, number>();
    for (const note of notes) {
      if (!latestPercentComplete.has(note.projectId) && note.percentComplete !== null) {
        latestPercentComplete.set(note.projectId, numberValue(note.percentComplete));
      }
    }
    const latestContact = new Map<string, typeof contacts[number]>();
    for (const contact of contacts) if (!latestContact.has(contact.projectId)) latestContact.set(contact.projectId, contact);
    const snapshotByProject = new Map(snapshots.filter((row) => row.asOf === asOf).map((row) => [row.projectId, row]));
    const phaseByProject = new Map<string, LoadedData["phaseByProject"] extends Map<string, infer T> ? T : never>();
    const detailByProject = new Map<string, LoadedData["detailByProject"] extends Map<string, infer T> ? T : never>();

    const output: PortfolioProject[] = [];
    for (const bqeRoot of activeExternalRoots(bqeProjects, internalClientNames)) {
      const id = bqeRoot.recordId;
      const members = childrenByRoot.get(bqeRoot.recordId) ?? [bqeRoot];
      const memberIds = new Set(members.map((row) => row.recordId));
      const memberCodes = new Set(members.flatMap((row) => row.code ? [row.code] : []));
      const belongs = (projectId: string | null, projectCode: string | null) =>
        Boolean((projectId && memberIds.has(projectId)) || (projectCode && memberCodes.has(projectCode)));
      const rootTime = time.filter((row) => belongs(row.projectId, row.projectCode) && (!row.entryDate || row.entryDate <= asOf));
      const rootBudgets = budgets.filter((row) => belongs(row.projectId, row.projectCode));
      const rootInvoices = invoices.filter((row) => belongs(row.projectId, row.projectCode) &&
        (!row.invoiceDate || row.invoiceDate <= asOf) && !row.void && !row.draft && row.invoiceType !== 39);
      const openInvoices = rootInvoices.filter((row) => numberValue(row.balance) > 0);
      const invoiceDates = rootInvoices.flatMap((row) => row.invoiceDate ? [row.invoiceDate] : []);
      const latestInvoiceDate = invoiceDates.sort().at(-1) ?? null;
      const billableTime = rootTime.filter((row) => row.billable !== false);
      const unbilledTime = billableTime.filter((row) => row.entryDate && (!latestInvoiceDate || row.entryDate > latestInvoiceDate));
      const actualHours = rootTime.reduce((sum, row) => sum + numberValue(row.hours), 0);
      const budgetHoursValue = rootBudgets.reduce((sum, row) => sum + numberValue(row.totalHours), 0);
      const budgetHours = rootBudgets.length && budgetHoursValue > 0 ? budgetHoursValue : null;
      const contractAmount = numberValue(bqeRoot.contractAmount);
      const invoicedAmount = rootInvoices.reduce((sum, row) => sum + numberValue(row.amount), 0);
      const note = latestNote.get(id);
      const contact = latestContact.get(id);

      const plannedByActivity = new Map<string, { name: string; hours: number }>();
      for (const budget of rootBudgets) {
        for (const item of asArray(budget.lineItems)) {
          const code = itemCode(item);
          const current = plannedByActivity.get(code) ?? { name: String(item.description ?? item.item ?? code), hours: 0 };
          current.hours += numberValue(item.hours);
          plannedByActivity.set(code, current);
        }
      }
      const actualByActivity = new Map<string, { name: string; hours: number }>();
      for (const entry of rootTime) {
        const code = entry.activityCode || entry.activityId || "Unspecified";
        const current = actualByActivity.get(code) ?? { name: entry.activityCode || code, hours: 0 };
        current.hours += numberValue(entry.hours);
        actualByActivity.set(code, current);
      }
      const activityCodes = new Set([...plannedByActivity.keys(), ...actualByActivity.keys()]);
      const activities = [...activityCodes].map((code): ActivityMetric => {
        const planned = plannedByActivity.has(code) ? plannedByActivity.get(code)!.hours : null;
        const actual = actualByActivity.get(code)?.hours ?? 0;
        const variance = planned === null ? null : actual - planned;
        return {
          code,
          name: plannedByActivity.get(code)?.name ?? actualByActivity.get(code)?.name ?? code,
          planned,
          actual,
          variance,
          variancePercent: planned && planned > 0 ? variance! / planned : null,
        };
      }).sort((a, b) => (b.variancePercent ?? -Infinity) - (a.variancePercent ?? -Infinity));

      const earliestWipDate = unbilledTime.flatMap((row) => row.entryDate ? [row.entryDate] : []).sort()[0] ?? null;
      const oldestDue = openInvoices.reduce<number | null>((max, invoice) => {
        const days = daysBetween(asOf, invoiceDueDate(invoice));
        return days === null ? max : Math.max(max ?? 0, days);
      }, null);
      const arOver60 = openInvoices.reduce((sum, invoice) =>
        (daysBetween(asOf, invoiceDueDate(invoice)) ?? 0) > 60 ? sum + numberValue(invoice.balance) : sum, 0);
      const percentComplete = latestPercentComplete.get(id) ?? null;
      const reconciledAr = openInvoices.reduce((sum, row) => sum + numberValue(row.balance), 0);
      const arTotal = reconciledAr;
      const metrics: HealthMetrics = {
        contractAmount,
        actualHours,
        budgetHours,
        budgetBurn: budgetHours === null ? null : actualHours / budgetHours,
        percentComplete,
        invoicedAmount,
        feeRemaining: contractAmount - invoicedAmount,
        arTotal,
        arOver60,
        oldestPastDueDays: oldestDue,
        wipHours: unbilledTime.reduce((sum, row) => sum + numberValue(row.hours), 0),
        wipEstimate: unbilledTime.reduce((sum, row) => sum + numberValue(row.hours), 0) * WIP_RATE,
        wipAgeDays: daysBetween(asOf, earliestWipDate),
        daysSinceLastTime: daysBetween(asOf, rootTime.flatMap((row) => row.entryDate ? [row.entryDate] : []).sort().at(-1)),
        daysSinceLastInvoice: daysBetween(asOf, latestInvoiceDate),
        daysSinceLastPmNote: daysBetween(asOf, note?.asOf),
        daysSinceLastContact: daysBetween(asOf, contact?.contactDate),
        activities,
      };
      const closeoutCandidate = contractAmount > 0 &&
        invoicedAmount >= contractAmount &&
        !(metrics.daysSinceLastTime !== null && metrics.daysSinceLastTime <= 30) &&
        !(percentComplete !== null && percentComplete < 100);
      const evaluation = evaluateHealth({
        ...metrics,
        active: isBqeProjectActive(bqeRoot.status),
      }, rules);
      const snapshot = snapshotByProject.get(id);
      const triggeredRules = evaluation.results.filter((result) => result.result === "triggered");
      const unknownRules = evaluation.results.filter((result) => result.result === "unknown");
      output.push({
        id,
        number: bqeRoot.code ?? bqeRoot.recordId,
        name: bqeRoot.name ?? bqeRoot.code ?? bqeRoot.recordId,
        client: bqeRoot.client ?? "",
        pm: bqeRoot.manager ?? "",
        fee: contractAmount,
        noContractAmountOnFile: contractAmount <= 0,
        closeoutCandidate,
        portfolioAr: arTotal,
        computedSeverity: evaluation.severity,
        severity: (snapshot?.overrideSeverity as HealthSeverity | null) ?? evaluation.severity,
        triggeredRules,
        unknownRules,
        override: snapshot?.overrideSeverity && snapshot.overrideReason && snapshot.overrideBy ? {
          severity: snapshot.overrideSeverity as HealthSeverity,
          reason: snapshot.overrideReason,
          by: snapshot.overrideBy,
        } : null,
        riskLine: note?.riskLine ?? "",
        actionLine: note?.actionLine ?? "",
        percentComplete,
        daysSinceLastPmNote: metrics.daysSinceLastPmNote,
        metrics,
      });

      const phases = members.map((member) => {
        const phaseTime = rootTime.filter((row) => row.projectId === member.recordId || row.projectCode === member.code);
        const phaseBudgets = rootBudgets.filter((row) => row.projectId === member.recordId || row.projectCode === member.code);
        const phasePlanned = phaseBudgets.reduce((sum, row) => sum + numberValue(row.totalHours), 0);
        const phaseActual = phaseTime.reduce((sum, row) => sum + numberValue(row.hours), 0);
        const planned = phaseBudgets.length && phasePlanned > 0 ? phasePlanned : null;
        const phaseActivityCodes = new Set([
          ...phaseTime.map((row) => row.activityCode || row.activityId || "Unspecified"),
          ...phaseBudgets.flatMap((budget) => asArray(budget.lineItems).map(itemCode)),
        ]);
        const phaseActivities = activities.filter((activity) => phaseActivityCodes.has(activity.code));
        return {
          id: member.recordId,
          code: member.code ?? member.recordId,
          name: member.name ?? member.code ?? "Phase",
          planned,
          actual: phaseActual,
          variance: planned === null ? null : phaseActual - planned,
          variancePercent: planned && planned > 0 ? (phaseActual - planned) / planned : null,
          activities: phaseActivities,
        };
      }).sort((a, b) => (b.variancePercent ?? -Infinity) - (a.variancePercent ?? -Infinity));
      phaseByProject.set(id, phases);
      detailByProject.set(id, {
        timeEntries: rootTime.filter((row) => (daysBetween(asOf, row.entryDate) ?? Infinity) <= 28)
          .sort((a, b) => String(b.entryDate).localeCompare(String(a.entryDate))),
        invoices: rootInvoices.sort((a, b) => String(b.invoiceDate).localeCompare(String(a.invoiceDate))).map((row) => ({
          id: row.recordId,
          number: row.invoiceNumber,
          date: row.invoiceDate,
          dueDate: invoiceDueDate(row),
          amount: numberValue(row.amount),
          balance: numberValue(row.balance),
          pastDueDays: daysBetween(asOf, invoiceDueDate(row)),
        })),
        contacts: contacts.filter((row) => row.projectId === id),
        pmNote: note ?? null,
      });
    }
    const internalSet = new Set(internalClientNames.map((client) => client.trim().toLowerCase()));
    const excludedInternalClients = [...internalSet].map((normalized) => ({
      client: internalClients.find((row) => row.client.trim().toLowerCase() === normalized)?.client ?? normalized,
      projectCount: bqeProjects.filter((project) => project.status === "0" && !project.parentId && !project.rootProjectId &&
        project.client?.trim().toLowerCase() === normalized).length,
    }));
    return {
      asOf, portfolioAr, projects: output, phaseByProject, detailByProject, excludedInternalClients,
      snapshot: { id: selectedSnapshot.id, label: selectedSnapshot.label, capturedAt: selectedSnapshot.capturedAt.toISOString() },
      comparison: comparisonSnapshot && comparisonAr ? {
        label: comparisonSnapshot.label, capturedAt: comparisonSnapshot.capturedAt.toISOString(),
        activeExternalRootCountDelta: portfolioAr.activeExternalRootCount - comparisonAr.activeExternalRootCount,
        arTotalDelta: portfolioAr.total - comparisonAr.total,
        arOver60Delta: portfolioAr.over60 - comparisonAr.over60,
      } : null,
    };
  })();
  portfolioCache = { expires: Date.now() + 60_000, promise };
  return promise;
}

export async function computePortfolio(force = false): Promise<LoadedData> {
  return loadPortfolioData(force);
}

export function invalidatePortfolioCache(): void {
  portfolioCache = null;
}

export async function resolvePortfolioProjectId(input: string): Promise<string | null> {
  const project = (await loadPortfolioData()).projects
    .find((row) => row.id === input || row.number === input);
  return project?.id ?? null;
}

export async function refreshAllHealthSnapshots(): Promise<number> {
  const data = await loadPortfolioData(true);
  for (const project of data.projects) {
    await db.insert(projectHealthSnapshotTable).values({
      projectId: project.id,
      asOf: data.asOf,
      severity: project.computedSeverity,
      triggeredRules: project.triggeredRules,
    }).onConflictDoUpdate({
      target: [projectHealthSnapshotTable.projectId, projectHealthSnapshotTable.asOf],
      set: {
        severity: project.computedSeverity,
        triggeredRules: project.triggeredRules,
      },
    });
  }
  portfolioCache = null;
  logger.info({ projectCount: data.projects.length, asOf: data.asOf }, "Project health snapshots refreshed");
  return data.projects.length;
}

export async function setHealthOverride(
  projectId: string,
  severity: HealthSeverity,
  reason: string,
  userId: string,
) {
  const data = await loadPortfolioData();
  const project = data.projects.find((row) => row.id === projectId || row.number === projectId);
  if (!project) return null;
  const [snapshot] = await db.insert(projectHealthSnapshotTable).values({
    projectId: project.id,
    asOf: data.asOf,
    severity: project.computedSeverity,
    triggeredRules: project.triggeredRules,
    overrideSeverity: severity,
    overrideReason: reason,
    overrideBy: userId,
  }).onConflictDoUpdate({
    target: [projectHealthSnapshotTable.projectId, projectHealthSnapshotTable.asOf],
    set: { overrideSeverity: severity, overrideReason: reason, overrideBy: userId },
  }).returning();
  portfolioCache = null;
  return snapshot ?? null;
}

let nightlyTimer: NodeJS.Timeout | undefined;
export function startNightlyHealthRefresh(): void {
  if (nightlyTimer) return;
  const schedule = () => {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(2, 0, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    nightlyTimer = setTimeout(async () => {
      try {
        await refreshAllHealthSnapshots();
      } catch (error) {
        logger.error({ error }, "Nightly project health refresh failed");
      }
      schedule();
    }, next.getTime() - now.getTime());
    nightlyTimer.unref();
  };
  schedule();
}

export function inferDiscipline(activityCode: string | null): string {
  const prefix = activityCode?.trim().charAt(0).toUpperCase();
  return prefix === "S" ? "Survey" : prefix === "E" ? "Engineering" : prefix === "A" ? "Architecture" : "General";
}