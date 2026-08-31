import { Router, type IRouter } from "express";
import { clerkClient } from "@clerk/express";
import { desc, eq } from "drizzle-orm";
import {
  bqeConnectionTable,
  bqeFingerprintKeysTable,
  bqePhase2ReconciliationRunsTable,
  bqePhase2MappingSourceTable,
  bqePhase2DiagnosticsTable,
  bqeProjectSourceMappingsTable,
  bqePullRunsTable,
  dashboardAccessChangesTable,
  db,
} from "@workspace/db";
import { BqeConnectionError, getBqeAccessToken, getBqeSandboxAccessToken } from "../lib/bqe";
import {
  requireDashboardAccess,
  requireDashboardAdmin,
  isAdminSelfRoleChange,
} from "../middlewares/requireDashboardAccess";
import {
  getLatestBqeReconciliation,
  runBqePhase1Pull,
} from "../lib/bqePull";
import {
  createPhase2Reconciliation,
  ensureFingerprintSeeds,
  getPhase2Run,
  toCsv,
} from "../lib/bqePhase2Reconciliation";

const router: IRouter = Router();
router.use(requireDashboardAccess);

type DashboardRole = "viewer" | "editor" | "admin";

function getDashboardRole(metadata: Record<string, unknown>): DashboardRole | null {
  return metadata.dashboardRole === "viewer" ||
    metadata.dashboardRole === "editor" ||
    metadata.dashboardRole === "admin"
    ? metadata.dashboardRole
    : null;
}

router.get("/bqe/test", async (req, res): Promise<void> => {
  try {
    const { accessToken, apiBase } = await getBqeAccessToken();
    const projectUrl = new URL(
      `${apiBase.replace(/\/+$/, "")}/project`,
    );
    projectUrl.searchParams.set("where", "code='23-0091'");

    const response = await fetch(projectUrl, {
      method: "GET",
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

router.get("/bqe/sandbox-test", requireDashboardAdmin, async (req, res): Promise<void> => {
  try {
    const { accessToken, apiBase } = await getBqeSandboxAccessToken();
    const projectUrl = new URL(`${apiBase.replace(/\/+$/, "")}/project`);
    projectUrl.searchParams.set("page", "1,1");
    const response = await fetch(projectUrl, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
      },
    });
    const body = await response.text();
    if (!response.ok) {
      req.log.error({ statusCode: response.status }, "BQE sandbox project request failed");
      res.status(502).json({ error: `BQE sandbox project request failed with HTTP ${response.status}.` });
      return;
    }
    res.type("application/json").send(body);
  } catch (error: unknown) {
    if (error instanceof BqeConnectionError) {
      req.log.error(
        { statusCode: error.statusCode, requiresReauthorization: error.requiresReauthorization },
        "BQE sandbox connection request failed",
      );
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    req.log.error({ err: error }, "BQE sandbox project request failed unexpectedly");
    res.status(502).json({ error: "BQE sandbox project request failed unexpectedly." });
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

router.get("/admin/phase2/reconciliation", requireDashboardAdmin, async (_req, res): Promise<void> => {
  const runs = await db.select().from(bqePhase2ReconciliationRunsTable)
    .orderBy(desc(bqePhase2ReconciliationRunsTable.createdAt)).limit(25);
  const latest = runs[0] ? await getPhase2Run(runs[0].id) : null;
  res.json({
    latest,
    runs: await Promise.all(runs.map(async (run) => {
      const detail = await getPhase2Run(run.id);
      return {
        id: run.id,
        sourcePullRunId: run.sourcePullRunId,
        asOfDate: run.asOfDate,
        anchorHours: Number(run.anchorHours),
        createdAt: run.createdAt.toISOString(),
        passed: run.overallPass,
        differenceHours: detail?.differenceHours ?? 0,
      };
    })),
  });
});

router.post("/admin/phase2/reconciliation", requireDashboardAdmin, async (req, res): Promise<void> => {
  try {
    const latest = await createPhase2Reconciliation(res.locals.userId);
    res.status(201).json(latest);
  } catch (error: unknown) {
    req.log.error({ err: error }, "Phase 2 reconciliation failed");
    res.status(422).json({ error: error instanceof Error ? error.message : "Phase 2 reconciliation failed." });
  }
});

router.post("/admin/phase2/seed-and-run", requireDashboardAdmin, async (req, res): Promise<void> => {
  try {
    await ensureFingerprintSeeds();
    const mappings = [
      ["Short Plat / SP", "Short Plat"],
      ["Subdivision", "Subdivision"],
      ["Site Plan", "Site Plan"],
      ["Topo", "Topographic Survey"],
      ["Boundary", "Boundary Survey"],
      ["ALTA", "ALTA Survey"],
      ["Plat", "Plat (general)"],
    ] as const;
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.insert(bqePhase2MappingSourceTable).values({
        id: 1,
        sourceKind: "name_pattern",
        sourceFieldKey: null,
        updatedBy: res.locals.userId,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: bqePhase2MappingSourceTable.id,
        set: {
          sourceKind: "name_pattern",
          sourceFieldKey: null,
          updatedBy: res.locals.userId,
          updatedAt: now,
        },
      });
      for (const [sourceValue, fingerprintKey] of mappings) {
        await tx.insert(bqeProjectSourceMappingsTable).values({
          sourceKind: "name_pattern",
          sourceFieldKey: "name_pattern",
          sourceValue,
          fingerprintKey,
          active: true,
          updatedBy: res.locals.userId,
          updatedAt: now,
        }).onConflictDoUpdate({
          target: [
            bqeProjectSourceMappingsTable.sourceKind,
            bqeProjectSourceMappingsTable.sourceFieldKey,
            bqeProjectSourceMappingsTable.sourceValue,
          ],
          set: { fingerprintKey, active: true, updatedBy: res.locals.userId, updatedAt: now },
        });
      }
    });
    const created = await createPhase2Reconciliation(res.locals.userId);
    const summary = created ? await getPhase2Run(created.id) : null;
    res.status(201).json(summary);
  } catch (error: unknown) {
    req.log.error({ err: error }, "Phase 2 name-pattern seed and reconciliation failed");
    res.status(422).json({ error: error instanceof Error ? error.message : "Phase 2 name-pattern seed and reconciliation failed." });
  }
});

router.get("/admin/phase2/mappings", requireDashboardAdmin, async (_req, res): Promise<void> => {
  await ensureFingerprintSeeds();
  const [fingerprints, sourceRows, latestRuns] = await Promise.all([
    db.select().from(bqeFingerprintKeysTable).orderBy(bqeFingerprintKeysTable.sortOrder),
    db.select().from(bqePhase2MappingSourceTable).where(eq(bqePhase2MappingSourceTable.id, 1)).limit(1),
    db.select().from(bqePhase2ReconciliationRunsTable).orderBy(desc(bqePhase2ReconciliationRunsTable.createdAt)).limit(1),
  ]);
  const source = sourceRows[0] ?? null;
  const mappingFieldKey = source?.sourceKind === "custom_field" ? source.sourceFieldKey : source?.sourceKind;
  const mappings = source?.sourceKind && mappingFieldKey
    ? await db.select().from(bqeProjectSourceMappingsTable).where(eq(bqeProjectSourceMappingsTable.sourceKind, source.sourceKind))
    : [];
  const diagnosticRows = latestRuns[0]
    ? await db.select().from(bqePhase2DiagnosticsTable).where(eq(bqePhase2DiagnosticsTable.runId, latestRuns[0].id))
    : [];
  const candidateFields = new Map<string, { fieldKey: string; label: string; values: Set<string>; projectCount: number; hours: number }>();
  for (const row of diagnosticRows.filter((row) => row.diagnosticKind === "custom_field")) {
    const fieldKey = row.fieldKey ?? row.fieldLabel ?? "(blank)";
    const label = row.fieldLabel ?? "(blank)";
    const key = `${fieldKey}\u0000${label}`;
    const candidate = candidateFields.get(key) ?? { fieldKey, label, values: new Set<string>(), projectCount: 0, hours: 0 };
    candidate.values.add(row.value);
    candidate.projectCount += row.projectCount;
    candidate.hours += Number(row.hours);
    candidateFields.set(key, candidate);
  }
  res.json({
    fingerprints,
    source: source ? { ...source, updatedAt: source.updatedAt?.toISOString() ?? null } : { sourceKind: null, sourceFieldKey: null, updatedBy: null, updatedAt: null },
    candidateFields: [...candidateFields.values()].map((candidate) => ({
      fieldKey: candidate.fieldKey,
      label: candidate.label,
      distinctValueCount: candidate.values.size,
      projectCount: candidate.projectCount,
      hours: candidate.hours,
    })),
    mappings: mappings.filter((mapping) => mapping.sourceFieldKey === mappingFieldKey)
      .map((mapping) => ({ ...mapping, updatedAt: mapping.updatedAt.toISOString() })),
  });
});

router.put("/admin/phase2/mapping-source", requireDashboardAdmin, async (req, res): Promise<void> => {
  const sourceKind = req.body?.sourceKind;
  const sourceFieldKey = req.body?.sourceFieldKey;
  if (sourceKind !== null && sourceKind !== "class" && sourceKind !== "custom_field" && sourceKind !== "name_pattern") {
    res.status(400).json({ error: "sourceKind must be null, class, custom_field, or name_pattern." }); return;
  }
  if (sourceKind === "custom_field" && (typeof sourceFieldKey !== "string" || !sourceFieldKey.trim())) {
    res.status(400).json({ error: "custom_field requires a custom field ID or exact label selector." }); return;
  }
  if (sourceKind !== "custom_field" && sourceFieldKey !== null && sourceFieldKey !== undefined) {
    res.status(400).json({ error: "Only custom_field accepts sourceFieldKey." }); return;
  }
  const now = new Date();
  await db.insert(bqePhase2MappingSourceTable).values({ id: 1, sourceKind, sourceFieldKey: sourceKind === "custom_field" ? sourceFieldKey : null, updatedBy: res.locals.userId, updatedAt: now })
    .onConflictDoUpdate({ target: bqePhase2MappingSourceTable.id, set: { sourceKind, sourceFieldKey: sourceKind === "custom_field" ? sourceFieldKey : null, updatedBy: res.locals.userId, updatedAt: now } });
  res.json({ sourceKind, sourceFieldKey: sourceKind === "custom_field" ? sourceFieldKey : null, updatedBy: res.locals.userId, updatedAt: now.toISOString() });
});

router.put("/admin/phase2/mappings/:sourceValue", requireDashboardAdmin, async (req, res): Promise<void> => {
  const sourceValue = Array.isArray(req.params.sourceValue) ? req.params.sourceValue[0] : req.params.sourceValue;
  const fingerprintKey = req.body?.fingerprintKey;
  const active = req.body?.active;
  if (!sourceValue || sourceValue.trim() !== sourceValue || !fingerprintKey || typeof fingerprintKey !== "string" || typeof active !== "boolean") {
    res.status(400).json({ error: "sourceValue, fingerprintKey, and boolean active are required; source spelling is case-sensitive." });
    return;
  }
  const source = (await db.select().from(bqePhase2MappingSourceTable).where(eq(bqePhase2MappingSourceTable.id, 1)).limit(1))[0];
  const mappingFieldKey = source?.sourceKind === "custom_field" ? source.sourceFieldKey : source?.sourceKind;
  if (!source?.sourceKind || !mappingFieldKey) { res.status(422).json({ error: "Select a mapping source before creating mappings." }); return; }
  await ensureFingerprintSeeds();
  const fingerprint = await db.select({ key: bqeFingerprintKeysTable.key }).from(bqeFingerprintKeysTable)
    .where(eq(bqeFingerprintKeysTable.key, fingerprintKey)).limit(1);
  if (!fingerprint[0]) { res.status(400).json({ error: "fingerprintKey is not a seeded fingerprint." }); return; }
  const now = new Date();
  await db.insert(bqeProjectSourceMappingsTable).values({ sourceKind: source.sourceKind, sourceFieldKey: mappingFieldKey, sourceValue, fingerprintKey, active, updatedBy: res.locals.userId, updatedAt: now })
    .onConflictDoUpdate({ target: [bqeProjectSourceMappingsTable.sourceKind, bqeProjectSourceMappingsTable.sourceFieldKey, bqeProjectSourceMappingsTable.sourceValue], set: { fingerprintKey, active, updatedBy: res.locals.userId, updatedAt: now } });
  res.json({ sourceKind: source.sourceKind, sourceFieldKey: mappingFieldKey, sourceValue, fingerprintKey, active, updatedBy: res.locals.userId, updatedAt: now.toISOString() });
});

router.get("/admin/phase2/reconciliation/:runId/:report.csv", requireDashboardAdmin, async (req, res): Promise<void> => {
  const runId = Array.isArray(req.params.runId) ? req.params.runId[0] : req.params.runId;
  const report = Array.isArray(req.params.report) ? req.params.report[0] : req.params.report;
  if (report !== "population" && report !== "exclusions") { res.status(404).json({ error: "Unknown Phase 2 CSV report." }); return; }
  const run = runId ? await getPhase2Run(runId) : null;
  if (!run) { res.status(404).json({ error: "Phase 2 reconciliation run not found." }); return; }
  const rows = run.dispositions.filter((item) => report === "population" ? item.disposition !== "excluded" : item.disposition === "excluded")
    .map((item) => ({ projectCode: item.projectCode, projectName: item.projectName, projectType: item.projectType, mappingSourceKind: item.mappingSourceKind, mappingSourceFieldKey: item.mappingSourceFieldKey, mappingSourceValue: item.mappingSourceValue, status: item.status, fingerprintKey: item.fingerprintKey, disposition: item.disposition, failedRules: item.failedRules.join("|"), hours: item.hours }));
  const filename = `phase2-${report}-${run.id}.csv`;
  res.attachment(filename).type("text/csv").send(toCsv(["projectCode", "projectName", "projectType", "mappingSourceKind", "mappingSourceFieldKey", "mappingSourceValue", "status", "fingerprintKey", "disposition", "failedRules", "hours"], rows));
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
  const previousRole = getDashboardRole(user.publicMetadata);
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
  const updatedRole = getDashboardRole(updated.publicMetadata);

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

    try {
      const reverted = await clerkClient.users.updateUserMetadata(userId, {
        publicMetadata: {
          ...updated.publicMetadata,
          dashboardRole: previousRole,
        },
      });
      const revertedRole = getDashboardRole(reverted.publicMetadata);
      if (revertedRole === previousRole) {
        req.log.error(
          {
            actorUserId: res.locals.userId,
            targetUserId: userId,
            previousRole,
            attemptedRole: updatedRole,
            auditRecorded: false,
            roleChangeReverted: true,
          },
          "Dashboard role change was reverted after access audit failure",
        );
        res.status(503).json({
          id: userId,
          role: revertedRole,
          auditRecorded: false,
          roleChangeReverted: true,
          error: "The dashboard role was not changed because its access history could not be saved.",
        });
        return;
      }
      throw new Error(`Clerk returned role ${String(revertedRole)} while reverting role change.`);
    } catch (revertError: unknown) {
      req.log.error(
        {
          err: revertError,
          actorUserId: res.locals.userId,
          targetUserId: userId,
          previousRole,
          currentRole: updatedRole,
          auditRecorded: false,
          roleChangeReverted: false,
          reconciliationRequired: true,
        },
        "Dashboard role change could not be reverted after access audit failure",
      );
      res.status(500).json({
        id: updated.id,
        role: updatedRole,
        auditRecorded: false,
        roleChangeReverted: false,
        reconciliationRequired: true,
        error:
          "The dashboard role changed, but its access history could not be saved or reconciled. Manual reconciliation is required.",
      });
      return;
    }
  }

  res.json({
    id: updated.id,
    role: updatedRole,
  });
});

export default router;