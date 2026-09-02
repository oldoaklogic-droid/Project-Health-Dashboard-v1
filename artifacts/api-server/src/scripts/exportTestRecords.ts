import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { getBqeAccessToken } from "../lib/bqe";

type Json = Record<string, unknown>;
type ResponseResult = {
  status: number;
  records: Json[];
  error: string | null;
};

const BUDGET_ID = "5c711177-29c0-472c-b121-d7937470b541";
const CODES = Array.from({ length: 10 }, (_, index) => `TEST-${String(index + 1).padStart(3, "0")}`);
const PAGE_SIZE = 100;
const OUTPUT_PATH = "../../data/test-records-export.json";
const CHECKSUM_PATH = "../../data/test-records-export.json.sha256";
let nextRequestAt = 0;

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

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function idOf(record: Json): string | null {
  return text(record.id);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function get(accessToken: string, url: string): Promise<ResponseResult> {
  const delay = Math.max(0, nextRequestAt - Date.now());
  if (delay) await sleep(delay);
  nextRequestAt = Date.now() + 700;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
    },
  });
  const bodyText = await response.text();
  if (response.status === 204) return { status: 204, records: [], error: null };
  if (!response.ok) {
    return {
      status: response.status,
      records: [],
      error: bodyText || `HTTP ${response.status}`,
    };
  }
  if (!bodyText) return { status: response.status, records: [], error: null };
  try {
    return { status: response.status, records: records(JSON.parse(bodyText)), error: null };
  } catch {
    return { status: response.status, records: [], error: "Response was not valid JSON." };
  }
}

async function getAll(
  accessToken: string,
  apiBase: string,
  path: string,
  where: string,
): Promise<ResponseResult> {
  const all: Json[] = [];
  for (let page = 1; page <= 1_000; page += 1) {
    const url = new URL(endpoint(apiBase, path));
    url.searchParams.set("page", `${page},${PAGE_SIZE}`);
    url.searchParams.set("where", where);
    const result = await get(accessToken, url.toString());
    console.log(`GET ${path} page ${page} -> ${result.status}, ${result.records.length} record(s)`);
    if (result.error) return { ...result, records: all };
    all.push(...result.records);
    if (result.status === 204 || result.records.length < PAGE_SIZE) {
      return { status: result.status, records: all, error: null };
    }
  }
  return { status: 0, records: all, error: `${path} exceeded pagination safety limit.` };
}

async function main(): Promise<void> {
  const { accessToken, apiBase } = await getBqeAccessToken();
  console.log("TARGETED TEST EXPORT — READ ONLY");

  const projectLookups: Record<string, ResponseResult> = {};
  const projectsByCode: Record<string, Json[]> = {};
  for (const code of CODES) {
    const result = await getAll(accessToken, apiBase, "project", `code='${code}'`);
    projectLookups[code] = result;
    projectsByCode[code] = result.records;
  }

  const foundProjects = Object.entries(projectsByCode)
    .flatMap(([requestedCode, projectRecords]) =>
      projectRecords.map((model) => ({ requestedCode, model }))
    );

  const budgetResult = await get(accessToken, endpoint(apiBase, `budget/${BUDGET_ID}`));
  console.log(`GET budget/${BUDGET_ID} -> ${budgetResult.status}, ${budgetResult.records.length} record(s)`);
  const customBudgetsResult = await getAll(
    accessToken,
    apiBase,
    "budget",
    "isCustomBudget=true",
  );
  const testBudgets = customBudgetsResult.records.filter((budget) =>
    /test/i.test(text(budget.name) ?? "")
  );

  const invoices: Record<string, Json[]> = {};
  const payments: Record<string, Json[]> = {};
  const allocations: Record<string, Json[]> = {};
  const timeEntries: Record<string, Json[]> = {};
  const relatedRequests: Record<string, Record<string, Pick<ResponseResult, "status" | "error">>> = {};

  for (const { requestedCode, model } of foundProjects) {
    const projectId = idOf(model);
    if (!projectId) throw new Error(`${requestedCode} project model has no id.`);
    const requests = {
      invoices: await getAll(
        accessToken,
        apiBase,
        "invoice",
        `invoiceDetails.projectId='${projectId}'`,
      ),
      payments: await getAll(accessToken, apiBase, "payment", `projectId='${projectId}'`),
      allocations: await getAll(accessToken, apiBase, "allocation", `projectId='${projectId}'`),
      timeEntries: await getAll(accessToken, apiBase, "timeentry", `projectId='${projectId}'`),
    };
    invoices[requestedCode] = requests.invoices.records;
    payments[requestedCode] = requests.payments.records;
    allocations[requestedCode] = requests.allocations.records;
    timeEntries[requestedCode] = requests.timeEntries.records;
    relatedRequests[requestedCode] = Object.fromEntries(
      Object.entries(requests).map(([type, result]) => [
        type,
        { status: result.status, error: result.error },
      ]),
    );
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    phase: "TARGETED READ ONLY",
    deletionPerformed: false,
    codeLookups: CODES.map((code) => ({
      code,
      status: projectLookups[code].status,
      returnedRecord: projectLookups[code].records.length > 0,
      ids: projectLookups[code].records.map(idOf).filter(Boolean),
      error: projectLookups[code].error,
    })),
    projects: foundProjects.map(({ requestedCode, model }) => ({
      code: requestedCode,
      id: idOf(model),
      name: text(model.name),
    })),
    budget: budgetResult.records.map((budget) => ({
      id: idOf(budget),
      name: text(budget.name),
      serviceCount: Array.isArray(budget.services) ? budget.services.length : null,
    })),
    testCustomBudgets: testBudgets.map((budget) => ({
      id: idOf(budget),
      name: text(budget.name),
      serviceCount: Array.isArray(budget.services) ? budget.services.length : null,
    })),
    relatedCounts: Object.fromEntries(foundProjects.map(({ requestedCode }) => [
      requestedCode,
      {
        invoices: invoices[requestedCode].length,
        payments: relatedRequests[requestedCode].payments.error ? null : payments[requestedCode].length,
        allocations: allocations[requestedCode].length,
        timeEntries: timeEntries[requestedCode].length,
      },
    ])),
    relatedRequests,
  };

  const output = {
    manifest,
    projectLookups,
    projects: projectsByCode,
    budget: budgetResult.records,
    testCustomBudgets: testBudgets,
    invoices,
    payments,
    allocations,
    timeEntries,
  };
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  const checksum = createHash("sha256").update(serialized).digest("hex");
  await mkdir("../../data", { recursive: true });
  await writeFile(OUTPUT_PATH, serialized, "utf8");
  await writeFile(CHECKSUM_PATH, `${checksum}  test-records-export.json\n`, "utf8");
  console.log(JSON.stringify(manifest, null, 2));
  console.log(`SHA256 ${checksum}`);
  console.log("COMPLETE — NO RECORDS DELETED.");
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});