import type { BqeObjectType } from "../bqePull";

export const fixtureObjectCounts: Record<BqeObjectType, number> = {
  project: 3,
  timeentry: 0,
  activity: 0,
  budget: 0,
  invoice: 2,
  payment: 2,
};

export const partialPullFixture = {
  objectCounts: {
    ...fixtureObjectCounts,
    invoice: 0,
    payment: 1,
  },
  pulledRecords: {
    project: [
      { id: "project-a", code: "23-0091" },
      { id: "project-b", code: "23-0147" },
      { id: "project-c", code: "24-0022" },
    ],
    payment: [
      {
        id: "payment-current",
        date: "2026-02-10",
        amount: 150,
        projectId: "project-a",
      },
    ],
  },
  failedObjectTableRows: {
    invoice: [
      {
        recordId: "invoice-stale",
        invoiceDate: "2026-01-15",
        amount: "9000",
        projectCode: "23-0147",
      },
    ],
  },
} satisfies {
  objectCounts: Record<BqeObjectType, number>;
  pulledRecords: Partial<Record<BqeObjectType, Record<string, unknown>[]>>;
  failedObjectTableRows: Partial<Record<BqeObjectType, Record<string, unknown>[]>>;
};

export const invoiceAllocationFixture = [
  {
    id: "invoice-multi-project",
    date: "2026-03-05",
    invoiceAmount: 1000,
    invoiceDetails: [
      { projectCode: "23-0091", amount: 600 },
      { projectCode: "23-0147", amount: 400 },
    ],
  },
  {
    id: "invoice-mismatch",
    date: "2026-03-06",
    invoiceAmount: 1000,
    projectCode: "24-0022",
    invoiceDetails: [
      { projectCode: "23-0091", amount: 600 },
      { projectCode: "23-0147", amount: 300 },
    ],
  },
];

export const paymentAllocationFixture = [
  {
    id: "payment-multi-project",
    date: "2026-04-05",
    amount: 500,
    lineItems: [
      { projectCode: "23-0091", amount: 300 },
      { projectCode: "24-0022", amount: 200 },
    ],
  },
  {
    id: "payment-mismatch",
    date: "2026-04-06",
    amount: 500,
    projectCode: "23-0147",
    lineItems: [
      { projectCode: "23-0091", amount: 300 },
      { projectCode: "24-0022", amount: 100 },
    ],
  },
];