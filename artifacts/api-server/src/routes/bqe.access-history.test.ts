import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, beforeEach, describe, it, mock } from "node:test";
import express, { type Request } from "express";

type DashboardRole = "viewer" | "editor" | "admin";

type TestUser = {
  id: string;
  publicMetadata: Record<string, unknown>;
};

type AccessChange = {
  id: number;
  actorUserId: string;
  targetUserId: string;
  previousRole: DashboardRole | null;
  newRole: DashboardRole | null;
  changedAt: Date;
};

type LogEntry = {
  level: "warn" | "error";
  context: unknown;
  message: string;
};

type TestLogger = {
  warn(context: unknown, message: string): void;
  error(context: unknown, message: string): void;
};

const users = new Map<string, TestUser>();
const accessChanges: AccessChange[] = [];
const logEntries: LogEntry[] = [];
let metadataUpdateCount = 0;
let failAccessChangeInsert = false;
let failRoleRevert = false;

const accessChangesTable = {
  changedAt: "changedAt",
};

const db = {
  select() {
    return {
      from() {
        return {
          orderBy(order: { direction?: string }) {
            return {
              async limit() {
                const changes = [...accessChanges];
                if (order.direction === "desc") {
                  changes.sort(
                    (left, right) => right.changedAt.getTime() - left.changedAt.getTime(),
                  );
                }
                return changes.slice(0, 25);
              },
            };
          },
        };
      },
    };
  },
  insert() {
    return {
      async values(change: Omit<AccessChange, "id" | "changedAt">) {
        if (failAccessChangeInsert) {
          throw new Error("The access history database is unavailable.");
        }
        accessChanges.push({
          ...change,
          id: accessChanges.length + 1,
          changedAt: new Date(`2026-08-30T12:00:0${accessChanges.length}.000Z`),
        });
      },
    };
  },
};

mock.module("@clerk/express", {
  namedExports: {
    clerkClient: {
      users: {
        async getUser(userId: string) {
          const user = users.get(userId);
          if (!user) {
            throw new Error(`Unknown test user: ${userId}`);
          }
          return user;
        },
        async updateUserMetadata(
          userId: string,
          input: { publicMetadata: Record<string, unknown> },
        ) {
          const user = users.get(userId);
          if (!user) {
            throw new Error(`Unknown test user: ${userId}`);
          }
          metadataUpdateCount += 1;
          if (failRoleRevert && metadataUpdateCount === 2) {
            throw new Error("Clerk role revert failed.");
          }
          user.publicMetadata = input.publicMetadata;
          return user;
        },
      },
    },
    getAuth(req: Request) {
      const userId = req.headers["x-test-user-id"];
      return {
        userId: typeof userId === "string" ? userId : null,
        sessionClaims: {
          userId: typeof userId === "string" ? userId : null,
        },
      };
    },
  },
});

mock.module("@workspace/db", {
  namedExports: {
    bqeConnectionTable: {},
    bqeFingerprintKeysTable: {},
    bqePhase2DiagnosticsTable: {},
    bqePhase2MappingSourceTable: {},
    bqePhase2ReconciliationRunsTable: {},
    bqeProjectSourceMappingsTable: {},
    bqePullRunsTable: {},
    dashboardAccessChangesTable: accessChangesTable,
    db,
  },
});

mock.module("drizzle-orm", {
  namedExports: {
    desc() {
      return { direction: "desc" };
    },
    eq() {
      return {};
    },
  },
});

mock.module("../lib/bqe", {
  namedExports: {
    BqeConnectionError: class BqeConnectionError extends Error {},
    getBqeAccessToken: async () => {
      throw new Error("The BQE client is not used by this test.");
    },
  },
});

mock.module("../lib/bqePull", {
  namedExports: {
    getLatestBqeReconciliation: async () => null,
    runBqePhase1Pull: async () => ({ status: "completed" }),
  },
});

mock.module("../lib/bqePhase2Reconciliation", {
  namedExports: {
    createPhase2Reconciliation: async () => null,
    ensureFingerprintSeeds: async () => undefined,
    getPhase2Run: async () => null,
    toCsv: () => "",
  },
});

mock.module("../lib/bqeProjectOrchestrator", {
  namedExports: {
    checkBqeActivityReadiness: async () => ({
      ready: true,
      resolved: [],
      unresolved: [],
    }),
  },
});

const { default: bqeRouter } = await import("./bqe");

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const requestWithLogger = req as unknown as { log: TestLogger };
  requestWithLogger.log = {
    warn(context: unknown, message: string) {
      logEntries.push({ level: "warn", context, message });
    },
    error(context: unknown, message: string) {
      logEntries.push({ level: "error", context, message });
    },
  };
  next();
});
app.use(bqeRouter);

let server: Server;
let baseUrl: string;

before(async () => {
  server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

beforeEach(() => {
  users.clear();
  users.set("user-admin", {
    id: "user-admin",
    publicMetadata: { dashboardRole: "admin" },
  });
  users.set("user-target", {
    id: "user-target",
    publicMetadata: { dashboardRole: "viewer" },
  });
  users.set("user-viewer", {
    id: "user-viewer",
    publicMetadata: { dashboardRole: "viewer" },
  });
  accessChanges.length = 0;
  logEntries.length = 0;
  metadataUpdateCount = 0;
  failAccessChangeInsert = false;
  failRoleRevert = false;
});

async function request(
  path: string,
  userId: string,
  init: RequestInit = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-test-user-id": userId,
      ...init.headers,
    },
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

describe("dashboard access history routes", () => {
  it("records the actor, target, roles, and timestamp for a role change", async () => {
    const response = await request("/admin/users/user-target/role", "user-admin", {
      method: "PATCH",
      body: JSON.stringify({ role: "editor" }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { id: "user-target", role: "editor" });
    assert.equal(accessChanges.length, 1);
    assert.deepEqual(accessChanges[0], {
      id: 1,
      actorUserId: "user-admin",
      targetUserId: "user-target",
      previousRole: "viewer",
      newRole: "editor",
      changedAt: new Date("2026-08-30T12:00:00.000Z"),
    });
    assert.ok(accessChanges[0].changedAt instanceof Date);
  });

  it("does not create a duplicate history record for a same-role no-op", async () => {
    const firstChange = await request("/admin/users/user-target/role", "user-admin", {
      method: "PATCH",
      body: JSON.stringify({ role: "editor" }),
    });
    const secondChange = await request("/admin/users/user-target/role", "user-admin", {
      method: "PATCH",
      body: JSON.stringify({ role: "editor" }),
    });

    assert.equal(firstChange.status, 200);
    assert.equal(secondChange.status, 200);
    assert.deepEqual(secondChange.body, { id: "user-target", role: "editor" });
    assert.equal(accessChanges.length, 1);
    assert.equal(metadataUpdateCount, 1);
  });

  it("reverts the Clerk role when the access history insert fails", async () => {
    failAccessChangeInsert = true;

    const response = await request("/admin/users/user-target/role", "user-admin", {
      method: "PATCH",
      body: JSON.stringify({ role: "editor" }),
    });

    assert.equal(response.status, 503);
    assert.deepEqual(response.body, {
      id: "user-target",
      role: "viewer",
      auditRecorded: false,
      roleChangeReverted: true,
      error: "The dashboard role was not changed because its access history could not be saved.",
    });
    assert.equal(users.get("user-target")?.publicMetadata.dashboardRole, "viewer");
    assert.equal(accessChanges.length, 0);
    assert.equal(metadataUpdateCount, 2);
    assert.ok(
      logEntries.some(
        (entry) =>
          entry.level === "error" &&
          entry.message === "Dashboard role change was reverted after access audit failure",
      ),
    );
  });

  it("reports reconciliation when the access history insert and role revert both fail", async () => {
    failAccessChangeInsert = true;
    failRoleRevert = true;

    const response = await request("/admin/users/user-target/role", "user-admin", {
      method: "PATCH",
      body: JSON.stringify({ role: "editor" }),
    });

    assert.equal(response.status, 500);
    assert.deepEqual(response.body, {
      id: "user-target",
      role: "editor",
      auditRecorded: false,
      roleChangeReverted: false,
      reconciliationRequired: true,
      error:
        "The dashboard role changed, but its access history could not be saved or reconciled. Manual reconciliation is required.",
    });
    assert.equal(users.get("user-target")?.publicMetadata.dashboardRole, "editor");
    assert.equal(accessChanges.length, 0);
    assert.equal(metadataUpdateCount, 2);
    assert.ok(
      logEntries.some(
        (entry) =>
          entry.level === "error" &&
          entry.message === "Dashboard role change could not be reverted after access audit failure",
      ),
    );
  });

  it("rejects administrator self-demotion, warns, and writes no history", async () => {
    const response = await request("/admin/users/user-admin/role", "user-admin", {
      method: "PATCH",
      body: JSON.stringify({ role: "viewer" }),
    });

    assert.equal(response.status, 403);
    assert.deepEqual(response.body, {
      error: "You cannot remove or downgrade your own administrator role.",
    });
    assert.equal(accessChanges.length, 0);
    assert.equal(metadataUpdateCount, 0);
    assert.ok(
      logEntries.some(
        (entry) =>
          entry.level === "warn" &&
          entry.message === "Rejected administrator self-lockout role change",
      ),
    );
  });

  it("returns access history newest first for administrators", async () => {
    accessChanges.push(
      {
        id: 1,
        actorUserId: "user-admin",
        targetUserId: "user-target",
        previousRole: null,
        newRole: "viewer",
        changedAt: new Date("2026-08-30T10:00:00.000Z"),
      },
      {
        id: 2,
        actorUserId: "user-admin",
        targetUserId: "user-target",
        previousRole: "viewer",
        newRole: "editor",
        changedAt: new Date("2026-08-30T11:00:00.000Z"),
      },
    );

    const response = await request("/admin/access-changes", "user-admin");

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.changes, [
      {
        id: 2,
        actorUserId: "user-admin",
        targetUserId: "user-target",
        previousRole: "viewer",
        newRole: "editor",
        changedAt: "2026-08-30T11:00:00.000Z",
      },
      {
        id: 1,
        actorUserId: "user-admin",
        targetUserId: "user-target",
        previousRole: null,
        newRole: "viewer",
        changedAt: "2026-08-30T10:00:00.000Z",
      },
    ]);
  });

  it("rejects non-administrators from the access history endpoint", async () => {
    const response = await request("/admin/access-changes", "user-viewer");

    assert.equal(response.status, 403);
    assert.deepEqual(response.body, {
      error: "Administrator approval is required to run BQE data pulls.",
    });
  });
});