import { mkdir, writeFile } from "node:fs/promises";
import { getBqeAccessToken } from "../lib/bqe";

const PROJECT_CODE = "TEST-001";
const PROJECT_ID = "f5a0b8bc-cbca-4cff-9770-ae735d93e22f";
const BUDGET_ID = "a480f0f5-945f-4ea4-b1dd-b73622ebdc6b";
const BUDGET_NAME = "Short Plat Template Test";

const logLines: string[] = [];

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

function records(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter((row): row is Record<string, unknown> =>
      typeof row === "object" && row !== null && !Array.isArray(row));
  }
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  for (const key of ["data", "items", "results", "value"]) {
    if (Array.isArray(row[key])) return records(row[key]);
  }
  return [row];
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, stable(nested)]),
  );
}

function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Array<{ field: string; before: unknown; after: unknown }> {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].sort().flatMap((field) =>
    JSON.stringify(stable(before[field])) === JSON.stringify(stable(after[field]))
      ? []
      : [{ field, before: before[field], after: after[field] }]);
}

async function request(
  accessToken: string,
  url: URL | string,
  init: RequestInit = {},
): Promise<{ status: number; bodyText: string; body: unknown }> {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      ...init.headers,
    },
  });
  const bodyText = await response.text();
  return { status: response.status, bodyText, body: parseBody(bodyText) };
}

async function main(): Promise<void> {
  let finalStatus = "FAILED";
  try {
    const { accessToken, apiBase } = await getBqeAccessToken();
    log("CONTROLLED WRITE");
    log("Project restriction", { code: PROJECT_CODE, id: PROJECT_ID });
    log("Budget restriction", { id: BUDGET_ID, name: BUDGET_NAME });
    log("API base", apiBase);
    log("Authorization", "Bearer token obtained through persisted BQE OAuth flow; value intentionally not logged.");

    const projectUrl = new URL(endpoint(apiBase, "project"));
    projectUrl.searchParams.set("where", `code='${PROJECT_CODE}'`);
    log("STEP 1 REQUEST", { method: "GET", url: projectUrl.toString(), fieldsParameter: false });
    const initialGet = await request(accessToken, projectUrl);
    log("STEP 1 RESPONSE STATUS", initialGet.status);
    log("STEP 1 COMPLETE RESPONSE BODY", initialGet.body);
    if (initialGet.status < 200 || initialGet.status >= 300) {
      throw new Error(`Stopped: initial project GET returned HTTP ${initialGet.status}.`);
    }
    const matches = records(initialGet.body);
    if (matches.length !== 1) {
      throw new Error(`Stopped: TEST-001 lookup returned ${matches.length} records; expected exactly one.`);
    }
    const initialProject = matches[0]!;
    log("STEP 1 COMPLETE PROJECT MODEL — EVERY FIELD", initialProject);
    if (initialProject.id !== PROJECT_ID) {
      throw new Error(`Stopped: TEST-001 id was ${String(initialProject.id)}, not ${PROJECT_ID}.`);
    }
    log("STEP 1 ID CONFIRMED", PROJECT_ID);

    const budgetUrl = endpoint(apiBase, `budget/${BUDGET_ID}`);
    log("STEP 2 REQUEST", { method: "GET", url: budgetUrl });
    const budgetGet = await request(accessToken, budgetUrl);
    log("STEP 2 RESPONSE STATUS", budgetGet.status);
    log("STEP 2 RESPONSE BODY", budgetGet.body);
    if (budgetGet.status === 404) {
      throw new Error(`Stopped: budget ${BUDGET_ID} returned HTTP 404.`);
    }
    if (budgetGet.status < 200 || budgetGet.status >= 300) {
      throw new Error(`Stopped: budget verification returned HTTP ${budgetGet.status}.`);
    }
    log("STEP 2 BUDGET CONFIRMED", BUDGET_ID);

    const requestBody = {
      ...initialProject,
      budgetId: BUDGET_ID,
      budgetName: BUDGET_NAME,
    };
    const putUrl = endpoint(apiBase, `project/${PROJECT_ID}`);
    log("STEP 3 REQUEST", { method: "PUT", url: putUrl, attemptsAllowed: 1 });
    log("STEP 3 EXACT REQUEST BODY", requestBody);
    const putResponse = await request(accessToken, putUrl, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    log("STEP 3 RESPONSE STATUS", putResponse.status);
    log("STEP 3 RESPONSE BODY", putResponse.body);
    if (putResponse.status < 200 || putResponse.status >= 300) {
      throw new Error(`Stopped after the single PUT attempt: HTTP ${putResponse.status}.`);
    }

    log("STEP 4 PROJECT RE-GET REQUEST", { method: "GET", url: projectUrl.toString(), fieldsParameter: false });
    const verificationGet = await request(accessToken, projectUrl);
    log("STEP 4 PROJECT RE-GET STATUS", verificationGet.status);
    log("STEP 4 PROJECT RE-GET COMPLETE RESPONSE BODY", verificationGet.body);
    if (verificationGet.status < 200 || verificationGet.status >= 300) {
      throw new Error(`Verification project GET returned HTTP ${verificationGet.status}.`);
    }
    const verifiedMatches = records(verificationGet.body);
    if (verifiedMatches.length !== 1 || verifiedMatches[0]?.id !== PROJECT_ID) {
      throw new Error("Verification GET did not return exactly the confirmed TEST-001 project.");
    }
    const verifiedProject = verifiedMatches[0]!;
    const differences = changedFields(initialProject, verifiedProject);
    const expectedFields = new Set(["budgetId", "budgetName", "version", "token"]);
    const otherDifferences = differences.filter(({ field }) => !expectedFields.has(field));
    log("STEP 4 VERIFICATION SUMMARY", {
      budgetId: verifiedProject.budgetId ?? null,
      budgetName: verifiedProject.budgetName ?? null,
      version: verifiedProject.version ?? null,
      token: verifiedProject.token ?? null,
      allChangedFields: differences,
      anyOtherFieldChanged: otherDifferences.length > 0,
      otherChangedFields: otherDifferences,
    });

    const activitiesUrl = endpoint(apiBase, `project/${PROJECT_ID}/activities`);
    log("STEP 4 ACTIVITIES REQUEST", { method: "GET", url: activitiesUrl });
    const activitiesGet = await request(accessToken, activitiesUrl);
    log("STEP 4 ACTIVITIES RESPONSE STATUS", activitiesGet.status);
    log("STEP 4 ACTIVITIES RESPONSE BODY", activitiesGet.body);
    finalStatus = "COMPLETED";
  } catch (error) {
    log("STOPPED", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    log("FINAL STATUS", finalStatus);
    await mkdir("logs", { recursive: true });
    const outputPath = "logs/bqe-test001-budget-link.log";
    await writeFile(outputPath, `${logLines.join("\n\n")}\n`, "utf8");
    console.log(`LOG FILE\n${outputPath}`);
  }
}

void main();