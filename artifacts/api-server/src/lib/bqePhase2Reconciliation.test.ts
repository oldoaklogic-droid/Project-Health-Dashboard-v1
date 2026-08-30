import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyProjects,
  nonProjectBucket,
  normalizedProjectStatus,
  reconciliationControls,
  toCsv,
} from "./bqePhase2Reconciliation";

const mappings = new Map([
  ["ExactType", { fingerprintKey: "Short Plat", active: true }],
  ["ClosedType", { fingerprintKey: "Boundary Survey", active: true }],
  ["Inactive", { fingerprintKey: "Site Plan", active: false }],
]);

test("fixture classifier applies cohorts and all I rules", () => {
  const output = classifyProjects([
    { id: "a", code: "A", name: "Alpha", type: "ExactType", status: "open" },
    { id: "b", code: "B", name: "Beta", type: "ClosedType", status: "2" },
    { id: "c", code: "C", name: "Gamma", type: "Inactive", status: "mystery" },
    { id: null, code: "ORPHAN", name: null, type: null, status: null },
  ], [
    { projectId: "a", projectCode: null, activityId: null, activityCode: "FIELD", hours: 10 },
    { projectId: "b", projectCode: null, activityId: "survey", activityCode: null, hours: 5 },
    { projectId: "c", projectCode: null, activityId: "missing", activityCode: null, hours: 1 },
  ], mappings, new Map([["survey", "SURVEY"]]));
  assert.equal(output[0].disposition, "cohort_b");
  assert.equal(output[1].disposition, "cohort_a");
  assert.deepEqual(output[2].failedRules, ["I-2", "I-3", "I-4"]);
  assert.deepEqual(output[3].failedRules, ["I-1", "I-2", "I-4"]);
});

test("fixture bucket patterns and conservative statuses are deterministic", () => {
  assert.equal(nonProjectBucket("OFFICE", null), "Admin");
  assert.equal(nonProjectBucket(null, "paid time off"), "PTO");
  assert.equal(nonProjectBucket("BD", "Business Development"), "Business Development");
  assert.equal(nonProjectBucket("IT", "internal training"), "Internal");
  assert.equal(normalizedProjectStatus("completed"), "completed");
  assert.equal(normalizedProjectStatus("pending"), null);
});

test("CSV escapes commas quotes and newlines", () => {
  assert.equal(toCsv(["name"], [{ name: "A,\"B\"\nC" }]), "name\r\n\"A,\"\"B\"\"\nC\"\r\n");
});

test("controls expose nonzero failures and exact type tie-out", () => {
  const controls = reconciliationControls({
    population: 100, exclusions: 2, nonProject: 3, sourceHours: 105,
    universeProjectCount: 3, dispositionProjectCount: 2, nonProjectProjectCount: 1, typeSubtotalHours: 102,
  });
  assert.equal(controls.populationDifference, 0);
  assert.equal(controls.typeSubtotalDifference, 0);
  assert.notEqual(controls.anchorDifference, 0);
});