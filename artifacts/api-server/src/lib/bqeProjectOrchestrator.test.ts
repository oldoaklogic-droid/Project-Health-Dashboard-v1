import assert from "node:assert/strict";
import test from "node:test";

import { calculateEstimate } from "./estimating";
import {
  BQE_ENTITY_LOOKUPS,
  orchestrateBqeProjectCreation,
  type BqeProjectOrchestrationDependencies,
  type BqeProjectOrchestrationInput,
} from "./bqeProjectOrchestrator";

const ids = {
  client: "00000000-0000-4000-8000-000000000001",
  employee: "00000000-0000-4000-8000-000000000002",
  employeeGroup: "00000000-0000-4000-8000-000000000003",
  activity: "00000000-0000-4000-8000-000000000004",
};

function fixtureInput(dryRun: boolean): BqeProjectOrchestrationInput {
  const estimate = calculateEstimate({
    disciplines: ["Short Plat"],
    drivers: { lots: 1 },
    stepFlags: {},
  });
  assert.ok(estimate);
  return {
    dryRun,
    employeeGroupName: "Survey",
    estimate,
    intake: {
      id: "00000000-0000-4000-8000-000000000010",
      leadId: null,
      client: "Fixture Client",
      contact: null,
      phone: null,
      email: null,
      address: "100 Test Way",
      parcel: null,
      referralSource: null,
      primaryRequest: "Short plat",
      propertyPlans: null,
      disciplines: ["Short Plat"],
      answers: { employeeGroup: "Survey" },
      drivers: { lots: 1 },
      stepFlags: {},
      contractType: "Hourly",
      paymentTerms: null,
      startDate: "2026-09-01",
      targetCompletion: null,
      pmByDiscipline: { "Short Plat": "Fixture Manager" },
      overrides: {},
      estimateApprovedAt: new Date(),
      createdAt: new Date(),
    },
    localProject: {
      id: "00000000-0000-4000-8000-000000000011",
      intakeId: "00000000-0000-4000-8000-000000000010",
      bqeParentProjectId: null,
      bqeChildProjectIds: {},
      projectNumber: "26000",
      name: "Fixture Project",
      client: "Fixture Client",
      pm: "Fixture Manager",
      address: "100 Test Way",
      disciplines: ["Short Plat"],
      originalHours: String(estimate.totalHours),
      approvedHours: String(estimate.totalHours),
      rate: "220",
      fee: String(estimate.totalFee),
      dueDate: "2026-09-15",
      status: "Draft",
      phases: [],
      activities: [],
      changeOrders: [],
      closeout: {},
      adjustmentLogs: [],
      createdAt: new Date(),
    },
  };
}

const fakeConnection = async () => ({
  accessToken: "test-only",
  apiBase: "https://example.invalid/api",
});

const fakeResolve: NonNullable<BqeProjectOrchestrationDependencies["resolveUuid"]> =
  async (_connection, entityType) => ids[entityType];

test("uses the live BQE collection and filter field names", () => {
  assert.deepEqual(BQE_ENTITY_LOOKUPS, {
    client: { path: "client", field: "name" },
    employee: { path: "employee", field: "displayName" },
    activity: { path: "activity", field: "code" },
    employeeGroup: { path: "group", field: "name" },
  });
});

test("dry run builds exact payloads and performs zero BQE requests", async () => {
  let requestCount = 0;
  const result = await orchestrateBqeProjectCreation(fixtureInput(true), {
    getAccessToken: fakeConnection,
    resolveUuid: fakeResolve,
    request: async () => {
      requestCount += 1;
      throw new Error("dry run must not make a BQE object request");
    },
  });

  assert.equal(result.status, "dry-run");
  assert.equal(requestCount, 0);
  assert.equal(result.created.length, 0);
  const project = result.payloads.find((item) => item.kind === "parentProject");
  assert.deepEqual(project?.payload, {
    name: "Fixture Project",
    code: "26000",
    clientId: ids.client,
    managerId: ids.employee,
    contractType: "Hourly",
    type: 0,
    status: 0,
    contractAmount: fixtureInput(true).estimate.totalFee,
    startDate: "2026-09-01",
    dueDate: "2026-09-15",
    level: 0,
  });

  const budget = result.payloads.find((item) => item.kind === "budget");
  assert.ok(budget);
  assert.equal(budget.endpoint, "project/dry-run%3AparentProject%3A1/budget");
  const services = (budget.payload.services as Record<string, unknown>[]);
  assert.ok(services.length > 0);
  assert.deepEqual(
    Object.keys(services[0]).sort(),
    [
      "billRate", "chargeAmount", "costRate", "description", "hours",
      "isResourceGroup", "item", "itemId", "itemType", "memo",
      "resourceGroupId", "resourceId", "tax1", "tax2", "tax3",
    ].sort(),
  );
  assert.equal(result.payloads.some((item) => item.endpoint === "projectassignment/resource"), true);
  assert.equal(result.payloads.some((item) => item.endpoint === "projectassignment/activity"), true);
  assert.equal(result.payloads.some((item) => item.endpoint === "allocation"), true);
});

test("live failure stops immediately and reports created objects", async () => {
  const calls: Array<{ path: string; method: string }> = [];
  const result = await orchestrateBqeProjectCreation(fixtureInput(false), {
    getAccessToken: fakeConnection,
    resolveUuid: fakeResolve,
    request: async (_connection, path, method, payload) => {
      calls.push({ path, method });
      if (method === "POST" && path === "project") return { id: "created-parent" };
      if (method === "GET" && path === "project/created-parent") {
        return payload ?? { id: "created-parent", rules: [] };
      }
      if (method === "POST" && path.endsWith("/budget")) {
        throw new Error("fixture budget failure");
      }
      return { id: "verified", rules: [] };
    },
  });

  assert.equal(result.status, "partial");
  assert.equal(result.error?.failedKind, "budget");
  assert.match(result.error?.message ?? "", /fixture budget failure/);
  assert.deepEqual(result.created, [{ kind: "parentProject", id: "created-parent", targetProjectId: undefined }]);
  assert.equal(calls.some((call) => call.path === "projectassignment/resource"), false);
});