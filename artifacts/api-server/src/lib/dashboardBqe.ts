export type DashboardPullRun = {
  id: string;
  status: string;
};

export type DashboardReconciliation = {
  pullRunId: string;
  completedAt: string;
  reportingYear: number;
  asOfDate: string;
  objectCounts: Record<string, number>;
  total2026Hours: number;
  excludedFutureHours: number;
  total2026InvoicedAmount: number;
  total2026PaymentsReceived: number;
  perProject: Record<
    string,
    {
      hours: number;
      invoicedAmount: number;
      paymentsReceived: number;
    }
  >;
};

export function dashboardReportingPeriod(asOfDate: string): {
  startDate: string;
  endDateExclusive: string;
  asOfDate: string;
} {
  return {
    startDate: "2026-01-01",
    endDateExclusive: "2027-01-01",
    asOfDate,
  };
}

export function reconciliationForCompletedRun<T extends DashboardReconciliation>(
  latestRun: DashboardPullRun | null,
  reconciliation: T | null,
): T | null {
  if (
    latestRun?.status !== "completed" ||
    !reconciliation ||
    reconciliation.pullRunId !== latestRun.id
  ) {
    return null;
  }
  return reconciliation;
}