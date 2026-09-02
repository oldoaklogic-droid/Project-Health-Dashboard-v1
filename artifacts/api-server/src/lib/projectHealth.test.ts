import assert from "node:assert/strict";
import test from "node:test";
import {
  activeExternalRoots,
  calculatePortfolioAr,
  snapshotAsOf,
  evaluateHealth,
  isBqeProjectActive,
  isValidHealthCondition,
  type HealthMetrics,
} from "./projectHealth";

const makeRule = (
  id: string,
  name: string,
  severity: "red" | "yellow" | "gray",
  condition: Record<string, unknown>,
) => ({ id, name, severity, condition, active: true });

const rules = [
  makeRule("1", "Budget red", "red", { type: "budget_burn", minExclusive: 0.95, percentCompleteMaxExclusive: 80, requiresBudget: true }),
  makeRule("2", "Activity red", "red", { type: "activity_variance", minExclusive: 0.25, requiresBudget: true }),
  makeRule("3", "WIP red", "red", { type: "unbilled_age", minExclusive: 60 }),
  makeRule("4", "AR red", "red", { type: "invoice_past_due", minExclusive: 60 }),
  makeRule("5", "Note red", "red", { type: "pm_note_age", minExclusive: 30 }),
  makeRule("6", "Contact red", "red", { type: "client_contact_age", minExclusive: 30, activeOnly: true }),
  makeRule("7", "Fee red", "red", { type: "fee_exhausted" }),
  makeRule("8", "Time red", "red", { type: "time_entry_age", minExclusive: 30 }),
  makeRule("9", "Budget yellow", "yellow", { type: "budget_burn", minInclusive: 0.8, maxInclusive: 0.95, percentCompleteMaxExclusive: 80, requiresBudget: true }),
  makeRule("10", "Activity yellow", "yellow", { type: "activity_variance", minInclusive: 0.1, maxInclusive: 0.25, requiresBudget: true }),
  makeRule("11", "WIP yellow", "yellow", { type: "unbilled_age", minInclusive: 30, maxInclusive: 60 }),
  makeRule("12", "AR yellow", "yellow", { type: "invoice_past_due", minInclusive: 30, maxInclusive: 60 }),
  makeRule("13", "Note yellow", "yellow", { type: "pm_note_age", minInclusive: 14, maxInclusive: 30 }),
  makeRule("14", "Fee yellow", "yellow", { type: "fee_remaining", maxExclusive: 5000 }),
  makeRule("15", "Inactive gray", "gray", { type: "dual_inactivity", minExclusive: 90 }),
];

const base: HealthMetrics = {
  contractAmount: 20_000,
  actualHours: 50,
  budgetHours: 100,
  budgetBurn: 0.5,
  percentComplete: 80,
  invoicedAmount: 5_000,
  feeRemaining: 15_000,
  arTotal: 0,
  arOver60: 0,
  oldestPastDueDays: 0,
  wipHours: 0,
  wipEstimate: 0,
  wipAgeDays: 0,
  daysSinceLastTime: 0,
  daysSinceLastInvoice: 0,
  daysSinceLastPmNote: 0,
  daysSinceLastContact: 0,
  activities: [],
};

test("all 15 Stage 1 rules are represented", () => {
  assert.equal(rules.length, 15);
});

test("budget thresholds honor percent complete and missing budgets are unknown", () => {
  assert.equal(evaluateHealth({ ...base, budgetBurn: 0.8, percentComplete: 79 }, rules).severity, "yellow");
  assert.equal(evaluateHealth({ ...base, budgetBurn: 0.95, percentComplete: 79 }, rules).severity, "yellow");
  assert.equal(evaluateHealth({ ...base, budgetBurn: 0.951, percentComplete: 79 }, rules).severity, "red");
  assert.equal(evaluateHealth({ ...base, budgetBurn: 1.1, percentComplete: 80 }, rules).severity, "red");
  const missing = evaluateHealth({ ...base, budgetHours: null, budgetBurn: null }, rules);
  assert.equal(missing.severity, "green");
  assert.equal(missing.results.filter((result) => result.result === "unknown").length, 4);
});

test("missing percent complete gates progress-dependent rules but not absolute budget overrun", () => {
  const missingProgress = evaluateHealth({
    ...base,
    percentComplete: null,
    budgetBurn: 0.96,
    activities: [{ code: "S-1", name: "Survey", planned: 10, actual: 13, variance: 3, variancePercent: 0.3 }],
    feeRemaining: 1_000,
  }, rules);
  assert.equal(missingProgress.severity, "green");
  assert.deepEqual(
    missingProgress.results.filter((result) => result.result === "unknown").map((result) => result.name).sort(),
    ["Activity red", "Activity yellow", "Budget red", "Budget yellow", "Fee yellow"].sort(),
  );

  const absoluteOverrun = evaluateHealth({ ...base, percentComplete: null, budgetBurn: 1.01 }, rules);
  assert.equal(absoluteOverrun.severity, "red");
  assert.equal(absoluteOverrun.results.find((result) => result.name === "Budget red")?.result, "triggered");
});

test("activity, WIP, invoice, note, contact, and fee thresholds preserve severity precedence", () => {
  assert.equal(evaluateHealth({
    ...base,
    activities: [{ code: "S-1", name: "Survey", planned: 10, actual: 12.5, variance: 2.5, variancePercent: 0.25 }],
  }, rules).severity, "yellow");
  assert.equal(evaluateHealth({
    ...base,
    activities: [{ code: "S-1", name: "Survey", planned: 10, actual: 12.6, variance: 2.6, variancePercent: 0.26 }],
  }, rules).severity, "red");
  assert.equal(evaluateHealth({ ...base, wipHours: 1, wipAgeDays: 60 }, rules).severity, "yellow");
  assert.equal(evaluateHealth({ ...base, wipHours: 1, wipAgeDays: 61 }, rules).severity, "red");
  assert.equal(evaluateHealth({ ...base, arTotal: 100, oldestPastDueDays: 30 }, rules).severity, "yellow");
  assert.equal(evaluateHealth({ ...base, arTotal: 100, oldestPastDueDays: 61 }, rules).severity, "red");
  assert.equal(evaluateHealth({ ...base, daysSinceLastPmNote: 14 }, rules).severity, "yellow");
  assert.equal(evaluateHealth({ ...base, daysSinceLastPmNote: 31 }, rules).severity, "red");
  assert.equal(evaluateHealth({ ...base, daysSinceLastContact: 31 }, rules).severity, "red");
  assert.equal(evaluateHealth({
    ...base,
    invoicedAmount: 20_000,
    feeRemaining: 0,
    percentComplete: 99,
    daysSinceLastTime: 31,
  }, rules).severity, "red");
  assert.equal(evaluateHealth({
    ...base,
    invoicedAmount: 20_000,
    feeRemaining: 0,
    percentComplete: null,
    daysSinceLastTime: 30,
  }, rules).severity, "red");
  assert.equal(evaluateHealth({
    ...base,
    invoicedAmount: 20_000,
    feeRemaining: 0,
    percentComplete: null,
    daysSinceLastTime: 31,
  }, rules).results.find((result) => result.name === "Fee red")?.result, "clear");
  assert.equal(evaluateHealth({ ...base, feeRemaining: 4_999 }, rules).severity, "yellow");
});

test("fee exhausted is unknown when no positive contract amount is on file", () => {
  const metrics = {
    ...base,
    contractAmount: 0,
    invoicedAmount: 100,
    percentComplete: 50,
  };
  const evaluation = evaluateHealth({ ...metrics, active: true }, [
    makeRule("fee", "Fee exhausted", "red", { type: "fee_exhausted" }),
  ]);
  assert.equal(evaluation.severity, "green");
  assert.equal(evaluation.results[0]?.result, "unknown");
});

test("time inactivity is red at 31 days and dual 90-day inactivity is gray only without red", () => {
  assert.equal(evaluateHealth({ ...base, daysSinceLastTime: 31 }, rules).severity, "red");
  const grayOnlyRules = rules.filter((rule) => rule.severity === "gray");
  assert.equal(evaluateHealth({ ...base, daysSinceLastTime: 91, daysSinceLastInvoice: 91 }, grayOnlyRules).severity, "gray");
});

test("missing Stage 1 history is explicit unknown and active-only rules ignore inactive projects", () => {
  const missing = evaluateHealth({
    ...base,
    daysSinceLastTime: null,
    daysSinceLastInvoice: null,
    daysSinceLastPmNote: null,
    daysSinceLastContact: null,
  }, rules);
  assert.equal(missing.severity, "green");
  assert.deepEqual(
    missing.results.filter((result) => result.result === "unknown").map((result) => result.name).sort(),
    ["Contact red", "Inactive gray", "Note red", "Note yellow", "Time red"].sort(),
  );
  const activeOnlyRules = rules.filter((rule) => rule.condition.activeOnly === true);
  assert.equal(
    evaluateHealth({
      ...base,
      active: false,
      daysSinceLastTime: 31,
      daysSinceLastInvoice: 91,
      daysSinceLastContact: 31,
    }, activeOnlyRules).severity,
    "green",
  );
});

test("BQE status and editable rule conditions are validated", () => {
  assert.equal(isBqeProjectActive("0"), true);
  assert.equal(isBqeProjectActive("Active"), false);
  assert.equal(isBqeProjectActive("2"), false);
  assert.equal(isValidHealthCondition({ type: "time_entry_age", minExclusive: 30, activeOnly: true }), true);
  assert.equal(isValidHealthCondition({ type: "unsupported", minExclusive: 30 }), false);
  assert.equal(isValidHealthCondition({ type: "budget_burn", minExclusive: "80" }), false);
  assert.equal(isValidHealthCondition({ type: "fee_remaining" }), false);
});

test("active external roots require exact BQE status, root shape, and non-internal non-test client", () => {
  const projects = [
    { recordId: "one", code: "26-1", status: "0", parentId: null, rootProjectId: null, client: "External" },
    { recordId: "two", code: "TEST-1", status: "0", parentId: null, rootProjectId: null, client: "External" },
    { recordId: "three", code: "26-3", status: "Active", parentId: null, rootProjectId: null, client: "External" },
    { recordId: "four", code: "26-4", status: "0", parentId: "one", rootProjectId: "one", client: "External" },
    { recordId: "five", code: "26-5", status: "0", parentId: null, rootProjectId: null, client: " Complete Design, Inc. " },
  ] as any[];
  assert.deepEqual(activeExternalRoots(projects, ["complete design, inc."]).map((project) => project.recordId), ["one"]);
});

test("snapshot AR rolls child invoices to eligible roots and excludes void, draft, and late fees", () => {
  const projects = [
    { recordId: "root", code: "26-1", status: "0", parentId: null, rootProjectId: null, client: "External" },
    { recordId: "phase", code: "26-1.01", status: "0", parentId: "root", rootProjectId: "root", client: "External" },
  ] as any[];
  const invoice = (recordId: string, balance: number, extra = {}) => ({
    recordId, projectId: "phase", projectCode: "26-1.01", invoiceDate: "2026-06-01",
    balance: String(balance), rawJson: { invoiceDetails: [{ term: "Net 0" }] }, void: false, draft: false, invoiceType: 1, ...extra,
  });
  const ar = calculatePortfolioAr("2026-09-01", new Date("2026-09-01T12:00:00Z"), projects, [
    invoice("included", 100),
    invoice("void", 200, { void: true }),
    invoice("draft", 300, { draft: true }),
    invoice("fee", 400, { invoiceType: 39 }),
  ] as any[], []);
  assert.deepEqual(ar.total, 100);
  assert.deepEqual(ar.over60, 100);
  assert.equal(ar.activeExternalRootCount, 1);
});

test("snapshot labels provide fixed checkpoint dates before captured-date fallback", () => {
  const captured = new Date("2027-02-03T10:00:00Z");
  assert.equal(snapshotAsOf("Aug 30 checkpoint", captured), "2026-08-30");
  assert.equal(snapshotAsOf("Sep 1 snapshot", captured), "2026-09-01");
  assert.equal(snapshotAsOf("other snapshot", captured), "2027-02-03");
});