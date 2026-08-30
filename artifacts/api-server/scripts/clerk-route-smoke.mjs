import { clerkClient } from "@clerk/express";
import { randomUUID } from "node:crypto";

const origin = process.env.SMOKE_ORIGIN ??
  (process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : undefined);

if (!origin) {
  throw new Error("Set SMOKE_ORIGIN or REPLIT_DEV_DOMAIN before running the auth smoke check.");
}

const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
const createdUserIds = [];
const createdSessionIds = [];

async function createIdentity(role) {
  const label = role ?? "unapproved";
  const user = await clerkClient.users.createUser({
    emailAddress: [`route-smoke-${label}-${suffix}@example.com`],
    firstName: "Route",
    lastName: "Smoke",
    skipPasswordRequirement: true,
    publicMetadata: role ? { dashboardRole: role } : {},
  });
  createdUserIds.push(user.id);

  const session = await clerkClient.sessions.createSession({ userId: user.id });
  createdSessionIds.push(session.id);
  const token = await clerkClient.sessions.getToken(session.id);
  return token.jwt;
}

async function request(path, token, init = {}) {
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init.body) headers.set("content-type", "application/json");

  const response = await fetch(new URL(path, origin), {
    ...init,
    headers,
  });
  return {
    status: response.status,
    text: await response.text(),
  };
}

function containsProjectCode(text) {
  try {
    return JSON.stringify(JSON.parse(text)).includes("23-0091");
  } catch {
    return false;
  }
}

async function cleanup() {
  for (const sessionId of createdSessionIds) {
    try {
      await clerkClient.sessions.revokeSession(sessionId);
    } catch {
      // Deleting the test user below also invalidates its sessions.
    }
  }

  for (const userId of createdUserIds) {
    try {
      await clerkClient.users.deleteUser(userId);
    } catch {
      // Cleanup errors must not expose user or credential details.
    }
  }
}

try {
  await clerkClient.users.getUserList({ limit: 1 });

  const viewerToken = await createIdentity("viewer");
  const editorToken = await createIdentity("editor");
  const adminToken = await createIdentity("admin");
  const unapprovedToken = await createIdentity();

  const [
    viewerRead,
    adminRead,
    unapprovedRead,
    anonymousRead,
    viewerMutation,
    editorMutation,
    adminMutation,
  ] =
    await Promise.all([
      request("/api/bqe/test", viewerToken),
      request("/api/bqe/test", adminToken),
      request("/api/bqe/test", unapprovedToken),
      request("/api/bqe/test"),
      request("/api/projects/__auth_smoke__", viewerToken, {
        method: "PATCH",
        body: JSON.stringify({ etcHours: "not-a-number" }),
      }),
      request("/api/projects/__auth_smoke__", editorToken, {
        method: "PATCH",
        body: JSON.stringify({ etcHours: "not-a-number" }),
      }),
      request("/api/projects/__auth_smoke__", adminToken, {
        method: "PATCH",
        body: JSON.stringify({ etcHours: "not-a-number" }),
      }),
    ]);

  const summary = {
    credentialValid: true,
    viewerReadStatus: viewerRead.status,
    viewerReadHasExpectedProject: containsProjectCode(viewerRead.text),
    adminReadStatus: adminRead.status,
    adminReadHasExpectedProject: containsProjectCode(adminRead.text),
    unapprovedReadStatus: unapprovedRead.status,
    anonymousReadStatus: anonymousRead.status,
    viewerMutationStatus: viewerMutation.status,
    editorMutationStatus: editorMutation.status,
    editorPassedMutationGate: editorMutation.status === 400,
    adminMutationStatus: adminMutation.status,
    adminPassedMutationGate: adminMutation.status === 400,
  };

  console.log(JSON.stringify(summary));

  const passed =
    summary.viewerReadStatus === 200 &&
    summary.viewerReadHasExpectedProject &&
    summary.adminReadStatus === 200 &&
    summary.adminReadHasExpectedProject &&
    summary.unapprovedReadStatus === 403 &&
    summary.anonymousReadStatus === 401 &&
    summary.viewerMutationStatus === 403 &&
    summary.editorPassedMutationGate &&
    summary.adminPassedMutationGate;

  if (!passed) process.exitCode = 1;
} catch (error) {
  const status =
    typeof error === "object" && error && "status" in error
      ? error.status
      : undefined;
  console.error(JSON.stringify({ error: "auth_smoke_failed", status }));
  process.exitCode = 1;
} finally {
  await cleanup();
}