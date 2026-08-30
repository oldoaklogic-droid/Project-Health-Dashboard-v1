export type DashboardPullRun = {
  id: string;
  status: string;
};

export type DashboardReconciliation = {
  pullRunId: string;
  completedAt: string;
  objectCounts: Record<string, number>;
  total2026Hours: number;
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