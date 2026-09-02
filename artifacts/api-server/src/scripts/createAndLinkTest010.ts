import { mkdir, writeFile } from "node:fs/promises";
import { getBqeAccessToken } from "../lib/bqe";

const PROJECT_CODE = "TEST-010";
const PROJECT_NAME = "API Test Project Delete After Verification";
const CLIENT_ID = "c5904486-0eb2-4f22-9dca-b6254f947ed2";
const EMPLOYEE_ID = "756e7392-7cd8-462b-80e8-c7bc638dba4d";
const RESOURCE_GROUP_ID = "7bf53b52-169a-46f4-a4e0-ffd451b4bf25";
const BUDGET_NAME = "Short Plat Template Test 010";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const logLines: string[] = [];

type Json = Record<string, unknown>;

const serviceSpecs = [
  ["V-880", "52e63a65-225f-cbdc-559f-724a50439e4f", 1.8],
  ["V-100", "563704a8-95be-f150-c55f-ba0df69f514c", 1.9],
  ["V-621", "2eda9ba0-affb-971a-b924-be701619a801", 5],
  ["V-167", "6f98d037-97f0-81b3-2c21-fba80d46256d", 7],
  ["V-326", "881c58ad-8ee6-4a58-0f61-6213b013e863", 9],
] as const;

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

function idFrom(value: unknown, location: string | null): string | null {
  if (typeof value === "string" && UUID_PATTERN.test(value.replace(/^"|"$/g, ""))) {
    return value.replace(/^"|"$/g, "");
  }
  const candidates = records(value);
  for (const candidate of candidates) {
    for (const key of ["id", "uuid", "projectId", "budgetId"]) {
      if (typeof candidate[key] === "string" && UUID_PATTERN.test(candidate[key])) return candidate[key];
    }
  }
  const locationId = location?.split("/").filter(Boolean).at(-1) ?? null;
  return locationId && UUID_PATTERN.test(locationId) ? locationId : null;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Json)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, nested]) => [key, stable(nested)]));
}

function changedFields(before: Json, after: Json): Array<{ field: string; before: unknown; after: unknown }> {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().flatMap((field) =>
    JSON.stringify(stable(before[field])) === JSON.stringify(stable(after[field]))
      ? []
      : [{ field, before: before[field], after: after[field] }]);
}

async function request(
  accessToken: string,
  url: string,
  init: RequestInit = {},
): Promise<{ status: number; bodyText: string; body: unknown; location: string | null }> {
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
    bodyText,
    body: parseBody(bodyText),
    location: response.headers.get("location"),
  };
}

function requireSuccess(step: string, result: { status: number }): void {
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Stopped: ${step} returned HTTP ${result.status}.`);
  }
}

async function main(): Promise<void> {
  let finalStatus = "FAILED";
  try {
    const { accessToken, apiBase } = await getBqeAccessToken();
    log("FULL CREATE-AND-LINK TEST");
    log("Safety restriction", {
      projectCode: PROJECT_CODE,
      projectName: PROJECT_NAME,
      clientId: CLIENT_ID,
      managerId: EMPLOYEE_ID,
      deletionRequested: false,
    });
    log("API base", apiBase);
    log("Authorization", "Bearer token obtained through persisted BQE OAuth flow; value intentionally not logged.");

    const projectRequest: Json = {
      name: PROJECT_NAME,
      code: PROJECT_CODE,
      clientId: CLIENT_ID,
      managerId: EMPLOYEE_ID,
      contractType: 0,
      type: 0,
      status: 0,
      contractAmount: 5434,
      level: 0,
    };
    const projectPostUrl = endpoint(apiBase, "project");
    log("STEP 1 PROJECT POST REQUEST", { method: "POST", url: projectPostUrl, body: projectRequest });
    const projectPost = await request(accessToken, projectPostUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(projectRequest),
    });
    log("STEP 1 PROJECT POST STATUS", projectPost.status);
    log("STEP 1 PROJECT POST RESPONSE BODY", projectPost.body);
    log("STEP 1 PROJECT POST LOCATION", projectPost.location);
    requireSuccess("project POST", projectPost);
    const projectId = idFrom(projectPost.body, projectPost.location);
    if (!projectId) throw new Error("Stopped: project POST returned no project id.");
    log("STEP 1 NEW PROJECT ID", projectId);

    const services = serviceSpecs.map(([item, itemId, hours]) => ({
      itemId,
      item,
      hours,
      resourceId: EMPLOYEE_ID,
      resourceGroupId: RESOURCE_GROUP_ID,
      resourceGroup: "Land Surveying",
      isResourceGroup: false,
      itemType: 1,
      billRate: 220,
      costRate: 100,
      chargeAmount: hours * 220,
      tax1: 0,
      tax2: 0,
      tax3: 0,
      memo: "",
    }));
    const budgetRequest: Json = {
      name: BUDGET_NAME,
      description: "TEST - delete after verification",
      status: 1,
      employeeId: EMPLOYEE_ID,
      services,
    };
    const budgetPostUrl = endpoint(apiBase, "budget");
    log("STEP 2 BUDGET POST REQUEST", { method: "POST", url: budgetPostUrl, body: budgetRequest });
    const budgetPost = await request(accessToken, budgetPostUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(budgetRequest),
    });
    log("STEP 2 BUDGET POST STATUS", budgetPost.status);
    log("STEP 2 BUDGET POST RESPONSE BODY", budgetPost.body);
    log("STEP 2 BUDGET POST LOCATION", budgetPost.location);
    requireSuccess("budget POST", budgetPost);
    const budgetId = idFrom(budgetPost.body, budgetPost.location);
    if (!budgetId) throw new Error("Stopped: budget POST returned no budget id.");
    log("STEP 2 NEW BUDGET ID", budgetId);

    const projectGetUrl = endpoint(apiBase, `project/${projectId}`);
    log("STEP 3 COMPLETE PROJECT GET REQUEST", {
      method: "GET",
      url: projectGetUrl,
      fieldsParameter: false,
    });
    const initialGet = await request(accessToken, projectGetUrl);
    log("STEP 3 COMPLETE PROJECT GET STATUS", initialGet.status);
    log("STEP 3 COMPLETE PROJECT GET RESPONSE BODY", initialGet.body);
    requireSuccess("complete project GET", initialGet);
    const initialProject = records(initialGet.body)[0];
    if (!initialProject || initialProject.id !== projectId) {
      throw new Error("Stopped: complete project GET did not return the newly created project id.");
    }
    log("STEP 3 COMPLETE PROJECT MODEL — EVERY FIELD", initialProject);
    log("STEP 3 CURRENT VERSION", initialProject.version ?? null);

    const linkRequest = {
      ...initialProject,
      budgetId,
      budgetName: BUDGET_NAME,
    };
    const projectPutUrl = endpoint(apiBase, `project/${projectId}`);
    log("STEP 4 PROJECT PUT REQUEST", { method: "PUT", url: projectPutUrl, attemptsAllowed: 1 });
    log("STEP 4 EXACT PROJECT PUT BODY", linkRequest);
    const projectPut = await request(accessToken, projectPutUrl, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(linkRequest),
    });
    log("STEP 4 PROJECT PUT STATUS", projectPut.status);
    log("STEP 4 PROJECT PUT RESPONSE BODY", projectPut.body);
    requireSuccess("project PUT", projectPut);

    log("STEP 5 PROJECT READ-BACK REQUEST", { method: "GET", url: projectGetUrl, fieldsParameter: false });
    const readBack = await request(accessToken, projectGetUrl);
    log("STEP 5 PROJECT READ-BACK STATUS", readBack.status);
    log("STEP 5 PROJECT READ-BACK RESPONSE BODY", readBack.body);
    requireSuccess("project read-back GET", readBack);
    const verifiedProject = records(readBack.body)[0];
    if (!verifiedProject || verifiedProject.id !== projectId) {
      throw new Error("Stopped: project read-back did not return the newly created project id.");
    }
    const differences = changedFields(initialProject, verifiedProject);
    const expectedFields = new Set(["budgetId", "budgetName", "version", "token"]);
    const otherDifferences = differences.filter(({ field }) => !expectedFields.has(field));
    log("STEP 5 PROJECT READ-BACK SUMMARY", {
      projectId,
      budgetId: verifiedProject.budgetId ?? null,
      budgetName: verifiedProject.budgetName ?? null,
      version: verifiedProject.version ?? null,
      token: verifiedProject.token ?? null,
      allChangedFields: differences,
      anyOtherFieldChanged: otherDifferences.length > 0,
      otherChangedFields: otherDifferences,
    });

    const activitiesUrl = endpoint(apiBase, `project/${projectId}/activities`);
    log("STEP 6 PROJECT ACTIVITIES REQUEST", { method: "GET", url: activitiesUrl });
    const activities = await request(accessToken, activitiesUrl);
    log("STEP 6 PROJECT ACTIVITIES STATUS", activities.status);
    log("STEP 6 PROJECT ACTIVITIES RESPONSE BODY", activities.body);
    requireSuccess("project activities GET", activities);
    finalStatus = "COMPLETED";
  } catch (error) {
    log("STOPPED", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    log("FINAL STATUS", finalStatus);
    await mkdir("logs", { recursive: true });
    const outputPath = "logs/bqe-test010-create-link.log";
    await writeFile(outputPath, `${logLines.join("\n\n")}\n`, "utf8");
    console.log(`LOG FILE\n${outputPath}`);
  }
}

void main();