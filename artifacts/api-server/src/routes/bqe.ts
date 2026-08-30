import { Router, type IRouter } from "express";
import { clerkClient } from "@clerk/express";
import { desc, eq } from "drizzle-orm";
import {
  bqeConnectionTable,
  bqePullRunsTable,
  dashboardAccessChangesTable,
  db,
} from "@workspace/db";
import { BqeConnectionError, getBqeAccessToken } from "../lib/bqe";
import {
  requireDashboardAccess,
  requireDashboardAdmin,
  isAdminSelfRoleChange,
} from "../middlewares/requireDashboardAccess";
import {
  getLatestBqeReconciliation,
  runBqePhase1Pull,
} from "../lib/bqePull";

const router: IRouter = Router();
router.use(requireDashboardAccess);

router.get("/bqe/test", async (req, res): Promise<void> => {
  try {
    const { accessToken, apiBase } = await getBqeAccessToken();
    const projectUrl = new URL(
      `${apiBase.replace(/\/+$/, "")}/project`,
    );
    projectUrl.searchParams.set("where", "code='23-0091'");

    const response = await fetch(projectUrl, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
      },
    });
    const body = await response.text();

    if (!response.ok) {
      req.log.error(
        { statusCode: response.status },
        "BQE project request failed",
      );
      res.status(502).json({
        error: `BQE project request failed with HTTP ${response.status}.`,
      });
      return;
    }

    res.type("application/json").send(body);
  } catch (error: unknown) {
    if (error instanceof BqeConnectionError) {
      req.log.error(
        {
          statusCode: error.statusCode,
          requiresReauthorization: error.requiresReauthorization,
        },
        "BQE connection request failed",
      );
      res.status(error.statusCode).json({
        error: error.message,
      });
      return;
    }

    req.log.error({ err: error }, "BQE project request failed unexpectedly");
    res.status(502).json({
      error: "BQE project request failed unexpectedly.",
    });
  }
});

router.post("/bqe/pull", requireDashboardAdmin, async (req, res): Promise<void> => {
  try {
    const result = await runBqePhase1Pull();
    res.status(result.status === "completed" ? 200 : result.status === "partial" ? 207 : 500).json(result);
  } catch (error: unknown) {
    req.log.error({ err: error }, "BQE Phase 1 pull failed unexpectedly");
    res.status(500).json({
      error: "BQE Phase 1 pull failed unexpectedly.",
    });
  }
});

router.get("/bqe/reconciliation", async (_req, res): Promise<void> => {
  const summary = await getLatestBqeReconciliation();
  if (!summary) {
    res.status(404).json({
      error: "No BQE reconciliation is available. Run the Phase 1 pull first.",
    });
    return;
  }
  res.json(summary);
});

router.get("/admin/status", requireDashboardAdmin, async (_req, res): Promise<void> => {
  const [connections, latestRuns] = await Promise.all([
    db
      .select({
        apiEndpoint: bqeConnectionTable.apiEndpoint,
        refreshedAt: bqeConnectionTable.refreshedAt,
      })
      .from(bqeConnectionTable)
      .where(eq(bqeConnectionTable.id, 1))
      .limit(1),
    db
      .select()
      .from(bqePullRunsTable)
      .orderBy(desc(bqePullRunsTable.startedAt))
      .limit(1),
  ]);
  const connection = connections[0] ?? null;
  const latestPull = latestRuns[0] ?? null;
  let apiHost: string | null = null;
  if (connection?.apiEndpoint) {
    try {
      apiHost = new URL(connection.apiEndpoint).hostname;
    } catch {
      apiHost = null;
    }
  }
  res.json({
    connection: {
      configured: Boolean(connection),
      apiHost,
      refreshedAt: connection?.refreshedAt?.toISOString() ?? null,
      tokenSource: "PostgreSQL",
    },
    keepalive: {
      enabled: true,
      intervalDays: 7,
    },
    latestPull: latestPull
      ? {
          id: latestPull.id,
          status: latestPull.status,
          startedAt: latestPull.startedAt.toISOString(),
          completedAt: latestPull.completedAt?.toISOString() ?? null,
          objectCounts: latestPull.objectCounts,
          errors: latestPull.errors,
        }
      : null,
  });
});

router.get("/admin/users", requireDashboardAdmin, async (_req, res): Promise<void> => {
  const result = await clerkClient.users.getUserList({ limit: 100 });
  res.json({
    users: result.data.map((user) => ({
      id: user.id,
      name: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Unnamed user",
      email:
        user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId)
          ?.emailAddress ??
        user.emailAddresses[0]?.emailAddress ??
        "No email",
      role:
        user.publicMetadata.dashboardRole === "viewer" ||
        user.publicMetadata.dashboardRole === "editor" ||
        user.publicMetadata.dashboardRole === "admin"
          ? user.publicMetadata.dashboardRole
          : null,
    })),
  });
});

router.get("/admin/access-changes", requireDashboardAdmin, async (_req, res): Promise<void> => {
  const changes = await db
    .select()
    .from(dashboardAccessChangesTable)
    .orderBy(desc(dashboardAccessChangesTable.changedAt))
    .limit(25);

  res.json({
    changes: changes.map((change) => ({
      id: change.id,
      actorUserId: change.actorUserId,
      targetUserId: change.targetUserId,
      previousRole: change.previousRole,
      newRole: change.newRole,
      changedAt: change.changedAt.toISOString(),
    })),
  });
});

router.patch("/admin/users/:userId/role", requireDashboardAdmin, async (req, res): Promise<void> => {
  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  if (!userId) {
    res.status(400).json({ error: "A Clerk user ID is required." });
    return;
  }
  const requestedRole = req.body?.role;
  if (
    requestedRole !== null &&
    requestedRole !== "viewer" &&
    requestedRole !== "editor" &&
    requestedRole !== "admin"
  ) {
    res.status(400).json({ error: "Role must be viewer, editor, admin, or null." });
    return;
  }
  if (
    isAdminSelfRoleChange(
      res.locals.userId,
      res.locals.dashboardRole,
      userId,
      requestedRole,
    )
  ) {
    req.log.warn(
      {
        actorUserId: res.locals.userId,
        targetUserId: userId,
        requestedRole,
      },
      "Rejected administrator self-lockout role change",
    );
    res.status(403).json({
      error: "You cannot remove or downgrade your own administrator role.",
    });
    return;
  }
  const user = await clerkClient.users.getUser(userId);
  const previousRole =
    user.publicMetadata.dashboardRole === "viewer" ||
    user.publicMetadata.dashboardRole === "editor" ||
    user.publicMetadata.dashboardRole === "admin"
      ? user.publicMetadata.dashboardRole
      : null;
  if (previousRole === requestedRole) {
    res.json({
      id: user.id,
      role: previousRole,
    });
    return;
  }
  const updated = await clerkClient.users.updateUserMetadata(userId, {
    publicMetadata: {
      ...user.publicMetadata,
      dashboardRole: requestedRole,
    },
  });
  const updatedRole =
    updated.publicMetadata.dashboardRole === "viewer" ||
    updated.publicMetadata.dashboardRole === "editor" ||
    updated.publicMetadata.dashboardRole === "admin"
      ? updated.publicMetadata.dashboardRole
      : null;

  try {
    await db.insert(dashboardAccessChangesTable).values({
      actorUserId: res.locals.userId,
      targetUserId: userId,
      previousRole,
      newRole: updatedRole,
    });
  } catch (error: unknown) {
    req.log.error(
      {
        err: error,
        actorUserId: res.locals.userId,
        targetUserId: userId,
        previousRole,
        newRole: updatedRole,
      },
      "Dashboard role changed but access audit record could not be saved",
    );
    res.status(500).json({
      error: "The dashboard role changed, but its access history could not be saved.",
    });
    return;
  }

  res.json({
    id: updated.id,
    role: updatedRole,
  });
});

export default router;