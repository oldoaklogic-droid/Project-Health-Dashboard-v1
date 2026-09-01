import { Router, type IRouter } from "express";
import { and, asc, eq, ilike, lte, or } from "drizzle-orm";
import {
  actionsTable,
  clientContactLogTable,
  db,
  intakesTable,
  leadsTable,
  localProjectsTable,
} from "@workspace/db";
import { requireDashboardAccess } from "../middlewares/requireDashboardAccess";
import { computePortfolio } from "../lib/projectHealth";

type SearchResult = {
  id: string;
  type: "project" | "client" | "contact" | "action" | "estimate" | "opportunity";
  title: string;
  subtitle: string;
  module: "projects" | "pipeline" | "estimating" | "manager";
  route: string;
  health?: string;
  pm?: string;
  dueDate?: string;
  status?: string;
};

const router: IRouter = Router();
router.use(requireDashboardAccess);

function queryText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= 2 && trimmed.length <= 100 ? trimmed : null;
}

function resultScore(result: SearchResult, query: string): number {
  const title = result.title.toLowerCase();
  const subtitle = result.subtitle.toLowerCase();
  const needle = query.toLowerCase();
  if (title === needle) return 0;
  if (title.startsWith(needle)) return 1;
  if (title.includes(needle)) return 2;
  if (subtitle.startsWith(needle)) return 3;
  return 4;
}

router.get("/search", async (req, res): Promise<void> => {
  const query = queryText(req.query.q);
  if (!query) {
    res.json({ results: [] });
    return;
  }

  const requestedLimit = Number(req.query.limit);
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(50, Math.max(1, requestedLimit))
    : 30;
  const pattern = `%${query.replace(/[%_]/g, "\\$&")}%`;
  const today = new Date().toISOString().slice(0, 10);
  const urgentSearch = /^(urgent|overdue|open actions?)$/i.test(query);

  try {
    const [portfolio, actions, intakes, leads, localProjects, contactLogs] = await Promise.all([
      computePortfolio(),
      db.select().from(actionsTable).where(
        urgentSearch
          ? and(eq(actionsTable.status, "open"), lte(actionsTable.dueDate, today))
          : or(ilike(actionsTable.what, pattern), ilike(actionsTable.ownerEmployeeId, pattern)),
      ).orderBy(asc(actionsTable.dueDate)).limit(12),
      db.select().from(intakesTable).where(or(
        ilike(intakesTable.client, pattern),
        ilike(intakesTable.contact, pattern),
        ilike(intakesTable.email, pattern),
        ilike(intakesTable.phone, pattern),
        ilike(intakesTable.address, pattern),
        ilike(intakesTable.primaryRequest, pattern),
      )).limit(12),
      db.select().from(leadsTable).where(or(
        ilike(leadsTable.who, pattern),
        ilike(leadsTable.what, pattern),
        ilike(leadsTable.where, pattern),
        ilike(leadsTable.source, pattern),
        ilike(leadsTable.spotter, pattern),
        ilike(leadsTable.status, pattern),
      )).limit(12),
      db.select().from(localProjectsTable).where(or(
        ilike(localProjectsTable.projectNumber, pattern),
        ilike(localProjectsTable.name, pattern),
        ilike(localProjectsTable.client, pattern),
        ilike(localProjectsTable.pm, pattern),
        ilike(localProjectsTable.address, pattern),
      )).limit(12),
      db.select().from(clientContactLogTable).where(or(
        ilike(clientContactLogTable.summary, pattern),
        ilike(clientContactLogTable.method, pattern),
        ilike(clientContactLogTable.loggedBy, pattern),
      )).orderBy(asc(clientContactLogTable.contactDate)).limit(8),
    ]);

    const portfolioProjects = portfolio.projects.filter((project) => {
      const searchable = [project.number, project.name, project.client, project.pm, project.riskLine, project.actionLine]
        .join(" ")
        .toLowerCase();
      return searchable.includes(query.toLowerCase());
    }).slice(0, 15);
    const projectById = new Map(
      portfolio.projects.flatMap((project) => [[project.id, project], [project.number, project]] as const),
    );

    const results: SearchResult[] = [];
    const seenClients = new Set<string>();
    const addClient = (client: string, route: string, subtitle: string) => {
      const key = client.trim().toLowerCase();
      if (!key || seenClients.has(key)) return;
      seenClients.add(key);
      results.push({
        id: `client:${key}`,
        type: "client",
        title: client,
        subtitle,
        module: route.startsWith("/pipeline") ? "pipeline" : "projects",
        route,
      });
    };

    for (const project of portfolioProjects) {
      results.push({
        id: `project:${project.id}`,
        type: "project",
        title: `${project.number} · ${project.name}`,
        subtitle: project.client,
        module: "projects",
        route: `/projects/${encodeURIComponent(project.id)}`,
        health: project.severity,
        pm: project.pm || undefined,
      });
      if (project.client.toLowerCase().includes(query.toLowerCase())) {
        addClient(project.client, `/projects/${encodeURIComponent(project.id)}`, `Client · Project ${project.number}`);
      }
    }

    for (const project of localProjects) {
      results.push({
        id: `local-project:${project.id}`,
        type: "project",
        title: `${project.projectNumber} · ${project.name}`,
        subtitle: `${project.client} · ${project.status}`,
        module: "estimating",
        route: `/estimating/${encodeURIComponent(project.intakeId)}`,
        pm: project.pm,
        dueDate: project.dueDate ?? undefined,
      });
      if (project.client.toLowerCase().includes(query.toLowerCase())) {
        addClient(project.client, `/estimating/${encodeURIComponent(project.intakeId)}`, `Client · Project ${project.projectNumber}`);
      }
    }

    for (const action of actions) {
      if (urgentSearch && action.dueDate && action.dueDate > today) continue;
      const project = action.projectId ? projectById.get(action.projectId) : undefined;
      results.push({
        id: `action:${action.id}`,
        type: "action",
        title: action.what,
        subtitle: project ? `${project.number} · ${project.name}` : action.status === "open" ? "Open action" : "Closed action",
        module: project ? "projects" : "manager",
        route: project ? `/projects/${encodeURIComponent(project.id)}` : "/manager",
        health: project?.severity,
        pm: action.ownerEmployeeId ?? project?.pm ?? undefined,
        dueDate: action.dueDate ?? undefined,
        status: action.status,
      });
    }

    for (const intake of intakes) {
      const route = `/pipeline/${encodeURIComponent(intake.id)}`;
      if (intake.contact && [intake.contact, intake.email, intake.phone].filter(Boolean).join(" ").toLowerCase().includes(query.toLowerCase())) {
        results.push({
          id: `contact:${intake.id}`,
          type: "contact",
          title: intake.contact,
          subtitle: [intake.client, intake.email, intake.phone].filter(Boolean).join(" · "),
          module: "pipeline",
          route,
        });
      }
      results.push({
        id: `estimate:${intake.id}`,
        type: "estimate",
        title: `Estimate · ${intake.client}`,
        subtitle: intake.primaryRequest || intake.address || "Project intake estimate",
        module: "estimating",
        route: `/estimating/${encodeURIComponent(intake.id)}`,
        dueDate: intake.targetCompletion ?? undefined,
        status: intake.estimateApprovedAt ? "Approved" : "Draft",
      });
      if (intake.client.toLowerCase().includes(query.toLowerCase())) {
        addClient(intake.client, route, "Client · Pipeline intake");
      }
    }

    for (const lead of leads) {
      results.push({
        id: `opportunity:${lead.id}`,
        type: "opportunity",
        title: lead.who,
        subtitle: [lead.what, lead.where].filter(Boolean).join(" · "),
        module: "pipeline",
        route: "/pipeline",
        pm: lead.spotter,
        status: lead.status,
      });
    }

    for (const contact of contactLogs) {
      const project = projectById.get(contact.projectId);
      results.push({
        id: `contact-log:${contact.id}`,
        type: "contact",
        title: contact.summary,
        subtitle: project ? `${contact.method} · ${project.client} · ${project.number}` : `${contact.method} · Client contact`,
        module: project ? "projects" : "manager",
        route: project ? `/projects/${encodeURIComponent(project.id)}` : "/manager",
        pm: contact.loggedBy,
        dueDate: contact.contactDate,
      });
    }

    results.sort((a, b) => resultScore(a, query) - resultScore(b, query) || a.title.localeCompare(b.title));
    res.json({ results: results.slice(0, limit) });
  } catch (error) {
    req.log.error({ err: error }, "Global search failed");
    res.status(500).json({ error: "Search is temporarily unavailable." });
  }
});

export default router;