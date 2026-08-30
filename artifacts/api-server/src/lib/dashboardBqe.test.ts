import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  reconciliationForCompletedRun,
  type DashboardReconciliation,
} from "./dashboardBqe";

const reconciliation: DashboardReconciliation = {
  pullRunId: "completed-run",
  completedAt: "2026-08-30T05:24:59.860Z",
  objectCounts: {},
  total2026Hours: 100,
  total2026InvoicedAmount: 200,
  total2026PaymentsReceived: 150,
  perProject: {},
};

describe("dashboard BQE reconciliation selection", () => {
  it("uses reconciliation only for its matching completed pull", () => {
    assert.equal(
      reconciliationForCompletedRun(
        { id: "completed-run", status: "completed" },
        reconciliation,
      ),
      reconciliation,
    );
  });

  it("omits a prior reconciliation after a partial pull", () => {
    assert.equal(
      reconciliationForCompletedRun(
        { id: "partial-run", status: "partial" },
        reconciliation,
      ),
      null,
    );
  });

  it("omits a reconciliation produced by a failed pull", () => {
    assert.equal(
      reconciliationForCompletedRun(
        { id: "failed-run", status: "failed" },
        { ...reconciliation, pullRunId: "failed-run" },
      ),
      null,
    );
  });

  it("omits a stale snapshot that does not match the latest completed pull", () => {
    assert.equal(
      reconciliationForCompletedRun(
        { id: "new-completed-run", status: "completed" },
        reconciliation,
      ),
      null,
    );
  });
});