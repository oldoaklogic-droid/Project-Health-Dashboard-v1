import { mkdir, writeFile } from "node:fs/promises";
import { getBqeAccessToken } from "../lib/bqe";

const PROJECT_ID = "de21674e-ddda-468e-b091-3d62d8e97c48";
const RESOURCE_ID = "756e7392-7cd8-462b-80e8-c7bc638dba4d";
const TRACKED_RULES = new Set([3, 4, 5, 8, 11, 12, 13, 16, 17, 22]);
const STARTS_ON = "2026-09-08T00:00:00";
const ENDS_ON = "2026-09-30T00:00:00";
const activities = [
  { code: "V-880", itemId: "52e63a65-225f-cbdc-559f-724a50439e4f", units: 1.8 },
  { code: "V-100", itemId: "563704a8-95be-f150-c55f-ba0df69f514c", units: 1.9 },
  { code: "V-621", itemId: "2eda9ba0-affb-971a-b924-be701619a801", units: 5 },
  { code: "V-167", itemId: "6f98d037-97f0-81b3-2c21-fba80d46256d", units: 7 },
  { code: "V-326", itemId: "881c58ad-8ee6-4a58-0f61-6213b013e863", units: 9 },
] as const;

type Json = Record<string, unknown>;
type Result = {
  status: number;
  ok: boolean;
  body: unknown;
  bodyText: string;
  location: string | null;
};

const logLines: string[] = [];
const errors: Array<{ step: string; status?: number; detail: string }> = [];
const successfulPayloads: Record<string, Json[]> = {
  resourceAssignment: [],
  activityAssignment: [],
  allocation: [],
};

function log(label: string, value?: unknown): void {
  const line = value === undefined
    ? label
    : `${label}\n${typeof value === "string" ? value : JSON.stringify(value, null, 2)}`;
  logLines.push(line);
  console.log(line);
}

function endpoint(apiBase: string, path: string): string {
  return `${apiBase.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function parseBody(body: string): unknown {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function records(value: unknown): Json[] {
  if (Array.isArray(value)) {
    return value.filter((row): row is Json => typeof row === "object" && row !== null && !Array.isArray(row));
  }
  if (!value || typeof value !== "object") return [];
  const row = value as Json;
  for (const key of ["data", "items", "results", "value"]) {
    if (Array.isArray(row[key])) return records(row[key]);
  }
  return [row];
}

async function request(accessToken: string, url: string, init: RequestInit = {}): Promise<Result> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
        ...init.headers,
      },
    });
    const bodyText = await response.text();
    return {
      status: response.status,
      ok: response.ok,
      bodyText,
      body: parseBody(bodyText),
      location: response.headers.get("location"),
    };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      bodyText: "",
      body: null,
      location: null,
    };
  }
}

async function loggedRequest(
  accessToken: string,
  label: string,
  method: "GET" | "POST",
  url: string,
  body?: Json,
): Promise<Result> {
  log(`${label} REQUEST`, { method, url, ...(body ? { body } : {}) });
  const result = await request(accessToken, url, {
    method,
    ...(body ? {
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    } : {}),
  });
  log(`${label} RESPONSE STATUS`, result.status);
  log(`${label} RESPONSE BODY`, result.body);
  if (result.location) log(`${label} RESPONSE LOCATION`, result.location);
  if (!result.ok) {
    errors.push({
      step: label,
      status: result.status || undefined,
      detail: result.bodyText || "Network request failed before an HTTP response.",
    });
  }
  return result;
}

function activeRule(rule: Json): boolean {
  return rule.active !== false &&
    rule.isActive !== false &&
    rule.isActive !== 0 &&
    rule.status !== 1 &&
    rule.status !== "inactive" &&
    rule.objectState !== 0;
}

function numericRule(rule: Json): number | null {
  const value = rule.rule ?? rule.code;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function requestFieldsAbsentFromRecord(payload: Json, record: Json | undefined): string[] {
  if (!record) return Object.keys(payload).sort();
  return Object.keys(payload).filter((key) => !(key in record)).sort();
}

function findBy(recordList: Json[], fields: Array<[string, unknown]>): Json | undefined {
  return recordList.find((row) => fields.every(([field, expected]) => row[field] === expected));
}

async function main(): Promise<void> {
  try {
    const { accessToken, apiBase } = await getBqeAccessToken();
    log("TEST-010 REMAINING ORCHESTRATOR STEPS");
    log("Safety restriction", {
      onlyProjectId: PROJECT_ID,
      resourceId: RESOURCE_ID,
      activityIds: activities.map(({ itemId }) => itemId),
    });
    log("API base", apiBase);
    log("Authorization", "Bearer token obtained through persisted BQE OAuth flow; value intentionally not logged.");

    const projectUrl = endpoint(apiBase, `project/${PROJECT_ID}`);
    const preflight = await loggedRequest(accessToken, "STEP 1 PREFLIGHT PROJECT GET", "GET", projectUrl);
    const project = records(preflight.body)[0];
    if (project && project.id !== PROJECT_ID) {
      throw new Error(`Safety stop: project GET returned id ${String(project.id)} instead of ${PROJECT_ID}.`);
    }
    const allRules = records(project?.rules ?? project?.projectRules);
    const trackedRules = allRules.filter((rule) => {
      const code = numericRule(rule);
      return code !== null && TRACKED_RULES.has(code);
    });
    log("STEP 1 TRACKED PROJECT RULES", trackedRules);
    log("STEP 1 ACTIVE TRACKED PROJECT RULES", trackedRules.filter(activeRule));
    log("STEP 1 ACTIVE TRACKED RULE NUMBERS", trackedRules.filter(activeRule).map(numericRule));

    const resourceUrl = endpoint(apiBase, "projectassignment/resource");
    const resourcePayload0: Json = {
      projectId: PROJECT_ID,
      resourceId: RESOURCE_ID,
      resourceType: 0,
    };
    const resource0 = await loggedRequest(
      accessToken,
      "STEP 2 RESOURCE ASSIGNMENT resourceType=0",
      "POST",
      resourceUrl,
      resourcePayload0,
    );
    if (resource0.ok) {
      successfulPayloads.resourceAssignment.push(resourcePayload0);
    } else {
      const resourcePayload1: Json = {
        projectId: PROJECT_ID,
        resourceId: RESOURCE_ID,
        resourceType: 1,
      };
      const resource1 = await loggedRequest(
        accessToken,
        "STEP 2 RESOURCE ASSIGNMENT FALLBACK resourceType=1",
        "POST",
        resourceUrl,
        resourcePayload1,
      );
      if (resource1.ok) successfulPayloads.resourceAssignment.push(resourcePayload1);
    }

    const activityUrl = endpoint(apiBase, "projectassignment/activity");
    for (const activity of activities) {
      const payload: Json = {
        projectId: PROJECT_ID,
        itemId: activity.itemId,
        itemType: 1,
      };
      const result = await loggedRequest(
        accessToken,
        `STEP 3 ACTIVITY ASSIGNMENT ${activity.code}`,
        "POST",
        activityUrl,
        payload,
      );
      if (result.ok) successfulPayloads.activityAssignment.push(payload);
    }

    const allocationUrl = endpoint(apiBase, "allocation");
    for (const activity of activities) {
      const payload: Json = {
        itemId: activity.itemId,
        itemType: 1,
        projectId: PROJECT_ID,
        resourceId: RESOURCE_ID,
        resourceType: 0,
        startsOn: STARTS_ON,
        endsOn: ENDS_ON,
        units: activity.units,
      };
      const result = await loggedRequest(
        accessToken,
        `STEP 4 ALLOCATION ${activity.code}`,
        "POST",
        allocationUrl,
        payload,
      );
      if (result.ok) successfulPayloads.allocation.push(payload);
    }

    const resourcesReadBack = await loggedRequest(
      accessToken,
      "STEP 5 RESOURCES READ-BACK",
      "GET",
      endpoint(apiBase, `project/${PROJECT_ID}/resources`),
    );
    const activitiesReadBack = await loggedRequest(
      accessToken,
      "STEP 5 ACTIVITIES READ-BACK",
      "GET",
      endpoint(apiBase, `project/${PROJECT_ID}/activities`),
    );
    const allocationReadUrl = new URL(endpoint(apiBase, "allocation"));
    allocationReadUrl.searchParams.set("where", `projectId='${PROJECT_ID}'`);
    const allocationsReadBack = await loggedRequest(
      accessToken,
      "STEP 5 ALLOCATIONS READ-BACK",
      "GET",
      allocationReadUrl.toString(),
    );

    const resourceRecords = records(resourcesReadBack.body);
    const activityRecords = records(activitiesReadBack.body);
    const allocationRecords = records(allocationsReadBack.body);
    const resourceDiscarded = successfulPayloads.resourceAssignment.map((payload) => ({
      request: payload,
      matchedReadBack: findBy(resourceRecords, [["resourceId", payload.resourceId]]),
      absentRequestFields: requestFieldsAbsentFromRecord(
        payload,
        findBy(resourceRecords, [["resourceId", payload.resourceId]]),
      ),
    }));
    const activityDiscarded = successfulPayloads.activityAssignment.map((payload) => ({
      request: payload,
      matchedReadBack: findBy(activityRecords, [["itemId", payload.itemId]]),
      absentRequestFields: requestFieldsAbsentFromRecord(
        payload,
        findBy(activityRecords, [["itemId", payload.itemId]]),
      ),
    }));
    const allocationDiscarded = successfulPayloads.allocation.map((payload) => ({
      request: payload,
      matchedReadBack: findBy(allocationRecords, [
        ["itemId", payload.itemId],
        ["projectId", PROJECT_ID],
      ]),
      absentRequestFields: requestFieldsAbsentFromRecord(
        payload,
        findBy(allocationRecords, [["itemId", payload.itemId], ["projectId", PROJECT_ID]]),
      ),
    }));
    log("STEP 6 EXACT SUCCESSFUL PAYLOAD SHAPES", successfulPayloads);
    log("STEP 6 REQUEST FIELDS ABSENT FROM READ-BACK — RESOURCE", resourceDiscarded);
    log("STEP 6 REQUEST FIELDS ABSENT FROM READ-BACK — ACTIVITY", activityDiscarded);
    log("STEP 6 REQUEST FIELDS ABSENT FROM READ-BACK — ALLOCATION", allocationDiscarded);
    log("ERROR SUMMARY", errors);
    log("FINAL STATUS", errors.length ? "COMPLETED WITH ERRORS" : "COMPLETED");
  } catch (error) {
    log("SAFETY STOP", error instanceof Error ? error.message : String(error));
    log("ERROR SUMMARY", errors);
    log("FINAL STATUS", "STOPPED FOR SAFETY");
    process.exitCode = 1;
  } finally {
    await mkdir("logs", { recursive: true });
    const outputPath = "logs/bqe-test010-orchestrator-remaining.log";
    await writeFile(outputPath, `${logLines.join("\n\n")}\n`, "utf8");
    console.log(`LOG FILE\n${outputPath}`);
  }
}

void main();