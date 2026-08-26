import type { NextFunction, Request, Response } from "express";
import { clerkClient, getAuth } from "@clerk/express";

export type DashboardRole = "viewer" | "editor";

async function approvedRole(userId: string): Promise<DashboardRole | undefined> {
  const user = await clerkClient.users.getUser(userId);
  const role = user.publicMetadata.dashboardRole;
  return role === "viewer" || role === "editor" ? role : undefined;
}

export async function requireDashboardAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = getAuth(req);
  const rawUserId = auth.sessionClaims?.userId || auth.userId;
  if (typeof rawUserId !== "string" || !rawUserId) {
    res.status(401).json({ error: "Sign in is required to access project health data." });
    return;
  }
  const role = await approvedRole(rawUserId);
  if (!role) {
    res.status(403).json({
      error: "Your account has not been approved for Project Health Dashboard access.",
    });
    return;
  }
  res.locals.userId = rawUserId;
  res.locals.dashboardRole = role;
  next();
}

export function requireDashboardEditor(_req: Request, res: Response, next: NextFunction): void {
  if (res.locals.dashboardRole !== "editor") {
    res.status(403).json({
      error: "Editor approval is required to change PM-controlled project fields.",
    });
    return;
  }
  next();
}