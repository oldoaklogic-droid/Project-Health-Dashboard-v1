import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  assertControlledHourBearingProjects,
  batchBqeEnrichmentIds,
  deriveBqeEnrichmentScope,
  fetchBqeRecordsForObject,
  reconcileBqeRecords,
  validateScopedClassRecords,
  type BqeReconciliationSummary,
} from "./bqePull";
import {
  fixtureObjectCounts,
  futureDatedTimeFixture,
  hierarchyRollupFixture,
  invoiceAllocationFixture,
  invoiceRegisterFixture,
  partialPullFixture,
  paymentAllocationFixture,
} from "./__fixtures__/bqePullFixtures";

const connection = {
  accessToken: "fixture-access-token",
  apiBase: "https://api.bqecore.com/api",
};

const completedAt = new Date("2026-08-30T12:00:00.000Z");

function summaryFor(
  pulledRecords: Parameters<typeof reconcileBqeRecords>[3],
  objectCounts = fixtureObjectCounts,
): BqeReconciliationSummary {
  return reconcileBqeRecords("fixture-pull", completedAt, objectCounts, pulledRecords);
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("BQE pull fixtures", () => {
  it("excludes failed-object table rows from a partial pull reconciliation", () => {
    const result = summaryFor(partialPullFixture.pulledRecords, partialPullFixture.objectCounts);

    assert.equal(result.total2026InvoicedAmount, 0);
    assert.equal(result.total2026PaymentsReceived, 150);
    assert.deepEqual(result.perProject["23-0147"], {
      exact: { hours: 0, invoicedAmount: 0, paymentsReceived: 0 },
      rolledUp: { hours: 0, invoicedAmount: 0, paymentsReceived: 0 },
    });
    assert.equal(partialPullFixture.failedObjectTableRows.invoice?.[0]?.amount, "9000");
  });

  it("splits invoices across projects and falls back to the header on mismatch", () => {
    const result = summaryFor({
      project: [
        { id: "project-a", code: "23-0091" },
        { id: "project-b", code: "23-0147" },
        { id: "project-c", code: "24-0022" },
      ],
      invoice: invoiceAllocationFixture,
    });

    assert.equal(result.total2026InvoicedAmount, 2000);
    assert.equal(result.perProject["23-0091"].exact.invoicedAmount, 600);
    assert.equal(result.perProject["23-0147"].exact.invoicedAmount, 400);
    assert.equal(result.perProject["24-0022"].exact.invoicedAmount, 1000);
  });

  it("splits payments across projects and falls back to the header on mismatch", () => {
    const result = summaryFor({
      project: [
        { id: "project-a", code: "23-0091" },
        { id: "project-b", code: "23-0147" },
        { id: "project-c", code: "24-0022" },
      ],
      payment: paymentAllocationFixture,
    });

    assert.equal(result.total2026PaymentsReceived, 1000);
    assert.equal(result.perProject["23-0091"].exact.paymentsReceived, 300);
    assert.equal(result.perProject["24-0022"].exact.paymentsReceived, 200);
    assert.equal(result.perProject["23-0147"].exact.paymentsReceived, 500);
  });

  it("excludes and exposes the 370 future-dated hours after the BQE as-of date", () => {
    const result = summaryFor({
      timeentry: futureDatedTimeFixture,
    });

    assert.equal(result.reportingYear, 2026);
    assert.equal(result.asOfDate, "2026-08-30");
    assert.equal(result.total2026Hours, 1_250);
    assert.equal(result.excludedFutureHours, 370);
    assert.equal(result.perProject["23-0091"].exact.hours, 1_250);
    assert.equal(result.perProject["23-0147"].exact.hours, 0);
  });

  it("keeps exact project totals and rolls child values to the root project", () => {
    const result = summaryFor(hierarchyRollupFixture);

    assert.deepEqual(result.perProject["23-0147"], {
      exact: { hours: 2.5, invoicedAmount: 0, paymentsReceived: 0 },
      rolledUp: { hours: 15, invoicedAmount: 300, paymentsReceived: 125 },
    });
  });

  it("reproduces invoice register detail-row counts and net billed with tax", () => {
    const result = summaryFor({
      project: [
        { id: "project-a", code: "23-0091" },
        { id: "project-b", code: "23-0147" },
      ],
      invoice: invoiceRegisterFixture,
    });

    assert.equal(result.total2026InvoicedAmount, 550);
    assert.equal(result.invoiceRegister.grossHeaderCount, 4);
    assert.equal(result.invoiceRegister.detailRowCount, 5);
    assert.equal(result.invoiceRegister.registerCount, 2);
    assert.equal(result.invoiceRegister.netBilledWithTax, 225);
    assert.equal(result.invoiceRegister.excludedFinanceChargeCount, 1);
    assert.equal(result.invoiceRegister.financeChargeAmount, 75);
    assert.equal(result.invoiceRegister.excludedDraftCount, 1);
    assert.equal(result.invoiceRegister.excludedZeroAmountCount, 1);
    assert.equal(result.invoiceRegister.excluded250InvoiceNumber, "4879");
  });

  it("merges HTTP 207 field batches by record id", async () => {
    const requests: Array<{ url: URL; method: string | undefined }> = [];
    globalThis.fetch = async (input, init) => {
      const url = new URL(input.toString());
      requests.push({ url, method: init?.method });
      const fields = url.searchParams.get("fields")?.split(",") ?? [];
      if (fields.length > 4) {
        return jsonResponse(207, { error: "field batch too large" });
      }
      const record: Record<string, unknown> = { id: "project-1" };
      if (fields.includes("code")) record.code = "23-0091";
      if (fields.includes("name")) record.name = "Fixture Project";
      return jsonResponse(200, { data: [record] });
    };

    const records = await fetchBqeRecordsForObject(connection, "project");

    assert.deepEqual(records, [
      {
        id: "project-1",
        code: "23-0091",
        name: "Fixture Project",
      },
    ]);
    assert.ok(requests.length > 5);
    assert.equal(requests[0]?.url.searchParams.get("page"), "1,100");
    assert.ok(requests.every((request) => request.method === "GET"));
  });

  it("uses the read-only scoped customfieldvalue endpoint and requests source evidence fields", async () => {
    let request: { url: URL; method: string | undefined } | null = null;
    globalThis.fetch = async (input, init) => {
      request = { url: new URL(input.toString()), method: init?.method };
      return jsonResponse(200, { data: [] });
    };
    await fetchBqeRecordsForObject(connection, "customfieldvalue", "entityId = 'project-1'");
    assert.ok(request);
    const captured = request as { url: URL; method: string | undefined };
    assert.equal(captured.method, "GET");
    assert.equal(captured.url.searchParams.get("where"), "entityId = 'project-1'");
    const fields = captured.url.searchParams.get("fields")?.split(",") ?? [];
    for (const field of ["id", "customFieldId", "entityId", "entityType", "value", "description", "label", "type"]) {
      assert.ok(fields.includes(field));
    }
  });

  it("builds the enrichment union from hour-bearing and active non-project-filtered projects", () => {
    const scope = deriveBqeEnrichmentScope(
      [
        { id: "hour-only", status: "completed", code: "H" },
        { id: "active-only", status: "open", code: "A" },
        { id: "overlap", status: "active", code: "O" },
        { id: "office", status: "active", code: "OFFICE" },
      ],
      [
        { id: "te-1", projectId: "hour-only", actualHours: 1 },
        { id: "te-2", projectId: "overlap", actualHours: 2 },
        { id: "te-3", projectId: "office", actualHours: 3 },
      ],
    );
    assert.deepEqual([...scope.controlledIds].sort(), ["hour-only", "overlap"]);
    assert.deepEqual([...scope.activeIds].sort(), ["active-only", "office", "overlap"]);
    assert.deepEqual([...scope.eligibleIds].sort(), ["active-only", "hour-only", "office", "overlap"]);
  });

  it("requires the reviewed 315-project controlled set before enrichment", () => {
    assert.throws(() => assertControlledHourBearingProjects(new Set(["only-one"])), /expected 315/);
    assert.doesNotThrow(() =>
      assertControlledHourBearingProjects(new Set(Array.from({ length: 315 }, (_, index) => `${index}`))),
    );
  });

  it("batches scoped enrichment IDs at twenty and never creates an empty batch", () => {
    const batches = batchBqeEnrichmentIds(Array.from({ length: 41 }, (_, index) => `project-${index}`));
    assert.deepEqual(batches.map((batch) => batch.length), [20, 20, 1]);
    assert.deepEqual(batchBqeEnrichmentIds([]), []);
  });

  it("rejects out-of-scope or incomplete class evidence before persistence", () => {
    const eligible = new Set(["project-a", "project-b"]);
    assert.throws(
      () => validateScopedClassRecords([{ id: "project-a" }, { id: "other" }], eligible),
      /ineligible/,
    );
    assert.throws(
      () => validateScopedClassRecords([{ id: "project-a" }], eligible),
      /missing 1/,
    );
    assert.deepEqual(
      validateScopedClassRecords([{ id: "project-a" }, { id: "project-a" }, { id: "project-b" }], eligible)
        .map((record) => record.id),
      ["project-a", "project-b"],
    );
  });

  it("stops when pagination repeats the same non-empty page", async () => {
    const repeatedPage = Array.from({ length: 100 }, (_, index) => ({
      id: `project-${index}`,
      code: `fixture-${index}`,
    }));
    let requestCount = 0;
    globalThis.fetch = async () => {
      requestCount += 1;
      return jsonResponse(200, { data: repeatedPage });
    };

    await assert.rejects(
      fetchBqeRecordsForObject(connection, "project"),
      /pagination repeated a page/,
    );
    assert.equal(requestCount, 2);
  });
});