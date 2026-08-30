import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  fetchBqeRecordsForObject,
  reconcileBqeRecords,
  type BqeReconciliationSummary,
} from "./bqePull";
import {
  fixtureObjectCounts,
  futureDatedTimeFixture,
  invoiceAllocationFixture,
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
      hours: 0,
      invoicedAmount: 0,
      paymentsReceived: 0,
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
    assert.equal(result.perProject["23-0091"].invoicedAmount, 600);
    assert.equal(result.perProject["23-0147"].invoicedAmount, 400);
    assert.equal(result.perProject["24-0022"].invoicedAmount, 1000);
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
    assert.equal(result.perProject["23-0091"].paymentsReceived, 300);
    assert.equal(result.perProject["24-0022"].paymentsReceived, 200);
    assert.equal(result.perProject["23-0147"].paymentsReceived, 500);
  });

  it("excludes and exposes the 370 future-dated hours after the BQE as-of date", () => {
    const result = summaryFor({
      timeentry: futureDatedTimeFixture,
    });

    assert.equal(result.reportingYear, 2026);
    assert.equal(result.asOfDate, "2026-08-30");
    assert.equal(result.total2026Hours, 1_250);
    assert.equal(result.excludedFutureHours, 370);
    assert.equal(result.perProject["23-0091"].hours, 1_250);
    assert.equal(result.perProject["23-0147"].hours, 0);
  });

  it("merges HTTP 207 field batches by record id", async () => {
    const requests: URL[] = [];
    globalThis.fetch = async (input) => {
      const url = new URL(input.toString());
      requests.push(url);
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
    assert.equal(requests.length, 5);
    assert.equal(requests[0].searchParams.get("page"), "1,100");
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