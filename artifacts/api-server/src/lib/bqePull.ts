import { createHash, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import {
  bqeActivitiesTable,
  bqeBudgetsTable,
  bqeInvoicesTable,
  bqePaymentsTable,
  bqeProjectsTable,
  bqePullRunsTable,
  bqeReconciliationTable,
  bqeTimeEntriesTable,
  db,
} from "@workspace/db";
import {
  BqeConnectionError,
  getBqeAccessToken,
  type BqeAccessToken,
} from "./bqe";
import { logger } from "./logger";

const PAGE_SIZE = 100;
const FIRST_PAGE = 1;
const MAX_PAGES_PER_OBJECT = 10_000;
const RATE_LIMIT = 80;
const RATE_WINDOW_MS = 60_000;
const REPORTING_YEAR = 2026;
const YEAR_START = "2026-01-01";
const YEAR_END = "2027-01-01";
const PROJECT_CODES = ["23-0091", "23-0147", "24-0022"] as const;

export const BQE_OBJECT_TYPES = [
  "project",
  "timeentry",
  "activity",
  "budget",
  "invoice",
  "payment",
] as const;
export type BqeObjectType = (typeof BQE_OBJECT_TYPES)[number];

type BqeRecord = Record<string, unknown>;
type PullStatus = "completed" | "partial" | "failed";

export type BqeReconciliationSummary = {
  pullRunId: string;
  completedAt: string;
  reportingYear: number;
  asOfDate: string;
  objectCounts: Record<BqeObjectType, number>;
  total2026Hours: number;
  excludedFutureHours: number;
  total2026InvoicedAmount: number;
  total2026PaymentsReceived: number;
  perProject: Record<
    (typeof PROJECT_CODES)[number],
    {
      hours: number;
      invoicedAmount: number;
      paymentsReceived: number;
    }
  >;
};

export type BqePullResult = {
  pullRunId: string;
  status: PullStatus;
  startedAt: string;
  completedAt: string;
  objectCounts: Record<BqeObjectType, number>;
  errors: Partial<Record<BqeObjectType, string>> & { reconciliation?: string };
  reconciliation: BqeReconciliationSummary | null;
};

type FieldConfig = {
  endpoint: BqeObjectType;
  fields: string[];
  dateFilter: boolean;
};

const FIELD_CONFIG: Record<BqeObjectType, FieldConfig> = {
  project: {
    endpoint: "project",
    fields: [
      "id",
      "code",
      "name",
      "client",
      "status",
      "contractType",
      "contractAmount",
      "manager",
    ],
    dateFilter: false,
  },
  timeentry: {
    endpoint: "timeentry",
    fields: [
      "id",
      "date",
      "resource",
      "resourceId",
      "project",
      "projectId",
      "activity",
      "activityId",
      "actualHours",
      "billable",
      "billRate",
      "costRate",
    ],
    dateFilter: true,
  },
  activity: {
    endpoint: "activity",
    fields: [
      "id",
      "code",
      "name",
      "isActive",
      "billable",
      "billRate",
      "costRate",
      "overTimeBillRate",
    ],
    dateFilter: false,
  },
  budget: {
    endpoint: "budget",
    fields: [
      "id",
      "name",
      "date",
      "employee",
      "employeeId",
      "services",
      "serviceSummary",
      "expenses",
      "expenseSummary",
      "status",
    ],
    dateFilter: false,
  },
  invoice: {
    endpoint: "invoice",
    fields: [
      "id",
      "invoiceNumber",
      "date",
      "invoiceAmount",
      "balance",
      "invoiceDetails",
      "lineItems",
    ],
    dateFilter: true,
  },
  payment: {
    endpoint: "payment",
    fields: [
      "id",
      "date",
      "amount",
      "project",
      "projectId",
      "method",
      "reference",
      "lineItems",
    ],
    dateFilter: true,
  },
};

class BqeRateLimiter {
  private readonly requestTimes: number[] = [];

  async acquire(): Promise<void> {
    while (true) {
      const now = Date.now();
      while (this.requestTimes.length > 0 && now - this.requestTimes[0] >= RATE_WINDOW_MS) {
        this.requestTimes.shift();
      }
      if (this.requestTimes.length < RATE_LIMIT) {
        this.requestTimes.push(now);
        return;
      }
      const waitMs = RATE_WINDOW_MS - (now - this.requestTimes[0]) + 10;
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

const rateLimiter = new BqeRateLimiter();
let pullInFlight: Promise<BqePullResult> | null = null;

class BqePullHttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "BqePullHttpError";
  }
}

function isRecord(value: unknown): value is BqeRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function getValue(record: BqeRecord, aliases: string[]): unknown {
  for (const alias of aliases) {
    let current: unknown = record;
    for (const segment of alias.split(".")) {
      if (!isRecord(current)) {
        current = undefined;
        break;
      }
      const key = Object.keys(current).find(
        (candidate) => normalizedKey(candidate) === normalizedKey(segment),
      );
      current = key ? current[key] : undefined;
    }
    if (current !== undefined && current !== null) {
      return current;
    }
  }
  return null;
}

function textValue(value: unknown): string | null {
  if (typeof value === "string") {
    const result = value.trim();
    return result || null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (isRecord(value)) {
    return textValue(
      value.name ??
        value.code ??
        value.number ??
        value.fullName ??
        value.id ??
        value.value,
    );
  }
  return null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.replace(/[$,\s]/g, "").trim();
  if (!cleaned) {
    return null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function rounded(value: number, decimalPlaces = 2): number {
  const factor = 10 ** decimalPlaces;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function recordArray(value: unknown): BqeRecord[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  return isRecord(value) ? [value] : [];
}

function numericText(value: unknown): string | null {
  const number = numberValue(value);
  return number === null ? null : String(number);
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "y", "1", "billable", "active"].includes(normalized)) {
      return true;
    }
    if (["false", "no", "n", "0", "nonbillable", "inactive"].includes(normalized)) {
      return false;
    }
  }
  return null;
}

function dateValue(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }
  const input = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return input;
  }
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function recordId(record: BqeRecord, objectType: BqeObjectType): string {
  const explicitId = textValue(
    getValue(record, [
      "id",
      "uuid",
      "_id",
      `${objectType}Id`,
      "recordId",
      "code",
      "number",
    ]),
  );
  if (explicitId) {
    return explicitId;
  }
  const digest = createHash("sha256").update(JSON.stringify(record)).digest("hex");
  return `${objectType}:${digest}`;
}

function extractRecords(payload: unknown): BqeRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }
  if (!isRecord(payload)) {
    return [];
  }
  for (const key of ["data", "items", "records", "results", "value"]) {
    const candidate = payload[key];
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord);
    }
    if (isRecord(candidate)) {
      const nested = extractRecords(candidate);
      if (nested.length > 0) {
        return nested;
      }
    }
  }
  if (
    ["id", "uuid", "code", "number", "name"].some((key) =>
      Object.keys(payload).some((candidate) => normalizedKey(candidate) === key),
    )
  ) {
    return [payload];
  }
  return [];
}

function mergePageRecords(
  objectType: BqeObjectType,
  batches: BqeRecord[][],
): BqeRecord[] {
  const merged = new Map<string, BqeRecord>();
  for (const batch of batches) {
    for (const record of batch) {
      const id = recordId(record, objectType);
      merged.set(id, { ...(merged.get(id) ?? {}), ...record });
    }
  }
  return [...merged.values()];
}

async function fetchBqePage(
  connection: BqeAccessToken,
  config: FieldConfig,
  page: number,
  fields: string[],
): Promise<BqeRecord[]> {
  await rateLimiter.acquire();
  const url = new URL(
    `${connection.apiBase.replace(/\/+$/, "")}/${config.endpoint}`,
  );
  url.searchParams.set("page", `${page},${PAGE_SIZE}`);
  if (fields.length > 0) {
    url.searchParams.set("fields", fields.join(","));
  }
  if (config.dateFilter) {
    url.searchParams.set(
      "where",
      `date >= '${YEAR_START}T00:00:00' AND date < '${YEAR_END}T00:00:00'`,
    );
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${connection.accessToken}`,
    },
  });
  const body = await response.text();
  let payload: unknown = null;
  try {
    payload = JSON.parse(body);
  } catch {
    payload = null;
  }

  if (response.status === 207 && fields.length > 1) {
    const nonIdFields = fields.filter((field) => normalizedKey(field) !== "id");
    if (nonIdFields.length <= 1) {
      return extractRecords(payload);
    }
    const midpoint = Math.ceil(nonIdFields.length / 2);
    const left = await fetchBqePage(connection, config, page, [
      "id",
      ...nonIdFields.slice(0, midpoint),
    ]);
    const right = await fetchBqePage(connection, config, page, [
      "id",
      ...nonIdFields.slice(midpoint),
    ]);
    return mergePageRecords(config.endpoint, [left, right]);
  }
  if (!response.ok) {
    throw new BqePullHttpError(
      response.status,
      `BQE ${config.endpoint} request failed with HTTP ${response.status}.`,
    );
  }
  return extractRecords(payload);
}

export async function fetchBqeRecordsForObject(
  connection: BqeAccessToken,
  objectType: BqeObjectType,
): Promise<BqeRecord[]> {
  const config = FIELD_CONFIG[objectType];
  const records: BqeRecord[] = [];
  const seenPageSignatures = new Set<string>();
  for (let page = FIRST_PAGE; page < FIRST_PAGE + MAX_PAGES_PER_OBJECT; page += 1) {
    const pageRecords = await fetchBqePage(connection, config, page, config.fields);
    const signature = createHash("sha256")
      .update(
        pageRecords
          .map((record) => recordId(record, config.endpoint))
          .sort()
          .join("\n"),
      )
      .digest("hex");
    if (pageRecords.length > 0 && seenPageSignatures.has(signature)) {
      throw new Error(
        `BQE ${config.endpoint} pagination repeated a page; the pull was stopped safely.`,
      );
    }
    seenPageSignatures.add(signature);
    records.push(...pageRecords);
    logger.info(
      { objectType: config.endpoint, page, pageCount: pageRecords.length },
      "BQE pull page completed",
    );
    if (pageRecords.length < PAGE_SIZE) {
      return records;
    }
  }
  throw new Error(`BQE ${config.endpoint} pagination exceeded the safety limit.`);
}

function asRawJson(record: BqeRecord): Record<string, unknown> {
  return record;
}

async function upsertRows(
  table:
    | typeof bqeProjectsTable
    | typeof bqeTimeEntriesTable
    | typeof bqeActivitiesTable
    | typeof bqeBudgetsTable
    | typeof bqeInvoicesTable
    | typeof bqePaymentsTable,
  rows: Record<string, unknown>[],
): Promise<void> {
  const tableWithRecordId = table as typeof bqeProjectsTable;
  for (let offset = 0; offset < rows.length; offset += 250) {
    const chunk = rows.slice(offset, offset + 250);
    const set = Object.fromEntries(
      Object.keys(chunk[0] ?? {})
        .filter((key) => key !== "recordId")
        .map((key) => {
          const column = (tableWithRecordId as unknown as Record<string, { name: string }>)[key];
          return [key, sql.raw(`excluded."${column.name}"`)];
        }),
    );
    await db
      .insert(table)
      .values(chunk as never)
      .onConflictDoUpdate({
        target: tableWithRecordId.recordId,
        set: set as never,
      });
  }
}

async function persistProjects(records: BqeRecord[], pulledAt: Date): Promise<number> {
  const rows = records.map((record) => ({
    recordId: recordId(record, "project"),
    pulledAt,
    rawJson: asRawJson(record),
    code: textValue(getValue(record, ["code", "projectCode", "number"])),
    name: textValue(getValue(record, ["name", "projectName"])),
    client: textValue(getValue(record, ["client", "clientName", "client.name"])),
    status: textValue(getValue(record, ["status", "projectStatus"])),
    contractType: textValue(getValue(record, ["contractType", "contract.type"])),
    contractAmount: numericText(
      getValue(record, ["contractAmount", "contractValue", "contract.amount"]),
    ),
    manager: textValue(
      getValue(record, ["manager", "projectManager", "pm", "manager.name"]),
    ),
  }));
  await upsertRows(bqeProjectsTable, rows);
  return rows.length;
}

async function persistTimeEntries(records: BqeRecord[], pulledAt: Date): Promise<number> {
  const rows = records.map((record) => ({
    recordId: recordId(record, "timeentry"),
    pulledAt,
    rawJson: asRawJson(record),
    entryDate: dateValue(getValue(record, ["date", "entryDate", "timeEntryDate"])),
    employee: textValue(
      getValue(record, ["resource", "resourceName", "resource.name", "employee"]),
    ),
    projectId: textValue(getValue(record, ["projectId", "project.id", "projectId.value"])),
    projectCode: textValue(getValue(record, ["projectCode", "project.code", "project.number"])),
    activityId: textValue(getValue(record, ["activityId", "activity.id"])),
    activityCode: textValue(getValue(record, ["activityCode", "activity.code"])),
    hours: numericText(getValue(record, ["actualHours", "hours", "duration", "totalHours"])),
    billable: booleanValue(getValue(record, ["billable", "isBillable"])),
    billRate: numericText(getValue(record, ["billRate", "billingRate", "rate"])),
    costRate: numericText(getValue(record, ["costRate", "laborCostRate", "cost"])),
  }));
  await upsertRows(bqeTimeEntriesTable, rows);
  return rows.length;
}

async function persistActivities(records: BqeRecord[], pulledAt: Date): Promise<number> {
  const rows = records.map((record) => ({
    recordId: recordId(record, "activity"),
    pulledAt,
    rawJson: asRawJson(record),
    code: textValue(getValue(record, ["code", "activityCode", "number"])),
    name: textValue(getValue(record, ["name", "activityName"])),
    active: booleanValue(getValue(record, ["active", "isActive"])),
    billable: booleanValue(getValue(record, ["billable", "isBillable"])),
    rates: {
      billRate: numberValue(getValue(record, ["billRate"])),
      costRate: numberValue(getValue(record, ["costRate"])),
      overTimeBillRate: numberValue(getValue(record, ["overTimeBillRate"])),
    },
  }));
  await upsertRows(bqeActivitiesTable, rows);
  return rows.length;
}

async function persistBudgets(records: BqeRecord[], pulledAt: Date): Promise<number> {
  const rows = records.map((record) => {
    const services = getValue(record, ["services"]);
    const expenses = getValue(record, ["expenses"]);
    const lineItems = {
      services,
      serviceSummary: getValue(record, ["serviceSummary"]),
      expenses,
      expenseSummary: getValue(record, ["expenseSummary"]),
    };
    const firstDetail = [
      ...(Array.isArray(services) ? services : []),
      ...(Array.isArray(expenses) ? expenses : []),
    ].find(isRecord);
    const hours =
      numberValue(getValue(record, ["hours", "totalHours"])) ??
      (Array.isArray(services)
        ? services.reduce((total, item) => {
            return total + (numberValue(isRecord(item) ? getValue(item, ["hours", "budgetHours"]) : null) ?? 0);
          }, 0)
        : null);
    return {
      recordId: recordId(record, "budget"),
      pulledAt,
      rawJson: asRawJson(record),
      name: textValue(getValue(record, ["name", "budgetName"])),
      projectId: textValue(
        getValue(record, ["projectId", "project.id"]) ??
          (firstDetail ? getValue(firstDetail, ["projectId", "project.id"]) : null),
      ),
      projectCode: textValue(
        getValue(record, ["projectCode", "project.code", "project.number"]) ??
          (firstDetail
            ? getValue(firstDetail, ["projectCode", "project.code", "project.number"])
            : null),
      ),
      lineItems,
      totalHours: hours === null ? null : String(hours),
    };
  });
  await upsertRows(bqeBudgetsTable, rows);
  return rows.length;
}

async function persistInvoices(records: BqeRecord[], pulledAt: Date): Promise<number> {
  const rows = records.map((record) => {
    const details = getValue(record, ["invoiceDetails", "extendedAccountSplit"]);
    const firstDetail = Array.isArray(details) ? details.find(isRecord) : null;
    return {
      recordId: recordId(record, "invoice"),
      pulledAt,
      rawJson: asRawJson(record),
      invoiceNumber: textValue(getValue(record, ["invoiceNumber", "number", "invoiceNo"])),
      projectId: textValue(
        getValue(record, ["projectId", "project.id"]) ??
          (firstDetail ? getValue(firstDetail, ["projectId", "project.id"]) : null),
      ),
      projectCode: textValue(
        getValue(record, ["projectCode", "project.code", "project.number"]) ??
          (firstDetail
            ? getValue(firstDetail, ["projectCode", "project.code", "project.number"])
            : null),
      ),
      invoiceDate: dateValue(getValue(record, ["date", "invoiceDate"])),
      amount: numericText(getValue(record, ["invoiceAmount", "amount", "total"])),
      balance: numericText(getValue(record, ["balance", "outstandingBalance", "openBalance"])),
    };
  });
  await upsertRows(bqeInvoicesTable, rows);
  return rows.length;
}

async function persistPayments(records: BqeRecord[], pulledAt: Date): Promise<number> {
  const rows = records.map((record) => ({
    recordId: recordId(record, "payment"),
    pulledAt,
    rawJson: asRawJson(record),
    paymentDate: dateValue(getValue(record, ["date", "paymentDate"])),
    amount: numericText(getValue(record, ["amount", "paymentAmount", "total"])),
    projectId: textValue(getValue(record, ["projectId", "project.id"])),
    projectCode: textValue(getValue(record, ["projectCode", "project.code", "project.number"])),
    method: textValue(getValue(record, ["method", "paymentMethod", "type"])),
    reference: textValue(getValue(record, ["reference", "referenceNumber", "checkNumber"])),
  }));
  await upsertRows(bqePaymentsTable, rows);
  return rows.length;
}

async function persistObjectRecords(
  objectType: BqeObjectType,
  records: BqeRecord[],
  pulledAt: Date,
): Promise<number> {
  switch (objectType) {
    case "project":
      return persistProjects(records, pulledAt);
    case "timeentry":
      return persistTimeEntries(records, pulledAt);
    case "activity":
      return persistActivities(records, pulledAt);
    case "budget":
      return persistBudgets(records, pulledAt);
    case "invoice":
      return persistInvoices(records, pulledAt);
    case "payment":
      return persistPayments(records, pulledAt);
  }
}

function emptyObjectCounts(): Record<BqeObjectType, number> {
  return {
    project: 0,
    timeentry: 0,
    activity: 0,
    budget: 0,
    invoice: 0,
    payment: 0,
  };
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof BqeConnectionError || error instanceof BqePullHttpError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message.replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]");
  }
  return "BQE pull failed unexpectedly.";
}

function numberOrZero(value: string | null): number {
  const parsed = value === null ? NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function projectCodeFor(
  projectId: string | null,
  projectCode: string | null,
  projectById: Map<string, string>,
): string | null {
  return projectCode ?? (projectId ? projectById.get(projectId) ?? null : null);
}

export function reconcileBqeRecords(
  pullRunId: string,
  completedAt: Date,
  objectCounts: Record<BqeObjectType, number>,
  pulledRecords: Partial<Record<BqeObjectType, BqeRecord[]>>,
): BqeReconciliationSummary {
  const asOfDate = completedAt.toISOString().slice(0, 10);
  const projectById = new Map<string, string>();
  for (const project of pulledRecords.project ?? []) {
    const code = textValue(getValue(project, ["code", "projectCode", "number"]));
    if (code) {
      projectById.set(recordId(project, "project"), code);
    }
  }

  const perProject = Object.fromEntries(
    PROJECT_CODES.map((code) => [
      code,
      { hours: 0, invoicedAmount: 0, paymentsReceived: 0 },
    ]),
  ) as BqeReconciliationSummary["perProject"];
  let total2026Hours = 0;
  let excludedFutureHours = 0;
  let total2026InvoicedAmount = 0;
  let total2026PaymentsReceived = 0;
  const addProjectValue = (
    projectId: string | null,
    projectCode: string | null,
    field: keyof BqeReconciliationSummary["perProject"][(typeof PROJECT_CODES)[number]],
    amount: number,
  ) => {
    const code = projectCodeFor(projectId, projectCode, projectById);
    if (code && code in perProject) {
      perProject[code as (typeof PROJECT_CODES)[number]][field] += amount;
    }
  };
  const inReportingYear = (date: string | null) =>
    date !== null && date >= YEAR_START && date < YEAR_END;
  const inReportingPeriod = (date: string | null) =>
    date !== null && inReportingYear(date) && date <= asOfDate;
  const allocationRecords = (record: BqeRecord, aliases: string[]) => {
    for (const alias of aliases) {
      const records = recordArray(getValue(record, [alias]));
      if (records.length > 0) return records;
    }
    return [];
  };
  const addValidatedAllocations = (
    record: BqeRecord,
    aliases: string[],
    field: "invoicedAmount" | "paymentsReceived",
    headerAmount: number,
    fallbackProjectId: string | null,
    fallbackProjectCode: string | null,
  ) => {
    const allocations = allocationRecords(record, aliases).map((item) => ({
      projectId: textValue(getValue(item, ["projectId", "project.id"])),
      projectCode: textValue(
        getValue(item, ["projectCode", "project.code", "project.number"]),
      ),
      amount: numberValue(
        getValue(item, ["amount", "invoiceAmount", "paymentAmount"]),
      ),
    }));
    const validAllocations = allocations.filter(
      (allocation) =>
        allocation.amount !== null &&
        (allocation.projectId !== null || allocation.projectCode !== null),
    );
    const allocatedTotal = validAllocations.reduce(
      (sum, allocation) => sum + (allocation.amount ?? 0),
      0,
    );
    if (
      validAllocations.length > 0 &&
      Math.abs(rounded(allocatedTotal) - rounded(headerAmount)) <= 0.01
    ) {
      for (const allocation of validAllocations) {
        addProjectValue(
          allocation.projectId,
          allocation.projectCode,
          field,
          allocation.amount ?? 0,
        );
      }
      return;
    }
    addProjectValue(fallbackProjectId, fallbackProjectCode, field, headerAmount);
  };

  for (const entry of pulledRecords.timeentry ?? []) {
    const entryDate = dateValue(getValue(entry, ["date", "entryDate", "timeEntryDate"]));
    if (!inReportingYear(entryDate)) {
      continue;
    }
    const hours =
      numberValue(getValue(entry, ["actualHours", "hours", "billableHours"])) ?? 0;
    if (!inReportingPeriod(entryDate)) {
      excludedFutureHours += hours;
      continue;
    }
    total2026Hours += hours;
    addProjectValue(
      textValue(getValue(entry, ["projectId", "project.id"])),
      textValue(getValue(entry, ["projectCode", "project.code", "project.number"])),
      "hours",
      hours,
    );
  }
  for (const invoice of pulledRecords.invoice ?? []) {
    const invoiceDate = dateValue(getValue(invoice, ["date", "invoiceDate"]));
    if (!inReportingPeriod(invoiceDate)) {
      continue;
    }
    const amount =
      numberValue(getValue(invoice, ["invoiceAmount", "amount", "total"])) ?? 0;
    total2026InvoicedAmount += amount;
    addValidatedAllocations(
      invoice,
      ["invoiceDetails", "extendedAccountSplit", "lineItems"],
      "invoicedAmount",
      amount,
      textValue(getValue(invoice, ["projectId", "project.id"])),
      textValue(getValue(invoice, ["projectCode", "project.code", "project.number"])),
    );
  }
  for (const payment of pulledRecords.payment ?? []) {
    const paymentDate = dateValue(getValue(payment, ["date", "paymentDate"]));
    if (!inReportingPeriod(paymentDate)) {
      continue;
    }
    const amount =
      numberValue(getValue(payment, ["amount", "paymentAmount", "total"])) ?? 0;
    total2026PaymentsReceived += amount;
    addValidatedAllocations(
      payment,
      ["lineItems", "paymentDetails", "extendedAccountSplit"],
      "paymentsReceived",
      amount,
      textValue(getValue(payment, ["projectId", "project.id"])),
      textValue(getValue(payment, ["projectCode", "project.code", "project.number"])),
    );
  }

  total2026Hours = rounded(total2026Hours);
  excludedFutureHours = rounded(excludedFutureHours);
  total2026InvoicedAmount = rounded(total2026InvoicedAmount);
  total2026PaymentsReceived = rounded(total2026PaymentsReceived);
  for (const totals of Object.values(perProject)) {
    totals.hours = rounded(totals.hours);
    totals.invoicedAmount = rounded(totals.invoicedAmount);
    totals.paymentsReceived = rounded(totals.paymentsReceived);
  }

  const summary: BqeReconciliationSummary = {
    pullRunId,
    completedAt: completedAt.toISOString(),
    reportingYear: REPORTING_YEAR,
    asOfDate,
    objectCounts,
    total2026Hours,
    excludedFutureHours,
    total2026InvoicedAmount,
    total2026PaymentsReceived,
    perProject,
  };
  return summary;
}

async function persistReconciliation(
  summary: BqeReconciliationSummary,
  completedAt: Date,
): Promise<void> {
  await db
    .insert(bqeReconciliationTable)
    .values({
      id: 1,
      pullRunId: summary.pullRunId,
      completedAt,
      reportingYear: summary.reportingYear,
      asOfDate: summary.asOfDate,
      objectCounts: summary.objectCounts,
      total2026Hours: String(summary.total2026Hours),
      excludedFutureHours: String(summary.excludedFutureHours),
      total2026InvoicedAmount: String(summary.total2026InvoicedAmount),
      total2026PaymentsReceived: String(summary.total2026PaymentsReceived),
      perProject: summary.perProject,
    })
    .onConflictDoUpdate({
      target: bqeReconciliationTable.id,
      set: {
        pullRunId: summary.pullRunId,
        completedAt,
        reportingYear: summary.reportingYear,
        asOfDate: summary.asOfDate,
        objectCounts: summary.objectCounts,
        total2026Hours: String(summary.total2026Hours),
        excludedFutureHours: String(summary.excludedFutureHours),
        total2026InvoicedAmount: String(summary.total2026InvoicedAmount),
        total2026PaymentsReceived: String(summary.total2026PaymentsReceived),
        perProject: summary.perProject,
      },
    });
}

async function buildReconciliation(
  pullRunId: string,
  completedAt: Date,
  objectCounts: Record<BqeObjectType, number>,
  pulledRecords: Partial<Record<BqeObjectType, BqeRecord[]>>,
): Promise<BqeReconciliationSummary> {
  const summary = reconcileBqeRecords(
    pullRunId,
    completedAt,
    objectCounts,
    pulledRecords,
  );
  await persistReconciliation(summary, completedAt);
  return summary;
}

async function executePull(): Promise<BqePullResult> {
  const startedAt = new Date();
  const pullRunId = randomUUID();
  const objectCounts = emptyObjectCounts();
  const errors: BqePullResult["errors"] = {};
  const pulledRecords: Partial<Record<BqeObjectType, BqeRecord[]>> = {};

  await db.insert(bqePullRunsTable).values({
    id: pullRunId,
    startedAt,
    status: "running",
    objectCounts,
    errors,
  });

  let connection: BqeAccessToken | null = null;
  try {
    connection = await getBqeAccessToken();
  } catch (error) {
    const message = safeErrorMessage(error);
    for (const objectType of BQE_OBJECT_TYPES) {
      errors[objectType] = message;
    }
  }

  if (connection) {
    for (const objectType of BQE_OBJECT_TYPES) {
      logger.info({ objectType, pullRunId }, "BQE object pull started");
      try {
        const records = await fetchBqeRecordsForObject(connection, objectType);
        objectCounts[objectType] = await persistObjectRecords(objectType, records, startedAt);
        pulledRecords[objectType] = records;
        logger.info(
          { objectType, pullRunId, recordCount: objectCounts[objectType] },
          "BQE object pull completed",
        );
      } catch (error) {
        const message = safeErrorMessage(error);
        errors[objectType] = message;
        logger.error(
          {
            objectType,
            pullRunId,
            statusCode: error instanceof BqePullHttpError ? error.statusCode : undefined,
          },
          "BQE object pull failed",
        );
      }
    }
  }

  const completedAt = new Date();
  let reconciliation: BqeReconciliationSummary | null = null;
  let status: PullStatus = Object.keys(errors).length > 0 ? "partial" : "completed";
  try {
    reconciliation = await buildReconciliation(
      pullRunId,
      completedAt,
      objectCounts,
      pulledRecords,
    );
  } catch (error) {
    errors.reconciliation = safeErrorMessage(error);
    status = "failed";
    logger.error({ pullRunId }, "BQE reconciliation failed");
  }

  await db
    .update(bqePullRunsTable)
    .set({
      completedAt,
      status,
      objectCounts,
      errors,
    })
    .where(eq(bqePullRunsTable.id, pullRunId));

  return {
    pullRunId,
    status,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    objectCounts,
    errors: errors as BqePullResult["errors"],
    reconciliation,
  };
}

export function runBqePhase1Pull(): Promise<BqePullResult> {
  if (!pullInFlight) {
    pullInFlight = executePull().finally(() => {
      pullInFlight = null;
    });
  }
  return pullInFlight;
}

export async function getLatestBqeReconciliation(): Promise<BqeReconciliationSummary | null> {
  const [row] = await db
    .select()
    .from(bqeReconciliationTable)
    .where(eq(bqeReconciliationTable.id, 1));
  if (!row) {
    return null;
  }
  const asOfDate = row.asOfDate ?? row.completedAt.toISOString().slice(0, 10);
  let total2026Hours = numberOrZero(row.total2026Hours);
  let excludedFutureHours = numberOrZero(row.excludedFutureHours);
  const perProject = structuredClone(
    row.perProject as BqeReconciliationSummary["perProject"],
  );
  if (row.asOfDate === null || row.excludedFutureHours === null) {
    const persistedHours = await db.execute<{
      projectCode: string | null;
      includedHours: string | null;
      excludedFutureHours: string | null;
    }>(sql`
      SELECT
        COALESCE(te.project_code, bp.code) AS "projectCode",
        COALESCE(SUM(te.hours) FILTER (
          WHERE te.entry_date >= ${YEAR_START} AND te.entry_date <= ${asOfDate}
        ), 0) AS "includedHours",
        COALESCE(SUM(te.hours) FILTER (
          WHERE te.entry_date > ${asOfDate} AND te.entry_date < ${YEAR_END}
        ), 0) AS "excludedFutureHours"
      FROM bqe_time_entries te
      LEFT JOIN bqe_projects bp ON bp.record_id = te.project_id
      WHERE te.entry_date >= ${YEAR_START} AND te.entry_date < ${YEAR_END}
      GROUP BY COALESCE(te.project_code, bp.code)
    `);
    total2026Hours = rounded(
      persistedHours.rows.reduce(
        (sum, hours) => sum + numberOrZero(hours.includedHours),
        0,
      ),
    );
    excludedFutureHours = rounded(
      persistedHours.rows.reduce(
        (sum, hours) => sum + numberOrZero(hours.excludedFutureHours),
        0,
      ),
    );
    for (const project of Object.values(perProject)) {
      project.hours = 0;
    }
    for (const hours of persistedHours.rows) {
      if (hours.projectCode && hours.projectCode in perProject) {
        perProject[hours.projectCode as keyof typeof perProject].hours = rounded(
          numberOrZero(hours.includedHours),
        );
      }
    }
  }
  return {
    pullRunId: row.pullRunId,
    completedAt: row.completedAt.toISOString(),
    reportingYear: row.reportingYear ?? REPORTING_YEAR,
    asOfDate,
    objectCounts: row.objectCounts as Record<BqeObjectType, number>,
    total2026Hours,
    excludedFutureHours,
    total2026InvoicedAmount: numberOrZero(row.total2026InvoicedAmount),
    total2026PaymentsReceived: numberOrZero(row.total2026PaymentsReceived),
    perProject,
  };
}