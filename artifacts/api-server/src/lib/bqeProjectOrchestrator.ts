import { and, eq } from "drizzle-orm";
import { db, uuidCacheTable, type Intake, type LocalProject } from "@workspace/db";
import { getBqeAccessToken, type BqeAccessToken } from "./bqe";
import { logger } from "./logger";
import type { EstimateResult } from "./estimating";

type Json = Record<string, unknown>;
type EntityType = "client" | "employee" | "activity" | "employeeGroup";
type CreatedObject = { kind: string; id: string; targetProjectId?: string };

export const BQE_ENTITY_LOOKUPS: Record<
  EntityType,
  { path: string; field: string }
> = {
  client: { path: "client", field: "name" },
  employee: { path: "employee", field: "displayName" },
  activity: { path: "activity", field: "code" },
  employeeGroup: { path: "group", field: "name" },
};

/**
 * Canonical estimator codes are stable historical labels. The live BQE
 * activity catalog uses the V-series for the corresponding survey work.
 */
export const BQE_ACTIVITY_CODE_MAP: Readonly<Record<string, string>> = {
  "S-105": "V-100",
  "S-106": "V-259",
  "S-104": "V-540",
  "S-201": "V-505",
  "S-301": "V-811",
  "S-400": "V-302",
  "S-302": "V-880",
  "S-502": "V-326",
  "S-510": "V-550",
  "S-513": "V-329",
  "S-616": "V-167",
  "S-617": "V-211",
  "S-613": "V-621",
  "S-605": "V-200",
  "S-604": "V-220",
  "S-503": "V-327",
  "S-506": "V-328",
};

export const bqeActivityCode = (canonicalCode: string): string =>
  BQE_ACTIVITY_CODE_MAP[canonicalCode] ?? canonicalCode;

export type BqeProjectOrchestrationInput = {
  intake: Intake;
  localProject: LocalProject;
  estimate: EstimateResult;
  /** No mutation is sent to BQE when true. */
  dryRun?: boolean;
  /**
   * Optional explicit resource group.  If omitted, answers.employeeGroup is
   * used when it is a string.
   */
  employeeGroupName?: string;
};

export type BqeProjectOrchestrationResult = {
  status: "completed" | "dry-run" | "partial";
  created: CreatedObject[];
  payloads: Array<{ kind: string; endpoint: string; payload: Json }>;
  projectIds: { parent: string | null; children: Record<string, string> };
  warnings?: string[];
  error?: { message: string; failedKind: string };
};

export type BqeProjectOrchestrationDependencies = {
  getAccessToken?: () => Promise<BqeAccessToken>;
  resolveUuid?: (
    connection: BqeAccessToken,
    entityType: EntityType,
    humanKey: string,
  ) => Promise<string>;
  request?: (
    connection: BqeAccessToken,
    path: string,
    method: "GET" | "POST",
    payload?: Json,
  ) => Promise<unknown>;
};

export type BqeActivityReadinessResult = {
  ready: boolean;
  resolved: Array<{ canonicalCode: string; liveCode: string; id: string }>;
  unresolved: Array<{ canonicalCode: string; liveCode: string; message: string }>;
};

export class BqeProjectOrchestrationError extends Error {
  readonly result: BqeProjectOrchestrationResult;

  constructor(result: BqeProjectOrchestrationResult) {
    super(result.error?.message ?? "BQE project orchestration failed.");
    this.name = "BqeProjectOrchestrationError";
    this.result = result;
  }
}

const ACTIVE_RULE_CODES = new Set([3, 4, 5, 8, 11, 12, 13, 16, 17, 22]);
const RESOURCE_TYPE_EMPLOYEE = 1;

const asRecord = (value: unknown): Json =>
  typeof value === "object" && value !== null ? value as Json : {};
const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const numeric = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && Number.isFinite(Number(value))
      ? Number(value)
      : fallback;
const idOf = (value: unknown): string | null => {
  const row = asRecord(value);
  return text(row.id) ?? text(row.uuid) ?? text(row.projectId);
};

function endpoint(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function records(value: unknown): Json[] {
  if (Array.isArray(value)) return value.map(asRecord);
  const row = asRecord(value);
  for (const key of ["data", "items", "results", "value"]) {
    if (Array.isArray(row[key])) return (row[key] as unknown[]).map(asRecord);
  }
  return Object.keys(row).length ? [row] : [];
}

async function bqeRequest(
  connection: BqeAccessToken,
  path: string,
  method: "GET" | "POST",
  payload?: Json,
): Promise<unknown> {
  const response = await fetch(endpoint(connection.apiBase, path), {
    method,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${connection.accessToken}`,
      ...(payload ? { "content-type": "application/json" } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const body = await response.text();
  let parsed: unknown = null;
  try { parsed = body ? JSON.parse(body) : null; } catch { parsed = body; }
  if (!response.ok) {
    throw new Error(`BQE ${method} ${path} failed with HTTP ${response.status}: ${body.slice(0, 500)}`);
  }
  return parsed;
}

function escapedWhere(value: string): string {
  return value.replace(/'/g, "''");
}

async function resolveUuid(
  connection: BqeAccessToken,
  entityType: EntityType,
  humanKey: string,
): Promise<string> {
  const [cached] = await db.select().from(uuidCacheTable).where(and(
    eq(uuidCacheTable.entityType, entityType),
    eq(uuidCacheTable.humanKey, humanKey),
  )).limit(1);
  if (cached) return cached.bqeUuid;

  const item = BQE_ENTITY_LOOKUPS[entityType];
  const url = new URL(endpoint(connection.apiBase, item.path));
  url.searchParams.set("where", `${item.field}='${escapedWhere(humanKey)}'`);
  const response = await fetch(url, {
    headers: { accept: "application/json", authorization: `Bearer ${connection.accessToken}` },
  });
  const body = await response.text();
  let parsed: unknown = null;
  try { parsed = body ? JSON.parse(body) : null; } catch { /* handled below */ }
  if (!response.ok) throw new Error(`BQE could not resolve ${entityType} "${humanKey}" (HTTP ${response.status}).`);
  const matches = records(parsed);
  if (matches.length !== 1 || !idOf(matches[0])) {
    throw new Error(`BQE ${entityType} lookup for "${humanKey}" returned ${matches.length} matches; exactly one is required.`);
  }
  const bqeUuid = idOf(matches[0])!;
  await db.insert(uuidCacheTable).values({ entityType, humanKey, bqeUuid })
    .onConflictDoUpdate({
      target: [uuidCacheTable.entityType, uuidCacheTable.humanKey],
      set: { bqeUuid, resolvedAt: new Date() },
    });
  return bqeUuid;
}

export async function checkBqeActivityReadiness(
  estimates: readonly EstimateResult[],
  dependencies: Pick<BqeProjectOrchestrationDependencies, "getAccessToken" | "resolveUuid"> = {},
): Promise<BqeActivityReadinessResult> {
  const connection = await (dependencies.getAccessToken ?? getBqeAccessToken)();
  const resolve = dependencies.resolveUuid ?? resolveUuid;
  const canonicalCodes = [...new Set(estimates.flatMap((estimate) =>
    estimate.disciplines.flatMap((discipline) =>
      discipline.activities
        .filter((activity) => numeric(activity.calculatedHours) > 0)
        .map((activity) => activity.code),
    ),
  ))].sort();
  const resolved: BqeActivityReadinessResult["resolved"] = [];
  const unresolved: BqeActivityReadinessResult["unresolved"] = [];

  for (const canonicalCode of canonicalCodes) {
    const liveCode = bqeActivityCode(canonicalCode);
    try {
      const id = await resolve(connection, "activity", liveCode);
      resolved.push({ canonicalCode, liveCode, id });
    } catch (error: unknown) {
      unresolved.push({
        canonicalCode,
        liveCode,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { ready: unresolved.length === 0, resolved, unresolved };
}

function verificationMismatches(sent: Json, received: Json): string[] {
  return Object.entries(sent).flatMap(([key, expected]) => {
    const actual = received[key];
    return JSON.stringify(actual) === JSON.stringify(expected) ? [] : [key];
  });
}

function disciplineManager(input: BqeProjectOrchestrationInput, discipline?: string): string {
  const pmByDiscipline = input.intake.pmByDiscipline ?? {};
  return (discipline && text(pmByDiscipline[discipline])) ?? input.localProject.pm;
}

/**
 * Creates a BQE parent project and, when more than one discipline is estimated,
 * a child project per discipline.  The function is intentionally request
 * independent: operational diagnostics use the process singleton logger.
 */
export async function orchestrateBqeProjectCreation(
  input: BqeProjectOrchestrationInput,
  dependencies: BqeProjectOrchestrationDependencies = {},
): Promise<BqeProjectOrchestrationResult> {
  const getAccessToken = dependencies.getAccessToken ?? getBqeAccessToken;
  const resolve = dependencies.resolveUuid ?? resolveUuid;
  const request = dependencies.request ?? bqeRequest;
  const connection = await getAccessToken();
  const payloads: BqeProjectOrchestrationResult["payloads"] = [];
  const created: CreatedObject[] = [];
  const warnings: string[] = [];
  const resolvedIds = new Map<string, string>();
  const projectIds = { parent: null as string | null, children: {} as Record<string, string> };
  let failedKind = "project";
  const register = (kind: string, path: string, payload: Json) => payloads.push({ kind, endpoint: path, payload });
  const resolveForRun = async (entityType: EntityType, humanKey: string): Promise<string> => {
    const lookupKey = entityType === "activity" ? bqeActivityCode(humanKey) : humanKey;
    const cacheKey = `${entityType}:${lookupKey}`;
    const cached = resolvedIds.get(cacheKey);
    if (cached) return cached;
    try {
      const id = await resolve(connection, entityType, lookupKey);
      resolvedIds.set(cacheKey, id);
      return id;
    } catch (error: unknown) {
      if (!input.dryRun) throw error;
      const message = error instanceof Error ? error.message : String(error);
      const placeholder = `dry-run:unresolved:${entityType}:${lookupKey}`;
      warnings.push(message);
      resolvedIds.set(cacheKey, placeholder);
      logger.warn({ entityType, humanKey: lookupKey, placeholder, err: error }, "BQE dry-run using unresolved lookup placeholder");
      return placeholder;
    }
  };
  const create = async (kind: string, path: string, payload: Json, targetProjectId?: string): Promise<string> => {
    register(kind, path, payload);
    if (input.dryRun) {
      logger.info({ kind, endpoint: path, payload }, "BQE dry-run payload");
      return `dry-run:${kind}:${payloads.length}`;
    }
    failedKind = kind;
    const response = await request(connection, path, "POST", payload);
    const id = idOf(response) ?? idOf(records(response)[0]);
    if (!id) throw new Error(`BQE POST ${path} returned no object ID.`);
    created.push({ kind, id, targetProjectId });
    const verificationEndpoints: Record<string, string> = {
      parentProject: "project",
      childProject: "project",
      budget: "budget",
      resourceAssignment: "projectassignment/resource",
      activityAssignment: "projectassignment/activity",
      allocation: "allocation",
    };
    const verificationEndpoint = verificationEndpoints[kind];
    if (!verificationEndpoint) throw new Error(`No BQE verification endpoint is configured for ${kind}.`);
    const fetchedResponse = await request(connection, `${verificationEndpoint}/${encodeURIComponent(id)}`, "GET");
    const fetched = asRecord(records(fetchedResponse)[0] ?? fetchedResponse);
    const mismatches = verificationMismatches(payload, fetched);
    if (mismatches.length) logger.warn({ kind, id, mismatches }, "BQE created object differs from submitted payload");
    return id;
  };

  try {
    const clientId = await resolveForRun("client", input.localProject.client || input.intake.client);
    const groupName = input.employeeGroupName ?? text(asRecord(input.intake.answers).employeeGroup);
    if (!groupName) {
      throw new Error("A BQE employee group name is required (employeeGroupName or intake.answers.employeeGroup).");
    }
    const resourceGroupId = await resolveForRun("employeeGroup", groupName);
    const parentManagerId = await resolveForRun("employee", disciplineManager(input));
    const disciplines = input.estimate.disciplines;
    const managerIds = new Map<string, string>();
    for (const discipline of disciplines) {
      managerIds.set(
        discipline.discipline,
        await resolveForRun("employee", disciplineManager(input, discipline.discipline)),
      );
      for (const activity of discipline.activities) {
        if (numeric(activity.calculatedHours) > 0) {
          await resolveForRun("activity", activity.code);
        }
      }
    }
    const baseProject = (name: string, code: string, managerId: string, contractAmount: number): Json => ({
      name, code, clientId, managerId, contractType: input.intake.contractType ?? "",
      type: 0, status: 0, contractAmount, startDate: input.intake.startDate,
      dueDate: input.localProject.dueDate ?? input.intake.targetCompletion, level: 0,
    });
    projectIds.parent = await create("parentProject", "project", baseProject(
      input.localProject.name, input.localProject.projectNumber, parentManagerId, numeric(input.localProject.fee),
    ));

    const targets: Array<{ id: string; discipline: EstimateResult["disciplines"][number] | undefined; managerId: string }> = [];
    if (disciplines.length > 1) {
      for (const discipline of disciplines) {
        const managerId = managerIds.get(discipline.discipline) ?? parentManagerId;
        const childId = await create("childProject", "project", {
          ...baseProject(`${input.localProject.name} - ${discipline.discipline}`, `${input.localProject.projectNumber}-${discipline.disciplineKey ?? discipline.discipline}`, managerId, discipline.fee),
          parentId: projectIds.parent,
        });
        projectIds.children[discipline.discipline] = childId;
        targets.push({ id: childId, discipline, managerId });
      }
    } else {
      targets.push({ id: projectIds.parent!, discipline: disciplines[0], managerId: parentManagerId });
    }

    if (input.dryRun) {
      for (const target of targets) {
        logger.info({ projectId: target.id, endpoint: `project/${target.id}` }, "BQE dry-run planned project-rule preflight GET");
      }
    } else {
      for (const target of targets) {
        const projectResponse = await request(connection, `project/${encodeURIComponent(target.id)}`, "GET");
        const project = asRecord(records(projectResponse)[0] ?? projectResponse);
        const projectRules = records(project.rules ?? project.projectRules);
        const activeRuleCodes = projectRules
          .filter((rule) =>
            rule.active !== false &&
            rule.isActive !== false &&
            rule.isActive !== 0 &&
            rule.status !== 1 &&
            rule.status !== "inactive",
          )
          .map((rule) => numeric(rule.code, -1))
          .filter((code) => ACTIVE_RULE_CODES.has(code));
        logger.info({ projectId: target.id, activeRuleCodes }, "BQE active project rules relevant to project creation");
      }
    }

    for (const target of targets) {
      if (!target.discipline) continue;
      const services: Json[] = [];
      for (const activity of target.discipline.activities) {
        const hours = numeric(activity.calculatedHours);
        if (hours <= 0) continue;
        const activityId = await resolveForRun("activity", activity.code);
        const billRate = numeric((activity as unknown as Json).billRate, numeric(input.estimate.rate));
        services.push({
          itemId: activityId, resourceId: target.managerId,
          resourceGroupId, isResourceGroup: false, itemType: 1, item: bqeActivityCode(activity.code),
          description: activity.desc ?? activity.code, hours, billRate, costRate: 0,
          chargeAmount: hours * billRate, tax1: 0, tax2: 0, tax3: 0, memo: "",
        });
      }
      await create("budget", `project/${encodeURIComponent(target.id)}/budget`, {
        name: `${input.localProject.projectNumber}${target.discipline ? ` - ${target.discipline.discipline}` : ""}`,
        status: 1,
        employeeId: target.managerId,
        services,
      }, target.id);
      await create("resourceAssignment", "projectassignment/resource", {
        projectId: target.id, resourceId: target.managerId, resourceType: RESOURCE_TYPE_EMPLOYEE,
      }, target.id);
      for (const activity of target.discipline.activities) {
        const hours = numeric(activity.calculatedHours);
        if (hours <= 0) continue;
        const activityId = await resolveForRun("activity", activity.code);
        await create("activityAssignment", "projectassignment/activity", { projectId: target.id, itemId: activityId }, target.id);
        await create("allocation", "allocation", {
          itemId: activityId, itemType: 1, projectId: target.id, resourceId: target.managerId,
          resourceType: RESOURCE_TYPE_EMPLOYEE, startsOn: input.intake.startDate,
          endsOn: input.localProject.dueDate ?? input.intake.targetCompletion, units: hours,
        }, target.id);
      }
    }
    const result: BqeProjectOrchestrationResult = {
      status: input.dryRun ? "dry-run" : "completed", created, payloads, projectIds,
      ...(warnings.length ? { warnings } : {}),
    };
    logger.info({ status: result.status, projectIds, payloadCount: payloads.length }, "BQE project orchestration completed");
    return result;
  } catch (error: unknown) {
    const result: BqeProjectOrchestrationResult = {
      status: "partial", created, payloads, projectIds,
      ...(warnings.length ? { warnings } : {}),
      error: { message: error instanceof Error ? error.message : String(error), failedKind },
    };
    logger.error({ err: error, created, failedKind }, "BQE project orchestration stopped after partial creation");
    return result;
  }
}