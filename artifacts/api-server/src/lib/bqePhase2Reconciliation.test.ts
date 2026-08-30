import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyProjects,
  buildPhase2Diagnostics,
  customFieldDisplayValue,
  assertPhase2ControlledUniverse,
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
    { id: "a", code: "A", name: "Alpha", type: "legacy", projectClass: "ExactType", sourceValue: "ExactType", status: "open" },
    { id: "b", code: "B", name: "Beta", type: "legacy", projectClass: "ClosedType", sourceValue: "ClosedType", status: "2" },
    { id: "c", code: "C", name: "Gamma", type: "legacy", projectClass: "Inactive", sourceValue: "Inactive", status: "mystery" },
    { id: null, code: "ORPHAN", name: null, type: null, projectClass: null, sourceValue: null, status: null },
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

test("classifier never uses legacy project type when no source is selected", () => {
  const output = classifyProjects(
    [{ id: "a", code: "A", name: "Alpha", type: "ExactType", projectClass: "ExactType", sourceValue: null, status: "open" }],
    [{ projectId: "a", projectCode: null, activityId: null, activityCode: "FIELD", hours: 1 }],
    mappings,
  );
  assert.deepEqual(output[0].failedRules, ["I-2"]);
});

test("diagnostics use only dispositions, dedupe custom rows, scan code, and emit fixed hints", () => {
  const projects = [
    { id: "controlled", code: "SP-01", name: "Plat", type: null, projectClass: "A", sourceValue: null, status: "open" },
    { id: "uncontrolled", code: "ALTA-02", name: "ALTA", type: null, projectClass: "B", sourceValue: null, status: "open" },
  ];
  const dispositions = [{
    projectId: "controlled", projectCode: "SP-01", projectName: "Plat", projectType: null,
    status: "open", fingerprintKey: null, disposition: "excluded" as const, failedRules: ["I-2"], hours: 12.5,
  }];
  const diagnostics = buildPhase2Diagnostics(projects, dispositions, [
    { projectId: "controlled", customFieldId: "cf-1", label: "Service", value: "Plat" },
    { projectId: "controlled", customFieldId: "cf-1", label: "Service", value: "Plat" },
    { projectId: "uncontrolled", customFieldId: "cf-1", label: "Service", value: "ALTA" },
  ]);
  assert.deepEqual(diagnostics.filter((row) => row.diagnosticKind === "class").map((row) => [row.value, row.projectCount, row.hours]), [["A", 1, 12.5]]);
  assert.deepEqual(diagnostics.find((row) => row.diagnosticKind === "custom_field"), {
    diagnosticKind: "custom_field", fieldKey: "cf-1", fieldLabel: "Service", value: "Plat", projectCount: 1, hours: 12.5,
  });
  assert.equal(diagnostics.filter((row) => row.diagnosticKind === "text_hint").length, 7);
  assert.equal(diagnostics.find((row) => row.fieldLabel === "Short Plat / SP")?.projectCount, 1);
  assert.equal(diagnostics.find((row) => row.fieldLabel === "ALTA")?.projectCount, 0);
});

test("custom field description is the mapping and diagnostic display value, with value fallback", () => {
  assert.equal(
    customFieldDisplayValue({ value: "E270-OPAQUE-GUID", description: " Subdivision " }),
    "Subdivision",
  );
  assert.equal(customFieldDisplayValue({ value: "E270-OPAQUE-GUID", description: " " }), "E270-OPAQUE-GUID");
  const diagnostics = buildPhase2Diagnostics(
    [{ id: "p", code: "P", name: "Project", type: null, projectClass: null, sourceValue: null, status: "open" }],
    [{ projectId: "p", projectCode: "P", projectName: "Project", projectType: null, status: "open", fingerprintKey: null, disposition: "excluded", failedRules: ["I-2"], hours: 1 }],
    [{ projectId: "p", customFieldId: "type", label: "Project Type", value: "E270-OPAQUE-GUID", description: "Subdivision" }],
  );
  assert.equal(diagnostics.find((row) => row.diagnosticKind === "custom_field")?.value, "Subdivision");
});

test("D-1 requires its fixed 315-project controlled universe independent of hours", () => {
  assert.doesNotThrow(() => assertPhase2ControlledUniverse(315));
  assert.throws(
    () => assertPhase2ControlledUniverse(314),
    /exactly 315 non-project controlled projects; found 314/,
  );
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