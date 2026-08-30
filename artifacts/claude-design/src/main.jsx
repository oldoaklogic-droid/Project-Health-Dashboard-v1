import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ClerkProvider,
  Show,
  SignIn,
  SignUp,
  useClerk,
  useUser,
} from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import "./styles.css";

// SVG Icons
const HomeIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const BarChartIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
const FolderIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>;
const CalculatorIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg>;
const TrendingUpIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>;
const UsersIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const SettingsIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;

const tabs = [
  ["exec", "Executive"],
  ["table", "Project table"],
  ["card", "Project card"],
  ["tuesday", "Tuesday review"],
  ["pm", "PM guide"],
  ["homes", "Field homes"],
];

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const percent = (value) => `${Math.round(value)}%`;
const metricValue = (value, formatter = number) => value == null ? "—" : formatter.format(value);
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const hubPages = new Set(["home", "reports", "projects", "estimating", "pipeline", "manager", "admin"]);
const pageMeta = {
  home: { code: "COVER", label: "CDI Operations Hub", title: "Operations index", description: "The operating system for Complete Design's projects, estimates, and reporting." },
  reports: { code: "R-100", label: "Reports", title: "Project health reports", description: "Review controlled project evidence, financials, and PM updates." },
  projects: { code: "P-100", label: "Projects", title: "Live project tracking", description: "Review reconciled records for active projects." },
  estimating: { code: "E-100", label: "Estimating", title: "Project estimating", description: "Prepare consistent scope, effort, and fee decisions." },
  pipeline: { code: "L-100", label: "Pipeline", title: "Project pipeline", description: "Track the path from lead to active project." },
  manager: { code: "M-100", label: "Manager Dashboard", title: "Manager dashboard", description: "Prepare for Tuesday review with a clear team view." },
  admin: { code: "X-100", label: "Admin", title: "System administration", description: "Manage connection health, refreshes, and dashboard access." },
};
const pageFromPath = (pathname) => {
  const relative = pathname.slice(basePath.length).replace(/^\/+|\/+$/g, "");
  const page = relative.split("/")[0] || "home";
  return hubPages.has(page) ? page : "home";
};
const pathForPage = (page) => `${basePath}${page === "home" ? "/" : `/${page}`}`;

const clerkAppearance = {
  variables: {
    colorPrimary: "#3F78B0",
    colorForeground: "#16283E",
    colorMutedForeground: "#587087",
    colorBackground: "#FFFFFF",
    colorInput: "#FFFFFF",
    colorInputForeground: "#16283E",
    colorDanger: "#B9472A",
    colorNeutral: "#B8D4E8",
    fontFamily: "\"Inter\", system-ui, sans-serif",
    borderRadius: "2px",
  },
  options: {
    logoPlacement: "inside",
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/cdi-logo-color.webp`,
  },
  elements: {
    cardBox: { backgroundColor: "#FFFFFF", border: "1px solid #B8D4E8", borderRadius: "2px", width: "440px", maxWidth: "100%" },
    card: { boxShadow: "0 8px 30px rgba(22, 40, 62, 0.08)", backgroundColor: "transparent" },
    footer: { boxShadow: "none", backgroundColor: "transparent" },
    headerTitle: { color: "#16283E", fontFamily: "\"Archivo\", system-ui, sans-serif", fontWeight: 700 },
    headerSubtitle: { color: "#587087" },
    formFieldLabel: { color: "#16283E" },
    formButtonPrimary: { backgroundColor: "#3F78B0", color: "#FFFFFF", fontWeight: 600 },
    footerActionLink: { color: "#3F78B0" },
    footerActionText: { color: "#587087" },
  },
};

function Blueprint({ children, className = "" }) {
  return <section className={`blueprint ${className}`}>{children}</section>;
}

function SheetTitleBlock({ page, userName, accessLabel = "Approved user" }) {
  const meta = pageMeta[page] ?? pageMeta.home;
  const date = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "2-digit" }).format(new Date());
  return (
    <footer className="title-block" data-testid="title-block">
      <div className="title-cell title-firm"><img src={`${basePath}/cdi-logo-white.png`} alt="Complete Design, Inc." /><span>Complete Design, Inc.</span></div>
      <div className="title-cell title-hub"><span className="title-label">Project set</span><strong>CDI OPERATIONS HUB</strong></div>
      <div className="title-cell"><span className="title-label">Date</span><strong>{date}</strong></div>
      <div className="title-cell"><span className="title-label">{accessLabel}</span><strong>{userName || "Invitation only"}</strong></div>
      <div className="title-cell title-sheet"><span className="title-label">Sheet</span><strong>{page === "home" ? "SHEET 01" : `${meta.code}`}</strong></div>
    </footer>
  );
}

function SheetPage({ page, userName, children }) {
  const meta = pageMeta[page] ?? pageMeta.home;
  const status = ["reports", "projects", "admin", "home"].includes(page) ? "ISSUED" : `IN DEVELOPMENT — PHASE ${page === "estimating" ? "2" : page === "manager" ? "6" : "7"}`;
  return (
    <div className={`sheet-page sheet-page-${page}`} data-testid={`sheet-page-${page}`}>
      {page !== "home" && (
        <header className="wing-heading">
          <div>
            <span className="sheet-code heading-code">{meta.code}</span>
            <span className="sheet-label">{meta.label}</span>
            <h1>{meta.title}</h1>
            <p>{meta.description}</p>
          </div>
          <span className={`status-stamp heading-stamp ${status === "ISSUED" ? "issued" : "development"}`}>{status}</span>
        </header>
      )}
      {children}
      <SheetTitleBlock page={page} userName={userName} />
    </div>
  );
}

// Hub Views
function HomeView({ onNavigate, isAdmin, userName }) {
  const wings = [
    ["R-100", "Reports", "Review project health, financials, and Tuesday actions.", "issued", "reports"],
    ["P-100", "Projects", "Open reconciled records for active projects.", "issued", "projects"],
    ["E-100", "Estimating", "Prepare scope, effort, and fee decisions.", "phase2", "estimating"],
    ["L-100", "Pipeline", "Track leads through contract and project start.", "phase7", "pipeline"],
    ["M-100", "Manager Dashboard", "Prepare team priorities for Tuesday review.", "phase6", "manager"],
  ];
  if (isAdmin) wings.push(["X-100", "Admin", "Manage BQE refreshes and dashboard access.", "issued", "admin"]);
  return (
    <div className="home-view sheet-content fade-in" data-testid="home-view">
      <img className="contour-lines" src={`${basePath}/contour-lines.svg`} alt="" aria-hidden="true" />
      <div className="home-hero drawing-hero">
        <div className="hero-mark"><img src={`${basePath}/cdi-logo-color.webp`} alt="Complete Design, Inc." /></div>
        <span className="sheet-label">Complete Design, Inc.</span>
        <h1>CDI Operations Hub</h1>
        <p className="tagline">Where Vision Becomes Legacy</p>
        <p className="hero-sentence">The operating system for Complete Design's projects, estimates, and reporting.</p>
      </div>
      <section className="drawing-index" aria-labelledby="drawing-index-title">
        <div className="index-heading"><span className="sheet-label">Drawing index</span><h2 id="drawing-index-title">Operations sheets</h2><span className="sheet-label">Issued for internal use</span></div>
        <div className="index-table">
          <div className="index-table-head"><span>Sheet</span><span>Wing</span><span>Description</span><span>Status</span></div>
          {wings.map(([code, name, description, status, page]) => (
            <button className="index-row" key={code} onClick={() => onNavigate(page)} data-testid={`index-${page}`}>
              <span className="sheet-code">{code}</span><strong>{name}</strong><span className="index-description">{description}</span>
              <span className={`status-stamp ${status === "issued" ? "issued" : "development"}`}>{status === "issued" ? "ISSUED" : `IN DEVELOPMENT — PHASE ${status.replace("phase", "")}`}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ReportsView({ data, access, view, setView, query, setQuery, pmFilter, setPmFilter, priority, setPriority, selectedCode, setSelectedCode, updateProject, openCard }) {
  const projects = data?.projects ?? [];
  const selected = projects.find((project) => project.code === selectedCode) ?? projects[0];
  const filtered = useMemo(() => projects.filter((project) => {
    const searchable = `${project.code} ${project.name} ${project.client}`.toLowerCase();
    return (!query || searchable.includes(query.toLowerCase()))
      && (pmFilter === "All PMs" || project.pm === pmFilter)
      && (priority === "All exceptions" || project.priority === priority);
  }), [projects, query, pmFilter, priority]);

  return (
    <div className="reports-view fade-in" data-testid="reports-view">
      <header className="reports-header">
        <div>
          <h2>Reports Dashboard</h2>
          <p className="muted">Day 30 baseline — the dashboard shows what BQE can prove today.</p>
        </div>
        <div className="controlled-source">
          <div className="overline muted">Controlled source</div>
          <strong>PROJECT_HEALTH_V1</strong>
          <div className="muted small">BQE extract {data?.extractDate ?? "—"} · PM overlay {data?.overlayUpdated ?? "—"}</div>
        </div>
      </header>
      <nav className="tabs" aria-label="Project health views">
        {tabs.map(([key, label]) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)} data-testid={`tab-${key}`}>{label}</button>)}
      </nav>
      <div className="reports-content pt-6 pb-6">
        <BqeStatus status={data.bqe} />
        {view === "exec" && <Executive summary={data.summary} projects={projects} bqe={data.bqe} onOpen={openCard} />}
        {view === "table" && <ProjectTable projects={filtered} query={query} setQuery={setQuery} pmFilter={pmFilter} setPmFilter={setPmFilter} priority={priority} setPriority={setPriority} onOpen={openCard} />}
        {view === "card" && <ProjectCard project={selected} projects={projects} onSelect={setSelectedCode} onSave={updateProject} canEdit={Boolean(access?.canEdit)} />}
        {view === "tuesday" && <TuesdayReview projects={projects} onOpen={openCard} />}
        {view === "pm" && <PmGuide />}
        {view === "homes" && <FieldHomes />}
      </div>
    </div>
  );
}

function ProjectsView({ projects, onOpen }) {
  const targetCodes = ["23-0091", "23-0147", "24-0022"];
  const focusedProjects = targetCodes.map(code => projects.find(p => p.code === code)).filter(Boolean);

  return (
    <div className="content fade-in" data-testid="projects-view">
      <div className="page-header">
        <h2>Live Project Tracking</h2>
        <p className="muted">Focused reconciled records for key active projects.</p>
      </div>

      {focusedProjects.length > 0 ? (
        <div className="focused-projects-list">
          {focusedProjects.map(project => (
            <Blueprint key={project.code} className="focused-project-card">
              <div className="focused-project-header">
                <div>
                  <h3>{project.code} — {project.name}</h3>
                  <p className="muted">{project.client} · PM: {project.pm}</p>
                </div>
                <button className="secondary" onClick={() => onOpen(project.code)}>View Details</button>
              </div>
              <div className="finance-grid compact mt-4">
                <div className="finance">
                  <small className="muted">Actual Hours</small>
                  <strong>{metricValue(project.actualHours)}</strong>
                </div>
                <div className="finance">
                  <small className="muted">Budget Hours</small>
                  <strong>{metricValue(project.budgetHours)}</strong>
                </div>
                <div className="finance">
                  <small className="muted">Invoiced</small>
                  <strong>{metricValue(project.invoicedAmount, money)}</strong>
                </div>
                <div className="finance">
                  <small className="muted">Paid</small>
                  <strong>{metricValue(project.paidAmount, money)}</strong>
                </div>
              </div>

              {project.reconciliationHours !== null && (
                <div className="table-wrap mt-6 pt-6 border-t">
                  <h4 className="mb-3">2026 Reconciliation</h4>
                  <table>
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>Exact project</th>
                        <th>Parent + child projects</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Hours</td>
                        <td>{metricValue(project.reconciliationHours)}</td>
                        <td>{metricValue(project.reconciliationRolledUpHours)}</td>
                      </tr>
                      <tr>
                        <td>Invoiced</td>
                        <td>{metricValue(project.reconciliationInvoicedAmount, money)}</td>
                        <td>{metricValue(project.reconciliationRolledUpInvoicedAmount, money)}</td>
                      </tr>
                      <tr>
                        <td>Paid</td>
                        <td>{metricValue(project.reconciliationPaidAmount, money)}</td>
                        <td>{metricValue(project.reconciliationRolledUpPaidAmount, money)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </Blueprint>
          ))}
        </div>
      ) : (
        <Blueprint className="empty-state placeholder-panel pt-6 pb-6">
           <div className="placeholder-icon"><FolderIcon /></div>
           <h2>No target projects found</h2>
           <p className="muted">Target projects not found in current payload.</p>
        </Blueprint>
      )}

      <Blueprint className="phase2-notice mt-6">
        <div className="notice-icon"><FolderIcon /></div>
        <div className="notice-content">
          <h3>In development — Phase 2</h3>
          <p className="muted">Comprehensive project management workflows, scheduling integration, and expanded project views are scheduled for Phase 2.</p>
        </div>
      </Blueprint>
    </div>
  );
}

function EstimatingView() {
  const tools = [
    ["Project Estimator", "Build a structured estimate for a single project and discipline."],
    ["Multi-Discipline Estimator", "Coordinate scope, effort, and fees across CDI disciplines."],
    ["Principal’s Worksheet", "Review assumptions, risk, and final pricing before authorization."],
  ];
  return (
    <div className="content fade-in" data-testid="estimating-view">
      <div className="page-header"><span className="overline">Estimating</span><h2>From opportunity to confident fee</h2><p className="muted">Purpose-built tools for consistent scope and pricing decisions.</p></div>
      <div className="module-grid">
        {tools.map(([title, description]) => <Blueprint className="module-card" key={title}><div className="placeholder-icon"><CalculatorIcon /></div><span className="phase2-badge">In development</span><h3>{title}</h3><p className="muted">{description}</p></Blueprint>)}
      </div>
    </div>
  );
}

function PipelineView() {
  const stages = ["Lead", "Intake", "Estimate", "Contract", "Project"];
  return <div className="content fade-in" data-testid="pipeline-view">
    <div className="page-header"><span className="overline">Pipeline</span><h2>A clear path from lead to project</h2><p className="muted">A shared operating view for business development and project activation.</p></div>
    <Blueprint className="flow-panel">
      <div className="pipeline-flow">{stages.map((stage, index) => <React.Fragment key={stage}><div className="flow-stage" data-testid={`pipeline-stage-${stage.toLowerCase()}`}><span>{String(index + 1).padStart(2, "0")}</span><strong>{stage}</strong></div>{index < stages.length - 1 && <i aria-hidden="true">→</i>}</React.Fragment>)}</div>
      <div className="phase2-badge">In development — Phase 7</div>
    </Blueprint>
  </div>;
}

function ManagerView() {
  return <div className="content fade-in" data-testid="manager-view">
    <div className="page-header"><span className="overline">Manager Dashboard</span><h2>Every PM prepared for Tuesday</h2><p className="muted">The future manager view will turn project evidence into a focused coaching and accountability rhythm.</p></div>
    <div className="module-grid manager-grid">
      <Blueprint className="module-card"><div className="placeholder-icon"><UsersIcon /></div><h3>Per-PM Tuesday review</h3><p className="muted">A role-focused exception queue for deliverables, blockers, client contact, and owned next actions.</p></Blueprint>
      <Blueprint className="module-card"><div className="placeholder-icon"><BarChartIcon /></div><h3>Team KPI view</h3><p className="muted">A concise portfolio view of workload, evidence coverage, financial exposure, and follow-through.</p></Blueprint>
    </div>
    <div className="phase2-badge">In development</div>
  </div>;
}

function AdminView({ dashboard, currentUserId, onDashboardReload }) {
  const [status, setStatus] = useState(null);
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const loadAdmin = async () => {
    setLoading(true);
    setMessage("");
    try {
      const [statusResponse, usersResponse] = await Promise.all([
        fetch("/api/admin/status", { credentials: "include" }),
        fetch("/api/admin/users", { credentials: "include" }),
      ]);
      if (!statusResponse.ok || !usersResponse.ok) throw new Error("Admin data could not be loaded.");
      const [statusPayload, usersPayload] = await Promise.all([statusResponse.json(), usersResponse.json()]);
      setStatus(statusPayload);
      setUsers(usersPayload.users);
    } catch (caught) {
      setMessage(caught.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadAdmin(); }, []);
  const runPull = async () => {
    setPulling(true);
    setMessage("Running the read-only BQE pull. This can take several minutes.");
    try {
      const response = await fetch("/api/bqe/pull", { method: "POST", credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 207) throw new Error(payload.error ?? "The BQE pull failed.");
      setMessage(`BQE pull ${payload.status}. Dashboard data has been refreshed.`);
      await Promise.all([loadAdmin(), onDashboardReload()]);
    } catch (caught) {
      setMessage(caught.message);
    } finally {
      setPulling(false);
    }
  };
  const updateRole = async (userId, role) => {
    setMessage("Saving access role…");
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/role`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: role || null }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "The user role could not be saved.");
      setUsers((current) => current.map((user) => user.id === userId ? { ...user, role: payload.role } : user));
      setMessage("Access role saved.");
    } catch (caught) {
      setMessage(caught.message);
    }
  };
  const latestPull = status?.latestPull;
  const counts = latestPull?.objectCounts ?? dashboard?.bqe?.objectCounts ?? {};
  return (
    <div className="content fade-in" data-testid="admin-view">
      <div className="page-header">
        <span className="overline">Restricted area</span><h2>Admin controls</h2>
        <p className="muted">Connection health, controlled data refresh, and invitation-only access.</p>
      </div>
      {message && <div className="notice admin-message" role="status" data-testid="status-admin-message">{message}</div>}
      {loading ? <div className="notice" data-testid="status-admin-loading">Loading protected admin data…</div> : <>
      <div className="admin-status-grid">
        <Blueprint className="admin-card"><span className="overline">BQE connection</span><strong data-testid="status-bqe-connection">{status?.connection.configured ? "Connected" : "Needs attention"}</strong><p className="muted">{status?.connection.apiHost ?? "No API endpoint persisted"}</p><small className="muted">Refresh token source: {status?.connection.tokenSource ?? "—"}</small></Blueprint>
        <Blueprint className="admin-card"><span className="overline">Last token refresh</span><strong data-testid="status-token-refresh">{status?.connection.refreshedAt ? new Date(status.connection.refreshedAt).toLocaleString() : "Not recorded"}</strong><p className="muted">Weekly keepalive {status?.keepalive.enabled ? "enabled" : "disabled"} · every {status?.keepalive.intervalDays ?? "—"} days</p></Blueprint>
        <Blueprint className="admin-card"><span className="overline">Latest pull</span><strong data-testid="status-latest-pull">{latestPull?.status ?? "No pull"}</strong><p className="muted">{latestPull?.completedAt ? new Date(latestPull.completedAt).toLocaleString() : "No completed timestamp"}</p><button className="primary" onClick={runPull} disabled={pulling} data-testid="button-run-bqe-pull">{pulling ? "Pull in progress…" : "Run BQE pull"}</button></Blueprint>
      </div>
      <Blueprint>
        <div className="section-heading"><div><h3>Latest record counts</h3><p className="muted">Persisted object counts reported by the latest pull.</p></div></div>
        <div className="record-count-grid">{Object.entries(counts).map(([key, value]) => <div key={key} data-testid={`metric-count-${key}`}><span className="overline">{key}</span><strong>{number.format(value)}</strong></div>)}</div>
      </Blueprint>
      <Blueprint>
        <div className="section-heading"><div><h3>User access</h3><p className="muted">Unapproved users cannot access operations data. Your own admin role is locked here to prevent accidental lockout.</p></div></div>
        <div className="table-wrap"><table><thead><tr><th>User</th><th>Email</th><th>Dashboard role</th></tr></thead><tbody>{users.map((user) => <tr key={user.id} data-testid={`row-admin-user-${user.id}`}><td><strong>{user.name}</strong>{user.id === currentUserId && <small className="muted">Current user</small>}</td><td>{user.email}</td><td><select value={user.role ?? ""} disabled={user.id === currentUserId} onChange={(event) => updateRole(user.id, event.target.value)} data-testid={`select-user-role-${user.id}`}><option value="">Unapproved</option><option value="viewer">Viewer</option><option value="editor">Editor</option><option value="admin">Admin</option></select></td></tr>)}</tbody></table></div>
      </Blueprint>
      </>}
    </div>
  );
}

// App Shell
function DashboardApp() {
  const { user } = useUser();
  const [data, setData] = useState(null);
  const [access, setAccess] = useState(null);
  const [page, setPage] = useState(() => pageFromPath(window.location.pathname));
  const [view, setView] = useState("exec");
  const [query, setQuery] = useState("");
  const [pmFilter, setPmFilter] = useState("All PMs");
  const [priority, setPriority] = useState("All exceptions");
  const [selectedCode, setSelectedCode] = useState("");
  const [error, setError] = useState("");

  const loadDashboard = async () => {
    try {
      setError("");
      const [response, accessResponse] = await Promise.all([
        fetch("/api/dashboard", { credentials: "include" }),
        fetch("/api/access", { credentials: "include" }),
      ]);
      if (!response.ok || !accessResponse.ok) {
        const failedResponse = !response.ok ? response : accessResponse;
        const failure = await failedResponse.json().catch(() => ({}));
        throw new Error(failure.error ?? "The controlled source could not be loaded.");
      }
      const [payload, accessPayload] = await Promise.all([response.json(), accessResponse.json()]);
      setData(payload);
      setAccess(accessPayload);
      setSelectedCode((current) => current || payload.projects[0]?.code || "");
    } catch (caught) {
      setError(caught.message);
    }
  };

  useEffect(() => { loadDashboard(); }, []);
  useEffect(() => {
    const handlePopState = () => setPage(pageFromPath(window.location.pathname));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  useEffect(() => {
    document.title = `${page === "home" ? "Home" : page === "manager" ? "Manager Dashboard" : page[0].toUpperCase() + page.slice(1)} · CDI Operations Hub`;
    if (access && page === "admin" && !access.isAdmin) {
      window.history.replaceState({}, "", pathForPage("home"));
      setPage("home");
    }
  }, [access, page]);

  const navigate = (nextPage) => {
    if (!hubPages.has(nextPage)) return;
    const nextPath = pathForPage(nextPage);
    if (window.location.pathname !== nextPath) window.history.pushState({}, "", nextPath);
    setPage(nextPage);
    document.querySelector(".hub-main")?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const userName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.primaryEmailAddress?.emailAddress || "Approved user";

  const openCard = (code) => {
    setSelectedCode(code);
    navigate("reports");
    setView("card");
    document.querySelector('.hub-main')?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const updateProject = async (code, update) => {
    const response = await fetch(`/api/projects/${encodeURIComponent(code)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(update),
    });
    if (!response.ok) throw new Error("The project update could not be saved.");
    const updated = await response.json();
    setData((current) => ({ ...current, overlayUpdated: new Date().toISOString().slice(0, 10), projects: current.projects.map((project) => project.code === updated.code ? updated : project) }));
  };

  return (
    <div className="hub-layout">
      <div className="sheet-frame">
        <header className="hub-header">
          <button className="hub-brand" onClick={() => navigate("home")} aria-label="Go to CDI Operations Hub home">
            <img src={`${basePath}/cdi-logo-color.webp`} alt="Complete Design, Inc." />
            <span><b>CDI</b><em>Operations Hub</em></span>
          </button>
          <nav className="hub-nav" aria-label="Primary navigation">
            <button className={page === 'home' ? 'active' : ''} onClick={() => navigate('home')} data-testid="sidebar-home"><HomeIcon /> Home</button>
            <button className={page === 'reports' ? 'active' : ''} onClick={() => navigate('reports')} data-testid="sidebar-reports"><BarChartIcon /> Reports</button>
            <button className={page === 'projects' ? 'active' : ''} onClick={() => navigate('projects')} data-testid="sidebar-projects"><FolderIcon /> Projects</button>
            <button className={page === 'estimating' ? 'active' : ''} onClick={() => navigate('estimating')} data-testid="sidebar-estimating"><CalculatorIcon /> Estimating</button>
            <button className={page === 'pipeline' ? 'active' : ''} onClick={() => navigate('pipeline')} data-testid="sidebar-pipeline"><TrendingUpIcon /> Pipeline</button>
            <button className={page === 'manager' ? 'active' : ''} onClick={() => navigate('manager')} data-testid="sidebar-manager"><UsersIcon /> Manager</button>
            {access?.isAdmin && <button className={page === 'admin' ? 'active' : ''} onClick={() => navigate('admin')} data-testid="sidebar-admin"><SettingsIcon /> Admin</button>}
          </nav>
          <div className="hub-user"><span>{userName}</span><AccountActions /></div>
        </header>
        <main className="hub-main">
          {error ? (
            <div className="notice error fade-in">{error} <button onClick={loadDashboard}>Try again</button></div>
          ) : !data ? (
            <div className="notice loading-notice fade-in">Loading operations data...</div>
          ) : (
            <SheetPage page={page} userName={userName}>
              {page === 'home' && <HomeView onNavigate={navigate} isAdmin={access?.isAdmin} userName={userName} />}
              {page === 'reports' && <ReportsView data={data} access={access} view={view} setView={setView} query={query} setQuery={setQuery} pmFilter={pmFilter} setPmFilter={setPmFilter} priority={priority} setPriority={setPriority} selectedCode={selectedCode} setSelectedCode={setSelectedCode} updateProject={updateProject} openCard={openCard} />}
              {page === 'projects' && <ProjectsView projects={data.projects} onOpen={openCard} />}
              {page === 'estimating' && <EstimatingView />}
              {page === 'pipeline' && <PipelineView />}
              {page === 'manager' && <ManagerView />}
              {page === 'admin' && access?.isAdmin && <AdminView dashboard={data} currentUserId={access.userId} onDashboardReload={loadDashboard} />}
            </SheetPage>
          )}
        </main>
      </div>
    </div>
  );
}

function BqeStatus({ status }) {
  const copy = {
    fresh: ["Live BQE data", `${status.matchedProjects} dashboard projects matched to the latest completed pull.`],
    stale: ["BQE data is stale", "Values remain visible for continuity, but the latest completed pull is more than 24 hours old."],
    partial: ["Partial BQE pull", "Verified values are shown where available. One or more BQE object types did not refresh."],
    empty: ["No BQE data yet", "Hours and financials will appear after the first completed BQE pull."],
  }[status.state];
  return <div className={`source-status ${status.state}`} role="status"><strong>{copy[0]}</strong><span>{copy[1]}</span>{status.completedAt && <small>Completed {new Date(status.completedAt).toLocaleString()}</small>}</div>;
}

function Executive({ summary, projects, bqe, onOpen }) {
  const confidence = ["HIGH", "MEDIUM", "LOW"].map((key) => [key[0] + key.slice(1).toLowerCase(), summary.confidence[key] ?? 0]);
  const top = [...projects].sort((a, b) => b.exposure - a.exposure).slice(0, 6);
  const hoursNote = bqe.reconciliation
    ? `through ${bqe.reconciliation.asOfDate} · ${metricValue(bqe.reconciliation.excludedFutureHours)} future hours excluded`
    : "persisted 2026 total through today";
  const register = bqe.reconciliation?.invoiceRegister;
  return <main className="content">
    <div className="metric-grid">
      <Metric label="2026 actual hours" value={metricValue(bqe.reconciliation?.hours ?? bqe.totals.hours)} note={hoursNote} accent />
      <Metric label="BQE budget hours" value={metricValue(bqe.totals.budgetHours)} note="persisted BQE portfolio total" />
      <Metric label="2026 invoiced" value={metricValue(bqe.reconciliation?.invoicedAmount ?? bqe.totals.invoicedAmount, money)} note="latest BQE reconciliation" />
      <Metric label="2026 paid" value={metricValue(bqe.reconciliation?.paidAmount ?? bqe.totals.paidAmount, money)} note="latest BQE reconciliation" />
    </div>
    <div className="two-col executive-pair">
      <Blueprint><h2>Overall project health</h2><p className="muted">Counts by assigned Overall status. No Green/Yellow/Red has been invented.</p>
        <div className="unknown-bar" /><div className="legend"><span><i className="green" />0 Green</span><span><i className="yellow" />0 Yellow</span><span><i className="red" />0 Red</span><span><i />{summary.activeRoots} Unknown</span></div>
        <p className="callout">No project has an assigned Green / Yellow / Red status. Project health cannot be objectively determined across the portfolio today — Unknown is intentional until BQE controls are established.</p>
      </Blueprint>
      <Blueprint><h2>Data confidence</h2><p className="muted">Can we trust a health read? Core BQE field completeness.</p>
        <div className="bars">{confidence.map(([label, count]) => <Bar key={label} label={label} value={count} max={summary.activeRoots} tone={label.toLowerCase()} />)}</div>
        <p className="muted small top-rule">HIGH = 6–7 core evidence sets · MEDIUM = 4–5 · LOW = 0–3. Day 30 uses a BQE-only proxy until PM fields are captured.</p>
      </Blueprint>
    </div>
    <Blueprint><h2>Control coverage — what BQE can prove today</h2><p className="muted">Share of the {summary.activeRoots} active external roots that carry each control field. Low coverage flags a missing control, not a failed project.</p>
      <div className="coverage-grid">{summary.coverage.map((item) => <div className="coverage" key={item.label}><div><strong>{item.label}</strong><span className="muted">{item.count} / {summary.activeRoots} · {percent(item.pct)}</span></div><div className="track"><span style={{ width: `${item.pct}%` }} /></div><small className="muted">{item.note}</small></div>)}</div>
    </Blueprint>
    <div className="two-col">
      <Blueprint><h2>BQE financial reconciliation</h2><div className="finance-grid">{[["Actual hours", metricValue(bqe.reconciliation?.hours ?? bqe.totals.hours)], ["Budget hours", metricValue(bqe.totals.budgetHours)], ["Invoiced", metricValue(bqe.reconciliation?.invoicedAmount ?? bqe.totals.invoicedAmount, money)], ["Paid", metricValue(bqe.reconciliation?.paidAmount ?? bqe.totals.paidAmount, money)]].map(([label, value]) => <div className="finance" key={label}><small className="muted">{label}</small><strong>{value}</strong><span className="muted">{label === "Budget hours" ? "persisted portfolio total" : label === "Actual hours" ? hoursNote : bqe.reconciliation ? `reconciled through ${bqe.reconciliation.asOfDate}` : "persisted portfolio total"}</span></div>)}</div><p className="muted small top-rule">Reconciliation totals use an inclusive as-of date matching BQE’s current-period report. Future-dated records remain persisted for auditability but do not inflate the displayed totals. Budget hours are summed across persisted BQE budgets because BQE budget rows do not consistently expose a project identifier.</p></Blueprint>
      <Blueprint><h2>Active projects by PM</h2><div className="bars">{Object.entries(summary.byPm).sort((a, b) => b[1] - a[1]).map(([label, count]) => <Bar key={label} label={label} value={count} max={Math.max(...Object.values(summary.byPm))} />)}</div></Blueprint>
    </div>
    {register && <Blueprint><div className="section-heading"><div><h2>BQE Invoice Register</h2><p className="muted">Native register logic reproduced from persisted invoice classifications and detail allocations.</p></div><span className="data-chip live">Exact match</span></div>
      <div className="finance-grid">{[
        ["Register rows", metricValue(register.registerCount), `${metricValue(register.grossHeaderCount)} invoice headers · ${metricValue(register.detailRowCount)} detail rows`],
        ["Net billed with tax", metricValue(register.netBilledWithTax, money), "matches BQE Invoice Register"],
        ["Finance charges excluded", metricValue(register.financeChargeAmount, money), `${metricValue(register.excludedFinanceChargeCount)} type-39 records`],
        ["Draft excluded", `#${register.excluded250InvoiceNumber ?? "—"}`, `${metricValue(register.excludedDraftCount)} draft · $250.00`],
      ].map(([label, value, note]) => <div className="finance" key={label}><small className="muted">{label}</small><strong>{value}</strong><span className="muted">{note}</span></div>)}</div>
      <p className="muted small top-rule">The apparent 103-record gap is a difference in counting grain, not 103 unidentified invoices: 789 headers expand to 796 allocation rows, then 106 finance-charge rows, one draft row, and three zero-dollar rows are excluded, leaving 686 native register rows.</p>
    </Blueprint>}
    <Blueprint><h2>Financial attention queue</h2><p className="muted">Highest WIP + AR projects for project-card review.</p><div className="compact-list">{top.map((project) => <button key={project.code} onClick={() => onOpen(project.code)}><span><b>{project.name}</b><small className="muted">{project.code} · {project.pm}</small></span><strong>{money.format(project.exposure)}</strong></button>)}</div></Blueprint>
  </main>;
}

function Metric({ label, value, note, accent, gray }) { return <Blueprint className="metric"><span className="overline muted">{label}</span><strong className={accent ? "accent" : gray ? "gray" : ""}>{value}</strong><small className="muted">{note}</small></Blueprint>; }
function Bar({ label, value, max, tone = "" }) { return <div className="bar-row"><strong>{label}</strong><div className="track"><span className={tone} style={{ width: `${max ? (value / max) * 100 : 0}%` }} /></div><span>{value}</span></div>; }

function ProjectTable({ projects, query, setQuery, pmFilter, setPmFilter, priority, setPriority, onOpen }) {
  const pms = [...new Set(projects.map((project) => project.pm))];
  return <main className="content"><Blueprint><div className="section-heading"><div><h2>Project table</h2><p className="muted">Filter the active external roots, then open a controlled project card.</p></div><span className="muted">{projects.length} records</span></div>
    <div className="filters"><input value={query} placeholder="Project #, name, client" onChange={(event) => setQuery(event.target.value)} /><select value={pmFilter} onChange={(event) => setPmFilter(event.target.value)}><option>All PMs</option>{pms.map((pm) => <option key={pm}>{pm}</option>)}</select><select value={priority} onChange={(event) => setPriority(event.target.value)}><option>All exceptions</option><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select></div>
    <div className="table-wrap"><table><thead><tr><th>Project #</th><th>Project</th><th>PM</th><th>Hours</th><th>Budget</th><th>Invoiced</th><th>Paid</th><th>Source</th><th /></tr></thead><tbody>{projects.map((project) => <tr key={project.code}><td>{project.code}</td><td><b>{project.name}</b><small className="muted">{project.client}</small></td><td>{project.pm}</td><td>{metricValue(project.actualHours)}</td><td>{metricValue(project.budgetHours)}</td><td>{metricValue(project.invoicedAmount, money)}</td><td>{metricValue(project.paidAmount, money)}</td><td><span className={`data-chip ${project.bqeMatched ? "live" : ""}`}>{project.bqeMatched ? "BQE" : "No match"}</span></td><td><button className="text-button" onClick={() => onOpen(project.code)}>Card →</button></td></tr>)}</tbody></table></div>
  </Blueprint></main>;
}

function ProjectCard({ project, projects, onSelect, onSave, canEdit }) {
  const [form, setForm] = useState(project ?? {});
  const [status, setStatus] = useState("");
  useEffect(() => { setForm(project ?? {}); setStatus(""); }, [project?.code]);
  if (!project) return null;
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const save = async (event) => { event.preventDefault(); setStatus("Saving…"); try { await onSave(project.code, { ...form, etcHours: form.etcHours === "" ? null : Number(form.etcHours || 0) }); setStatus("Saved to PM overlay."); } catch (caught) { setStatus(caught.message); } };
  const field = (label, key, type = "text") => <label><span>{label}</span><input disabled={!canEdit} type={type} value={form[key] ?? ""} onChange={(event) => change(key, event.target.value)} /></label>;
  return <main className="content"><Blueprint><div className="section-heading"><div><h2>Project card</h2><p className="muted">The PM-controlled fields below save to the project’s persistent overlay.</p></div><select value={project.code} onChange={(event) => onSelect(event.target.value)}>{projects.map((item) => <option key={item.code} value={item.code}>{item.code} — {item.name}</option>)}</select></div>
    <div className="project-title"><div><span className="overline muted">{project.code} · {project.client}</span><h2>{project.name}</h2><p className="muted">{project.pm} · {project.contractValueVisible ? money.format(project.contractValue) : "Contract value not captured"} · {money.format(project.exposure)} exposure</p></div><span className={`badge ${project.priority.toLowerCase()}`}>{project.priority} priority</span></div>
    <div className="evidence-grid bqe-evidence">{[["Actual hours", metricValue(project.actualHours)], ["Budget hours", metricValue(project.budgetHours)], ["Invoiced", metricValue(project.invoicedAmount, money)], ["Paid", metricValue(project.paidAmount, money)], ["BQE source", project.bqeMatched ? "Matched" : "No project match"]].map(([label, value]) => <div key={label}><small className="muted">{label}</small><strong>{value}</strong></div>)}</div>
    {project.reconciliationHours !== null && <div className="table-wrap"><table><thead><tr><th>2026 reconciliation</th><th>Exact project</th><th>Parent + child projects</th></tr></thead><tbody>
      <tr><td>Hours</td><td>{metricValue(project.reconciliationHours)}</td><td>{metricValue(project.reconciliationRolledUpHours)}</td></tr>
      <tr><td>Invoiced</td><td>{metricValue(project.reconciliationInvoicedAmount, money)}</td><td>{metricValue(project.reconciliationRolledUpInvoicedAmount, money)}</td></tr>
      <tr><td>Paid</td><td>{metricValue(project.reconciliationPaidAmount, money)}</td><td>{metricValue(project.reconciliationRolledUpPaidAmount, money)}</td></tr>
    </tbody></table></div>}
    <form className="overlay-form" onSubmit={save}><div className="form-heading"><h3>PM control overlay</h3><p className="muted">{canEdit ? "These are the nine fields that have no reliable BQE extract source yet." : "Read-only: editor approval is required to update PM-controlled fields."}</p></div><div className="form-grid">{field("Next deliverable", "deliverable")}{field("Estimated hours remaining", "etcHours", "number")}{field("Scope / authorization note", "scopeNote")}{field("Current blocker", "blocker")}{field("Next action", "nextAction")}{field("Action owner", "owner")}{field("Action due", "actionDue", "date")}{field("Last meaningful client contact", "lastContact", "date")}<label className="check"><input disabled={!canEdit} type="checkbox" checked={Boolean(form.pmUpdate)} onChange={(event) => change("pmUpdate", event.target.checked)} /><span>PM update complete this week</span></label></div><div className="save-row">{canEdit && <button className="primary" type="submit">Save PM update</button>}<span className={status.startsWith("Saved") ? "success" : "muted"}>{status}</span></div></form>
  </Blueprint></main>;
}

function TuesdayReview({ projects, onOpen }) {
  const priority = projects.filter((project) => project.priority === "HIGH").sort((a, b) => b.exposure - a.exposure);
  const groups = [["High financial exposure", "WIP + AR requiring billing / collection coordination", priority], ["Missing core evidence", "No budget, % complete, or due date", projects.filter((p) => !p.budgetExists || !p.pctAvail || !p.dueAvail).slice(0, 8)], ["PM action overdue", "Action owner or action due needs confirmation", projects.filter((p) => p.priority === "MEDIUM").slice(0, 6)]];
  return <main className="content"><Blueprint><h2>Tuesday review</h2><p className="muted">A focused working agenda. Green projects are not read aloud; review only conditions that need coordination, a decision, or an action.</p></Blueprint>
    <Blueprint><div className="section-heading"><h3>This week’s priority exceptions</h3><span className="muted">{priority.length} flagged HIGH</span></div><div className="priority-grid">{priority.slice(0, 6).map((project) => <button key={project.code} onClick={() => onOpen(project.code)}><span><b>{project.name}</b><small className="muted">{project.code} · {project.pm}</small></span><strong>{money.format(project.exposure)}</strong></button>)}</div></Blueprint>
    {groups.map(([title, trigger, rows], index) => <Blueprint key={title} className="review-group"><div className="review-number">{index + 1}<small>{rows.length}</small></div><div><h3>{title}</h3><p className="muted">{trigger}</p><div className="table-wrap"><table><tbody>{rows.slice(0, 5).map((project) => <tr key={project.code}><td>{project.code}</td><td><b>{project.name}</b></td><td className="muted">{project.pm}</td><td>{money.format(project.exposure)}</td><td><button className="text-button" onClick={() => onOpen(project.code)}>Card →</button></td></tr>)}</tbody></table></div></div></Blueprint>)}
  </main>;
}

function PmGuide() { const rows = [["Overall health", "What is the current status and why?", "Project card · PM control overlay", "Use evidence, not optimism.", "A decision, owner, or client action is needed."], ["Next deliverable", "What tangible output is next?", "PM control overlay", "One concise, current deliverable.", "No clear output or acceptance path."], ["Scope / authorization", "Is the work authorized?", "PM control overlay", "Name the authorization or the gap.", "Scope is moving without a decision."], ["Blocker / next action", "What must happen next?", "PM control overlay", "One blocker and an owned next action.", "Owner or due date is missing."]]; return <main className="content"><Blueprint><h2>PM weekly project update guide</h2><p className="muted">The weekly PM pass fills the evidence BQE cannot provide.</p><div className="table-wrap"><table><thead><tr><th>PM update</th><th>Question to answer</th><th>Where to update</th><th>Standard</th><th>Escalate when</th></tr></thead><tbody>{rows.map((row) => <tr key={row[0]}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>)}</tbody></table></div></Blueprint><Blueprint><h3>Weekly self-check before the meeting</h3><ul className="checklist">{["I can name the next deliverable.", "I know what decision or action is blocking progress.", "Every action has one owner and one due date.", "I updated material client contact.", "I escalated a financial or schedule decision early."].map((item) => <li key={item}>{item}</li>)}</ul></Blueprint></main>; }

function FieldHomes() { const rows = [["Project manager", "BQE project header", "Synced from BQE", "No"], ["Contract value", "BQE contract / billing setup", "Synced from BQE", "No"], ["Budget and forecast", "BQE budget object", "BQE field rollout", "No"], ["Percent complete", "BQE project status", "PM weekly update", "Yes"], ["Due date", "BQE milestone", "PM weekly update", "Yes"], ["Next action and owner", "PM control overlay", "PM weekly update", "Yes"]]; return <main className="content"><Blueprint><h2>Proposed field homes & refresh pipeline</h2><p className="muted">The field-home plan makes the next controlled refresh more complete while keeping ownership clear.</p><div className="table-wrap"><table><thead><tr><th>Field</th><th>Proposed home</th><th>How it gets there</th><th>PM weekly?</th></tr></thead><tbody>{rows.map((row) => <tr key={row[0]}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>)}</tbody></table></div></Blueprint><Blueprint><h3>Refresh pipeline — API architecture</h3><div className="pipeline">{[["1", "Extract", "Controlled BQE source refreshed."], ["2", "Normalize", "Active root projects and financial fields are standardized."], ["3", "Overlay", "PM-controlled fields are merged without overwriting BQE."], ["4", "Publish", "Dashboard and Tuesday review read the same controlled record."]].map(([number, title, detail]) => <div key={number}><span>{number}</span><strong>{title}</strong><p className="muted">{detail}</p></div>)}</div></Blueprint></main>; }

function AccountActions() {
  const { user } = useUser();
  const { signOut } = useClerk();
  return <div className="account-actions"><span>{user?.primaryEmailAddress?.emailAddress}</span><button onClick={() => signOut({ redirectUrl: basePath || "/" })}>Sign out</button></div>;
}

function AccessLanding() {
  return <div className="access-landing fade-in">
    <div className="access-sheet sheet-frame">
      <div className="access-page">
        <img className="contour-lines" src={`${basePath}/contour-lines.svg`} alt="" aria-hidden="true" />
        <div className="access-hero">
          <img src={`${basePath}/cdi-logo-color.webp`} alt="Complete Design, Inc." />
          <span className="sheet-label">Complete Design, Inc.</span>
          <h1>CDI Operations Hub</h1>
          <p className="tagline">Where Vision Becomes Legacy</p>
          <p>The operating system for Complete Design's projects, estimates, and reporting.</p>
          <a className="primary" href={`${basePath}/sign-in`} data-testid="link-sign-in">Sign in</a>
          <span className="access-note">Access is invitation-only.</span>
        </div>
      </div>
      <SheetTitleBlock page="home" userName="Invitation only" accessLabel="Access" />
    </div>
  </div>;
}

function AuthPage({ mode }) {
  const signInPath = `${basePath}/sign-in`;
  const signUpPath = `${basePath}/sign-up`;
  return <div className="auth-page fade-in">{mode === "sign-up"
    ? <SignUp routing="path" path={signUpPath} signInUrl={signInPath} />
    : <SignIn routing="path" path={signInPath} signUpUrl={signUpPath} />}</div>;
}

function AppRouter() {
  const path = window.location.pathname;
  if (path.startsWith(`${basePath}/sign-in`)) return <AuthPage mode="sign-in" />;
  if (path.startsWith(`${basePath}/sign-up`)) return <AuthPage mode="sign-up" />;
  return <><Show when="signed-in"><DashboardApp /></Show><Show when="signed-out"><AccessLanding /></Show></>;
}

function App() {
  if (!clerkPubKey) throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY.");
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
  ><AppRouter /></ClerkProvider>;
}

const container = document.getElementById("root");
const root = window.__projectHealthRoot ?? createRoot(container);
window.__projectHealthRoot = root;
root.render(<App />);