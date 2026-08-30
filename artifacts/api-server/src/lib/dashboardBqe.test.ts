import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dashboardReportingPeriod,
  reconciliationForCompletedRun,
  type DashboardReconciliation,
} from "./dashboardBqe";

const reconciliation: DashboardReconciliation = {
  pullRunId: "completed-run",
  completedAt: "2026-08-30T05:24:59.860Z",
  reportingYear: 2026,
  asOfDate: "2026-08-30",
  objectCounts: {},
  total2026Hours: 100,
  excludedFutureHours: 0,
  total2026InvoicedAmount: 200,
  total2026PaymentsReceived: 150,
  perProject: {},
};

describe("dashboard BQE reconciliation selection", () => {
  it("keeps dashboard metrics bounded to 2026 when the as-of date is in 2027", () => {
    const period = dashboardReportingPeriod("2027-02-01");
    const records = [
      { date: "2026-12-31", hours: 10 },
      { date: "2027-01-01", hours: 20 },
    ];
    const hours = records
      .filter(
        (record) =>
          record.date >= period.startDate &&
          record.date < period.endDateExclusive &&
          record.date <= period.asOfDate,
      )
      .reduce((total, record) => total + record.hours, 0);

    assert.equal(hours, 10);
  });

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