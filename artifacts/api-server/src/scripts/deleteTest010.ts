import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { getBqeAccessToken } from "../lib/bqe";

type Json = Record<string, unknown>;
type Result = {
  method: "GET" | "PUT" | "DELETE";
  url: string;
  status: number;
  ok: boolean;
  body: unknown;
  bodyText: string;
};

const PROJECT_ID = "de21674e-ddda-468e-b091-3d62d8e97c48";
const PROJECT_CODE = "TEST-010";
const BUDGET_ID = "5c711177-29c0-472c-b121-d7937470b541";
const EXPORT_PATH = "../../data/test-records-export.json";
const CHECKSUM_PATH = "../../data/test-records-export.json.sha256";
const LOG_PATH = "logs/bqe-test010-delete.log";
const CODES = Array.from({ length: 10 }, (_, index) =>
  `TEST-${String(index + 1).padStart(3, "0")}`
);
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

function isJson(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): Json[] {
  if (Array.isArray(value)) return value.filter(isJson);
  if (!isJson(value)) return [];
  for (const key of ["data", "items", "results", "value"]) {
    if (Array.isArray(value[key])) return records(value[key]);
  }
  return [value];
}

function parse(bodyText: string): unknown {
  if (!bodyText) return null;
  try {
    return JSON.parse(bodyText);
  } catch {
    return bodyText;
  }
}

async function request(
  accessToken: string,
  method: Result["method"],
  url: string,
  body?: Json,
): Promise<Result> {
  const response = await fetch(url, {
    method,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const bodyText = await response.text();
  return {
    method,
    url,
    status: response.status,
    ok: response.ok,
    body: parse(bodyText),
    bodyText,
  };
}

async function loggedRequest(
  accessToken: string,
  label: string,
  method: Result["method"],
  url: string,
  body?: Json,
): Promise<Result> {
  log(`${label} REQUEST`, { method, url, ...(body ? { body } : {}) });
  const result = await request(accessToken, method, url, body);
  log(`${label} STATUS`, result.status);
  log(`${label} RESPONSE`, result.body);
  return result;
}

async function verifyExport(): Promise<{ allocationIds: string[] }> {
  const [exportBytes, checksumText] = await Promise.all([
    readFile(EXPORT_PATH),
    readFile(CHECKSUM_PATH, "utf8"),
  ]);
  const expectedChecksum = checksumText.trim().split(/\s+/)[0];
  const actualChecksum = createHash("sha256").update(exportBytes).digest("hex");
  if (expectedChecksum !== actualChecksum) {
    throw new Error("Safety stop: export checksum verification failed.");
  }
  const exported = JSON.parse(exportBytes.toString("utf8")) as Json;
  const projectRows = records((exported.projects as Json | undefined)?.[PROJECT_CODE]);
  if (projectRows.length !== 1 || projectRows[0].id !== PROJECT_ID) {
    throw new Error("Safety stop: export does not identify exactly the expected TEST-010 project.");
  }
  const budgetRows = records(exported.budget);
  if (!budgetRows.some((row) => row.id === BUDGET_ID)) {
    throw new Error("Safety stop: export does not contain the expected TEST-010 budget.");
  }
  const allocationRows = records((exported.allocations as Json | undefined)?.[PROJECT_CODE]);
  if (
    allocationRows.length !== 5 ||
    allocationRows.some((row) => row.projectId !== PROJECT_ID || typeof row.id !== "string")
  ) {
    throw new Error("Safety stop: export does not contain exactly five safe TEST-010 allocations.");
  }
  log("EXPORT VERIFIED", {
    path: EXPORT_PATH,
    sha256: actualChecksum,
    projectId: PROJECT_ID,
    budgetId: BUDGET_ID,
    allocationIds: allocationRows.map((row) => row.id),
  });
  return { allocationIds: allocationRows.map((row) => String(row.id)) };
}

async function main(): Promise<void> {
  let finalStatus = "STOPPED";
  try {
    const { allocationIds } = await verifyExport();
    const { accessToken, apiBase } = await getBqeAccessToken();
    log("SAFETY SCOPE", {
      projectCode: PROJECT_CODE,
      projectId: PROJECT_ID,
      budgetId: BUDGET_ID,
      allocationIds,
      deleteAttemptsAreSingleShot: true,
    });

    const allocationResults: Result[] = [];
    for (const allocationId of allocationIds) {
      allocationResults.push(await loggedRequest(
        accessToken,
        `STEP 1 DELETE ALLOCATION ${allocationId}`,
        "DELETE",
        endpoint(apiBase, `allocation/${allocationId}`),
      ));
    }
    if (allocationResults.some((result) => !result.ok)) {
      throw new Error("Safety stop: one or more allocation deletions failed; parent records were not touched.");
    }

    const assignmentTypes = ["resource", "activity"] as const;
    const assignmentDeleteResults: Result[] = [];
    for (const assignmentType of assignmentTypes) {
      const listUrl = new URL(endpoint(apiBase, `projectassignment/${assignmentType}`));
      listUrl.searchParams.set("where", `projectId='${PROJECT_ID}'`);
      const list = await loggedRequest(
        accessToken,
        `STEP 2 GET ${assignmentType.toUpperCase()} ASSIGNMENTS`,
        "GET",
        listUrl.toString(),
      );
      if (!list.ok && list.status !== 204) {
        throw new Error(`Safety stop: ${assignmentType} assignment discovery failed.`);
      }
      const assignments = records(list.body);
      log(`STEP 2 ${assignmentType.toUpperCase()} ASSIGNMENT IDS`, assignments.map((row) => row.id));
      for (const assignment of assignments) {
        if (assignment.projectId !== PROJECT_ID || typeof assignment.id !== "string") {
          throw new Error(`Safety stop: unexpected ${assignmentType} assignment target.`);
        }
        assignmentDeleteResults.push(await loggedRequest(
          accessToken,
          `STEP 2 DELETE ${assignmentType.toUpperCase()} ASSIGNMENT ${assignment.id}`,
          "DELETE",
          endpoint(apiBase, `projectassignment/${assignmentType}/${assignment.id}`),
        ));
      }
    }
    if (assignmentDeleteResults.some((result) => !result.ok)) {
      throw new Error("Safety stop: one or more assignment deletions failed; parent records were not touched.");
    }

    const projectGet = await loggedRequest(
      accessToken,
      "STEP 3 GET COMPLETE PROJECT",
      "GET",
      endpoint(apiBase, `project/${PROJECT_ID}`),
    );
    if (!projectGet.ok) throw new Error("Safety stop: complete project GET failed before unlink.");
    const project = records(projectGet.body)[0];
    if (!project || project.id !== PROJECT_ID || project.code !== PROJECT_CODE) {
      throw new Error("Safety stop: complete project GET did not match TEST-010.");
    }
    const unlinkBody: Json = { ...project, budgetId: null, budgetName: null };
    const unlink = await loggedRequest(
      accessToken,
      "STEP 3 UNLINK BUDGET",
      "PUT",
      endpoint(apiBase, `project/${PROJECT_ID}`),
      unlinkBody,
    );
    if (!unlink.ok) throw new Error(`Safety stop: budget unlink failed with HTTP ${unlink.status}.`);

    const budgetDelete = await loggedRequest(
      accessToken,
      "STEP 4 DELETE BUDGET",
      "DELETE",
      endpoint(apiBase, `budget/${BUDGET_ID}`),
    );
    if (!budgetDelete.ok) {
      throw new Error(`STOP: budget deletion refused with HTTP ${budgetDelete.status}: ${budgetDelete.bodyText}`);
    }

    const projectDelete = await loggedRequest(
      accessToken,
      "STEP 5 DELETE PROJECT",
      "DELETE",
      endpoint(apiBase, `project/${PROJECT_ID}`),
    );
    if (!projectDelete.ok) {
      throw new Error(`STOP: project deletion refused with HTTP ${projectDelete.status}: ${projectDelete.bodyText}`);
    }

    const verifyProjectUrl = new URL(endpoint(apiBase, "project"));
    verifyProjectUrl.searchParams.set("where", `code='${PROJECT_CODE}'`);
    const verifyProject = await loggedRequest(
      accessToken,
      "STEP 6 VERIFY TEST-010 BY CODE",
      "GET",
      verifyProjectUrl.toString(),
    );
    const verifyBudget = await loggedRequest(
      accessToken,
      "STEP 6 VERIFY BUDGET BY ID",
      "GET",
      endpoint(apiBase, `budget/${BUDGET_ID}`),
    );

    const sweep: Array<{ code: string; status: number; count: number; ids: unknown[] }> = [];
    for (const code of CODES) {
      const url = new URL(endpoint(apiBase, "project"));
      url.searchParams.set("where", `code='${code}'`);
      const result = await loggedRequest(
        accessToken,
        `STEP 6 SWEEP ${code}`,
        "GET",
        url.toString(),
      );
      const matches = records(result.body);
      sweep.push({ code, status: result.status, count: matches.length, ids: matches.map((row) => row.id) });
    }
    log("STEP 6 FINAL VERIFICATION", {
      test010Status: verifyProject.status,
      test010Count: records(verifyProject.body).length,
      budgetStatus: verifyBudget.status,
      budgetCount: records(verifyBudget.body).length,
      sweep,
      zeroTestProjectsRemain: sweep.every((entry) => entry.count === 0),
      expectedMissingStatuses:
        [verifyProject.status, verifyBudget.status, ...sweep.map((entry) => entry.status)]
          .every((status) => status === 204 || status === 404),
    });
    finalStatus = "COMPLETED AND VERIFIED";
  } catch (error) {
    log("STOP REASON", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    log("FINAL STATUS", finalStatus);
    await mkdir("logs", { recursive: true });
    await writeFile(LOG_PATH, `${logLines.join("\n\n")}\n`, "utf8");
    console.log(`LOG FILE\n${LOG_PATH}`);
  }
}

void main();