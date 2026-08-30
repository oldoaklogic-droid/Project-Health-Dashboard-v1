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

export const futureDatedTimeFixture = [
  {
    id: "time-current",
    date: "2026-08-30",
    actualHours: 1_250,
    projectCode: "23-0091",
  },
  {
    id: "time-future-a",
    date: "2026-09-01",
    actualHours: 200,
    projectCode: "23-0091",
  },
  {
    id: "time-future-b",
    date: "2026-12-15",
    actualHours: 170,
    projectCode: "23-0147",
  },
  {
    id: "time-next-year",
    date: "2027-01-01",
    actualHours: 900,
    projectCode: "23-0147",
  },
];

export const hierarchyRollupFixture = {
  project: [
    { id: "root-a", code: "23-0147", parentId: null, rootProjectId: null, type: 0 },
    { id: "child-a", code: "23-0147-01", parentId: "root-a", rootProjectId: "root-a", type: 1 },
    { id: "root-b", code: "24-0022", parentId: null, rootProjectId: null, type: 0 },
  ],
  timeentry: [
    { id: "time-child", date: "2026-05-01", projectId: "child-a", actualHours: 12.5 },
    { id: "time-root", date: "2026-05-02", projectId: "root-a", actualHours: 2.5 },
  ],
  invoice: [
    {
      id: "invoice-child",
      invoiceNumber: "fixture-child",
      date: "2026-05-03",
      invoiceAmount: 300,
      status: 1,
      type: 13,
      isDraft: false,
      isVoid: false,
      invoiceDetails: [
        {
          projectId: "child-a",
          rootProjectId: "root-a",
          amount: 300,
          serviceAmount: 300,
          expenseAmount: 0,
          serviceTaxAmount: 0,
          expenseTaxAmount: 0,
          discount: 0,
        },
      ],
    },
  ],
  payment: [
    {
      id: "payment-child",
      date: "2026-05-04",
      amount: 125,
      projectId: "child-a",
    },
  ],
};

export const invoiceRegisterFixture = [
  {
    id: "invoice-standard",
    invoiceNumber: "standard",
    date: "2026-06-01",
    invoiceAmount: 225,
    status: 1,
    type: 13,
    isDraft: false,
    isVoid: false,
    invoiceDetails: [
      {
        projectCode: "23-0091",
        amount: 100,
        serviceAmount: 100,
        expenseAmount: 0,
        serviceTaxAmount: 0,
        expenseTaxAmount: 0,
        discount: 0,
      },
      {
        projectCode: "23-0147",
        amount: 125,
        serviceAmount: 100,
        expenseAmount: 30,
        serviceTaxAmount: 0,
        expenseTaxAmount: 0,
        discount: 5,
      },
    ],
  },
  {
    id: "invoice-finance-charge",
    invoiceNumber: "finance",
    date: "2026-06-02",
    invoiceAmount: 75,
    status: 0,
    type: 39,
    isDraft: false,
    isVoid: false,
    invoiceDetails: [
      {
        projectCode: "23-0091",
        amount: 75,
        serviceAmount: 0,
        expenseAmount: 0,
        serviceTaxAmount: 0,
        expenseTaxAmount: 0,
        discount: 0,
      },
    ],
  },
  {
    id: "invoice-draft",
    invoiceNumber: "4879",
    date: "2026-06-03",
    invoiceAmount: 250,
    status: 0,
    type: 13,
    isDraft: true,
    isVoid: false,
    invoiceDetails: [
      {
        projectCode: "23-0091",
        amount: 250,
        serviceAmount: 250,
        expenseAmount: 0,
        serviceTaxAmount: 0,
        expenseTaxAmount: 0,
        discount: 0,
      },
    ],
  },
  {
    id: "invoice-zero",
    invoiceNumber: "zero",
    date: "2026-06-04",
    invoiceAmount: 0,
    status: 1,
    type: 13,
    isDraft: false,
    isVoid: false,
    invoiceDetails: [
      {
        projectCode: "23-0091",
        amount: 0,
        serviceAmount: 0,
        expenseAmount: 0,
        serviceTaxAmount: 0,
        expenseTaxAmount: 0,
        discount: 0,
      },
    ],
  },
];