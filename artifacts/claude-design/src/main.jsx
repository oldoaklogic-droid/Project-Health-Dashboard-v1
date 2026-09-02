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

import { PipelineView } from "./views/PipelineView";
import { EstimatingView } from "./views/EstimatingView";
import { GlobalSearch } from "./components/GlobalSearch.jsx";

// SVG Icons
const SearchIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>;
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
    colorPrimary: "#3E6FA3",
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
    formButtonPrimary: { backgroundColor: "#3E6FA3", color: "#FFFFFF", fontWeight: 600 },
    footerActionLink: { color: "#3E6FA3" },
    footerActionText: { color: "#587087" },
  },
};

function Blueprint({ children, className = "" }) {
  return <section className={`blueprint ${className}`}>{children}</section>;
}

function SheetTitleBlock({ page, userName }) {
  const meta = pageMeta[page] ?? pageMeta.home;
  const date = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "2-digit" }).format(new Date());
  return (
    <footer className="title-block" data-testid="title-block">
      <div className="title-cell title-hub"><span className="title-label">Project</span><strong>CDI Operations Hub</strong></div>
      <div className="title-cell"><span className="title-label">Date</span><strong>{date}</strong></div>
      <div className="title-cell"><span className="title-label">User</span><strong>{userName || "Invitation only"}</strong></div>
      <div className="title-cell title-sheet"><span className="title-label">Sheet</span><strong>{page === "home" ? "01" : `${meta.code}`}</strong></div>
    </footer>
  );
}

function SheetPage({ page, userName, data, children }) {
  const meta = pageMeta[page] ?? pageMeta.home;
  const status = page === "reports" || page === "admin" || page === "home" || page === "estimating" || page === "pipeline" || page === "projects" || page === "manager"
    ? "ISSUED"
    : `PHASE 7`;
  return (
    <div className={`sheet-page sheet-page-${page}`} data-testid={`sheet-page-${page}`}>
      {page !== "home" && (
        <header className="wing-heading">
          <div className="wing-heading-main">
            <span className="sheet-code heading-code">{meta.code}</span>
            <span className="sheet-label">{meta.label}</span>
            <h1>{meta.title}</h1>
            <p>{meta.description}</p>
          </div>
          <div className="wing-heading-meta">
            {data?.extractDate && (
              <div className="wing-data-as-of">
                <span className="title-label">Data as of</span>
                <strong>{data.extractDate}</strong>
              </div>
            )}
            <span className={`status-stamp heading-stamp ${status === "ISSUED" ? "issued" : "development"}`}>{status}</span>
          </div>
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
    ["R-100", "Reports", "Financial reconciliation, project health, report pack", "issued", "reports"],
    ["P-100", "Projects", "Budget vs actual, project health, measurement", "issued", "projects"],
    ["E-100", "Estimating", "Project, multi-discipline, and principal's worksheet", "issued", "estimating"],
    ["L-100", "Pipeline", "Lead → intake → estimate → contract → project", "issued", "pipeline"],
    ["M-100", "Manager dashboard", "PM financials, team KPIs, Tuesday review", "issued", "manager"],
  ];
  if (isAdmin) wings.push(["X-100", "Admin", "BQE connection, user roles, data pull status", "issued", "admin"]);
  return (
    <div className="home-view sheet-content fade-in" data-testid="home-view">
      <img className="contour-lines" src={`${basePath}/contour-lines.svg`} alt="" aria-hidden="true" />
      <div className="home-hero drawing-hero">
        <div className="hero-mark"><img src={`${basePath}/cdi-logo-color.webp`} alt="Complete Design, Inc." /></div>
        <h1>Complete Design, Inc.</h1>
        <p className="tagline">Where vision becomes legacy</p>
        <p className="hero-sentence">The operating system for Complete Design's projects, estimates, and reporting.</p>
      </div>
      <section className="drawing-index" aria-labelledby="drawing-index-title">
        <div className="index-heading"><span className="sheet-label">Drawing index</span><h2 id="drawing-index-title">Operations sheets</h2><span className="sheet-label">Issued for internal use</span></div>
        <div className="index-table">
          <div className="index-table-head"><span>Sheet</span><span>Section</span><span style={{paddingRight:0}}>Status</span></div>
          {wings.map(([code, name, description, status, page]) => (
            <button className="index-row" key={code} onClick={() => (page === "admin" && !isAdmin ? null : onNavigate(page))} data-testid={`index-${page}`} disabled={page === "admin" && !isAdmin}>
              <span className="sheet-code">{code}</span>
              <div className="index-section">
                <strong>{name}</strong>
                <span className="index-description">{description}</span>
              </div>
              <div className="index-status">
                <span className={`status-stamp ${status === "issued" ? "issued" : "development"}`}>{status === "issued" ? "ISSUED" : `PHASE ${status.replace("phase", "")}`}</span>
              </div>
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

function ProjectsView({ onOpen }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/projects", { credentials: "include" })
      .then(res => res.json())
      .then(data => { setProjects(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="content fade-in" data-testid="projects-view">
      <div className="page-header">
        <h2>Live Project Tracking</h2>
        <p className="muted">All active projects in the portfolio.</p>
      </div>

      {loading ? (
        <Blueprint><div className="notice">Loading projects...</div></Blueprint>
      ) : projects.length > 0 ? (
        <Blueprint className="pt-0 pb-0" style={{ padding: 0 }}>
          <div className="table-wrap" style={{ margin: 0, borderTop: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Project #</th>
                  <th>Project</th>
                  <th>Client</th>
                  <th>PM</th>
                  <th>Health</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {projects.map(project => (
                  <tr key={project.id} onClick={() => onOpen(project.id)} style={{ cursor: "pointer" }}>
                    <td>{project.number}</td>
                    <td><b>{project.name}</b></td>
                    <td><span className="muted">{project.client}</span></td>
                    <td>{project.pm}</td>
                    <td><span className={`badge ${project.severity}`}>{project.severity}</span></td>
                    <td style={{ textAlign: "right" }}>
                      <button className="text-button" onClick={(e) => { e.stopPropagation(); onOpen(project.id); }}>View →</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Blueprint>
      ) : (
        <Blueprint className="empty-state placeholder-panel pt-6 pb-6">
           <div className="placeholder-icon"><FolderIcon /></div>
           <h2>No projects found</h2>
           <p className="muted">No projects found.</p>
        </Blueprint>
      )}
    </div>
  );
}


function ProjectDetailView({ code, onBack, access }) {
  const [project, setProject] = useState(null);
  const [plan, setPlan] = useState(null);
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [healthRules, setHealthRules] = useState([]);
  
  const [noteForm, setNoteForm] = useState({ riskLine: "", actionLine: "", percentComplete: "" });
  const [contactForm, setContactForm] = useState({ method: "", summary: "" });
  const [healthForm, setHealthForm] = useState({ status: "", reason: "" });
  const [actionForm, setActionForm] = useState({ what: "", ownerEmployeeId: "", dueDate: "" });

  const loadAll = async () => {
    try {
      setLoading(true);
      const [projRes, rulesRes] = await Promise.all([
        fetch(`/api/manager/projects/${encodeURIComponent(code)}`, { credentials: "include" }),
        fetch(`/api/health-rules`, { credentials: "include" })
      ]);
      if (!projRes.ok) throw new Error("Failed to load project details");
      const projData = await projRes.json();
      setProject(projData);
      setActions(projData.actions || []);
      setPlan({ hasBudget: projData.metrics?.budgetHours != null, phases: projData.phases || [] });
      setNoteForm({
        riskLine: projData.pmNote?.riskLine || "",
        actionLine: projData.pmNote?.actionLine || "",
        percentComplete: projData.pmNote?.percentComplete ?? projData.percentComplete ?? "",
      });
      
      const rulesData = await rulesRes.ok ? await rulesRes.json() : [];
      setHealthRules(rulesData);

      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, [code]);

  const postData = async (url, data, method="POST") => {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error((await res.json()).error || "Request failed");
    await loadAll();
  };

  if (loading) return <div className="content fade-in" data-testid="project-detail-view"><Blueprint><div className="notice">Loading project {code}...</div></Blueprint></div>;
  if (error || !project) return <div className="content fade-in" data-testid="project-detail-view"><Blueprint><div className="notice error">{error || "Not found"}</div></Blueprint></div>;

  const projectId = project.id || code;

  return (
    <div className="content fade-in" data-testid="project-detail-view">
      <div className="page-header" style={{ marginBottom: "0" }}>
        <button onClick={onBack} className="text-button mb-3" style={{ fontSize: "14px" }}>← Back to Projects</button>
        <h2>{project.number} — {project.name}</h2>
        <p className="muted">{project.client} · PM: {project.pm}</p>
      </div>

      <div className="metric-grid mb-3">
        <Metric label="Budget vs actual" value={project.metrics?.budgetHours == null ? `UNKNOWN / ${metricValue(project.metrics?.actualHours)}h` : `${metricValue(project.metrics.budgetHours)} / ${metricValue(project.metrics.actualHours)}h`} />
        <Metric label="Fee consumed" value={`${metricValue(project.metrics?.invoicedAmount || 0, money)} / ${metricValue(project.metrics?.contractAmount || 0, money)}`} />
        <Metric label="Percent complete" value={`${metricValue(project.percentComplete)}%`} />
        <Metric label="AR / oldest" value={`${metricValue(project.metrics?.arTotal || 0, money)} / ${project.metrics?.oldestPastDueDays ?? 0}d`} />
        <Metric label="Next milestone" value={project.nextMilestone || "TBD"} />
      </div>

      <div className="two-col">
        <Blueprint>
          <div className="section-heading"><h3>Health Control</h3></div>
          <div className="mb-3">
            <span className={`badge ${project.severity}`}>Displayed: {project.severity}</span>
            <span className={`badge ${project.computedSeverity} ml-2`}>Computed: {project.computedSeverity}</span>
            {project.override && <p className="muted mt-2">Override: {project.override.severity} — {project.override.reason}</p>}
          </div>
          {access?.canEdit && (
            <div className="overlay-form pt-6 border-t mt-4">
              <div className="form-grid">
                <label><span>Override Status</span>
                  <select value={healthForm.status} onChange={e => setHealthForm({...healthForm, status: e.target.value})}>
                    <option value="">Select...</option>
                    <option value="red">Red</option><option value="yellow">Yellow</option><option value="green">Green</option><option value="gray">Gray</option>
                  </select>
                </label>
                <label style={{ gridColumn: "span 2" }}><span>Reason</span>
                  <input value={healthForm.reason} onChange={e => setHealthForm({...healthForm, reason: e.target.value})} placeholder="Why?" />
                </label>
              </div>
              <button className="secondary mt-4" disabled={!healthForm.status || !healthForm.reason} onClick={() => postData(`/api/projects/${encodeURIComponent(projectId)}/health-override`, { severity: healthForm.status, reason: healthForm.reason }).then(() => setHealthForm({status:"", reason:""}))}>Set Health</button>
            </div>
          )}
        </Blueprint>
        
        <Blueprint>
          <div className="section-heading"><h3>Current Period Time</h3></div>
          {project.timeEntries?.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Employee</th><th>Activity</th><th>Hours</th></tr></thead>
                <tbody>
                  {project.timeEntries.slice(0, 25).map(entry => (
                    <tr key={entry.recordId}><td>{entry.entryDate}</td><td>{entry.employee}</td><td>{entry.activityCode || "—"}</td><td>{metricValue(entry.hours)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted mt-4">No recent time entries.</p>
          )}
        </Blueprint>
      </div>

      <div className="two-col mt-4">
        <Blueprint>
          <div className="section-heading"><h3>Project Actions</h3></div>
          {actions.length > 0 ? (
            <div className="table-wrap mb-4">
              <table>
                <thead><tr><th>What</th><th>Status</th><th>Owner</th><th/></tr></thead>
                <tbody>
                  {actions.map(a => (
                    <tr key={a.id}>
                      <td>{a.what}</td>
                      <td>{a.status}</td>
                      <td>{a.ownerEmployeeId || "—"}</td>
                      <td style={{textAlign:"right"}}>
                         {a.status !== "closed" && access?.canEdit && <button className="text-button" onClick={() => postData(`/api/actions/${encodeURIComponent(a.id)}`, { status: "closed" }, "PATCH")}>Close</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="muted mt-4 mb-4">No actions.</p>}
          {access?.canEdit && (
            <div className="overlay-form pt-4 border-t">
              <label><span>Add Action</span>
                <div className="flex mt-1 mb-3" style={{display:"flex", gap:"8px"}}>
                  <input value={actionForm.what} onChange={e => setActionForm({...actionForm, what: e.target.value})} placeholder="What needs to be done?" style={{flex: 1}} />
                   <input value={actionForm.ownerEmployeeId} onChange={e => setActionForm({...actionForm, ownerEmployeeId: e.target.value})} placeholder="Owner" style={{width:"120px"}} />
                   <input type="date" value={actionForm.dueDate} onChange={e => setActionForm({...actionForm, dueDate: e.target.value})} />
                </div>
                 <button className="secondary" disabled={!actionForm.what} onClick={() => postData(`/api/actions`, { ...actionForm, projectId }).then(() => setActionForm({what:"", ownerEmployeeId:"", dueDate:""}))}>Add Action</button>
              </label>
            </div>
          )}
        </Blueprint>

        <Blueprint>
          <div className="section-heading"><h3>PM Notes & Contact Log</h3></div>
          {access?.canEdit && (
            <div className="overlay-form pt-0 border-t-0">
               <label><span>Risk line</span>
                 <input value={noteForm.riskLine} onChange={e => setNoteForm({...noteForm, riskLine: e.target.value})} placeholder="Current project risk" className="mt-1 mb-3" style={{width: "100%"}} />
               </label>
               <label><span>Action line</span>
                 <input value={noteForm.actionLine} onChange={e => setNoteForm({...noteForm, actionLine: e.target.value})} placeholder="Next action" className="mt-1 mb-3" style={{width: "100%"}} />
               </label>
               <label><span>Percent complete</span>
                 <input type="number" min="0" max="100" value={noteForm.percentComplete} onChange={e => setNoteForm({...noteForm, percentComplete: e.target.value})} className="mt-1 mb-3" />
                 <button className="secondary" onClick={() => postData(`/api/projects/${encodeURIComponent(projectId)}/notes`, noteForm)}>Save PM Note</button>
              </label>

              <div className="border-t pt-4 mt-4">
                <label><span>Contact Log</span>
                  <div className="flex mt-1 mb-3" style={{display:"flex", gap:"8px"}}>
                    <input value={contactForm.method} onChange={e => setContactForm({...contactForm, method: e.target.value})} placeholder="Method" style={{width:"100px"}} />
                    <input value={contactForm.summary} onChange={e => setContactForm({...contactForm, summary: e.target.value})} placeholder="Summary..." style={{flex: 1}} />
                  </div>
                  <button className="secondary" disabled={!contactForm.method || !contactForm.summary} onClick={() => postData(`/api/projects/${encodeURIComponent(projectId)}/contact-log`, contactForm).then(() => setContactForm({method:"", summary:""}))}>Save Contact</button>
                </label>
              </div>
            </div>
          )}
        </Blueprint>
      </div>

      <div className="two-col mt-4">
        <Blueprint>
          <div className="section-heading"><h3>Activity breakdown</h3></div>
          <div className="table-wrap"><table>
            <thead><tr><th>Activity</th><th>Budget</th><th>Actual</th><th>Variance</th></tr></thead>
            <tbody>{(project.activities || []).map(activity => <tr key={activity.code}>
              <td>{activity.code} — {activity.name}</td>
              <td>{activity.planned == null ? "UNKNOWN" : metricValue(activity.planned)}</td>
              <td>{metricValue(activity.actual)}</td>
              <td>{activity.variance == null ? "—" : metricValue(activity.variance)}</td>
            </tr>)}</tbody>
          </table></div>
        </Blueprint>
        <Blueprint>
          <div className="section-heading"><h3>Invoices</h3></div>
          <div className="table-wrap"><table>
            <thead><tr><th>Invoice</th><th>Date</th><th>Amount</th><th>Balance</th><th>Past due</th></tr></thead>
            <tbody>{(project.invoices || []).map(invoice => <tr key={invoice.id}>
              <td>{invoice.number}</td><td>{invoice.date}</td><td>{metricValue(invoice.amount, money)}</td>
              <td>{metricValue(invoice.balance, money)}</td><td>{invoice.pastDueDays ?? 0}d</td>
            </tr>)}</tbody>
          </table></div>
        </Blueprint>
      </div>
      <Blueprint className="mt-4">
        <div className="section-heading"><h3>Client contact log</h3></div>
        {(project.contacts || []).map(contact => <p key={contact.id}><b>{contact.contactDate} · {contact.method}</b> — {contact.summary}</p>)}
      </Blueprint>
    </div>
  );
}

function ManagerView({ projectsData, openCard, access }) {
  const [tab, setTab] = useState("portfolio");
  const [portfolioResponse, setPortfolioResponse] = useState(null);
  const [portfolio, setPortfolio] = useState([]);
  const [capacity, setCapacity] = useState(null);
  const [actions, setActions] = useState([]);
  const [healthRules, setHealthRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [portRes, capRes, actRes, rulesRes] = await Promise.all([
        fetch("/api/manager/portfolio?view=portfolio", { credentials: "include" }),
        fetch("/api/manager/capacity?weeks=4", { credentials: "include" }),
        fetch("/api/actions", { credentials: "include" }),
        fetch("/api/health-rules", { credentials: "include" })
      ]);
      if (!portRes.ok) throw new Error("API not available.");
      if (portRes.ok) {
        const payload = await portRes.json();
        setPortfolioResponse(payload);
        setPortfolio(payload.projects || []);
      }
      if (capRes.ok) setCapacity(await capRes.json());
      if (actRes.ok) setActions(await actRes.json());
      if (rulesRes.ok) setHealthRules(await rulesRes.json());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  if (loading) return <div className="reports-view fade-in" data-testid="manager-view"><div className="content"><Blueprint><div className="notice">Loading manager data...</div></Blueprint></div></div>;
  if (error) return <div className="reports-view fade-in" data-testid="manager-view"><div className="content"><Blueprint className="empty-state placeholder-panel pt-6 pb-6"><div className="placeholder-icon"><BarChartIcon /></div><h2>Manager Dashboard</h2><p className="muted">{error}</p><button className="secondary mt-4" onClick={loadData}>Retry</button></Blueprint></div></div>;

  const redProjects = portfolioResponse?.red || [];
  const yellowProjects = portfolioResponse?.yellow || [];
  const grayProjects = portfolioResponse?.gray || [];
  const scoreboard = portfolioResponse?.scoreboard || {};

  const getRuleNames = (project) => {
    if (project.override) return `Override: ${project.override.reason}`;
    if (!project.triggeredRules?.length) return "Green otherwise";
    return project.triggeredRules.map(rule => rule.name).join(", ");
  };

  const renderPortfolioRow = (p) => (
    <tr key={p.id} className="list-item" onClick={() => openCard(p.id)} style={{cursor: "pointer"}}>
      <td><strong>{p.number}</strong></td>
      <td>{p.name}</td>
      <td>{p.client}</td>
      <td>{p.pm}</td>
      <td>{metricValue(p.fee, money)}</td>
      <td><span className="muted">{getRuleNames(p)}</span></td>
      <td>{p.riskLine || "—"}</td>
      <td>{p.actionLine || "—"}</td>
      <td>{p.daysSinceLastPmNote == null ? "Never" : `${p.daysSinceLastPmNote}d`}</td>
    </tr>
  );

  const lateActions = actions.filter(a => a.status !== "closed" && a.dueDate && new Date(a.dueDate) < new Date());
  const openActions = actions.filter(a => a.status !== "closed" && !lateActions.includes(a));
  const closedActions = actions.filter(a => a.status === "closed");
  const sortedActions = [...lateActions, ...openActions, ...closedActions];

  const postAction = async (data) => {
    await fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(data) });
    loadData();
  };

  const closeAction = async (id) => {
    await fetch(`/api/actions/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ status: "closed" }) });
    loadData();
  };

  return (
    <div className="reports-view fade-in" data-testid="manager-view">
      <header className="reports-header print-header">
        <div>
          <h2>Manager Dashboard</h2>
          <p className="muted">Prepare for Tuesday review with a clear team view.</p>
        </div>
      </header>
      <nav className="tabs print-hidden" aria-label="Manager views">
        <button className={tab === "portfolio" ? "active" : ""} onClick={() => setTab("portfolio")}>Portfolio</button>
        <button className={tab === "my_projects" ? "active" : ""} onClick={() => setTab("my_projects")}>My Projects</button>
        <button className={tab === "plan_vs_actual" ? "active" : ""} onClick={() => setTab("plan_vs_actual")}>Plan vs Actual</button>
      </nav>
      <div className="reports-content pt-6 pb-6 print-portfolio">
        {tab === "portfolio" && (
          <div className="content">
            <div className="metric-grid mb-3">
              <Metric label="Active roots" value={scoreboard.activeCount ?? 0} />
              <Metric label="Fee under management" value={metricValue(scoreboard.feeUnderManagement || 0, money)} />
              <Metric label="Unbilled WIP estimate" value={metricValue(scoreboard.unbilledWipEstimate || 0, money)} />
              <Metric label="AR total / over 60" value={`${metricValue(scoreboard.arTotal || 0, money)} / ${metricValue(scoreboard.arOver60 || 0, money)}`} />
              <Metric label="Red / Yellow / Gray" value={`${scoreboard.redCount || 0} / ${scoreboard.yellowCount || 0} / ${scoreboard.grayCount || 0}`} accent />
              <Metric label="No contract amount on file" value={scoreboard.noContractAmountOnFileCount || 0} gray />
            </div>
            {scoreboard.arDataAsOf && (
              <p className="muted mb-3">AR data as of {new Date(scoreboard.arDataAsOf).toLocaleString()}</p>
            )}
            {portfolioResponse?.snapshot && (
              <p className="muted mb-3">
                Snapshot: {portfolioResponse.snapshot.label} ({new Date(portfolioResponse.snapshot.capturedAt).toLocaleString()})
                {portfolioResponse.vsAug30 && <> · vs {portfolioResponse.vsAug30.label}: {portfolioResponse.vsAug30.activeExternalRootCountDelta >= 0 ? "+" : ""}{portfolioResponse.vsAug30.activeExternalRootCountDelta} active roots; {portfolioResponse.vsAug30.arTotalDelta >= 0 ? "+" : ""}{metricValue(portfolioResponse.vsAug30.arTotalDelta, money)} AR</>}
              </p>
            )}

            <Blueprint className="mb-4 pt-0 pb-0" style={{padding:0}}>
              <div className="section-heading" style={{padding: "20px 20px 0"}}>
                <h3 className="danger" style={{color:"var(--danger)"}}>Needs Attention Now (Red)</h3>
              </div>
              <div className="table-wrap" style={{marginTop:0, borderTop:0}}>
                <table>
                  <thead><tr><th>Project</th><th>Name</th><th>Client</th><th>PM</th><th>Fee</th><th>Rule</th><th>Risk</th><th>Action</th><th>PM note</th></tr></thead>
                  <tbody>{redProjects.map(renderPortfolioRow)}</tbody>
                </table>
              </div>
            </Blueprint>

            <Blueprint className="mb-4 pt-0 pb-0" style={{padding:0}}>
              <div className="section-heading" style={{padding: "20px 20px 0"}}>
                <h3 style={{color: "#d9aa3e"}}>Trending Wrong (Yellow)</h3>
              </div>
              <div className="table-wrap" style={{marginTop:0, borderTop:0}}>
                <table>
                  <thead><tr><th>Project</th><th>Name</th><th>Client</th><th>PM</th><th>Fee</th><th>Rule</th><th>Risk</th><th>Action</th><th>PM note</th></tr></thead>
                  <tbody>{yellowProjects.map(renderPortfolioRow)}</tbody>
                </table>
              </div>
            </Blueprint>

            <Blueprint className="mb-4 pt-0 pb-0" style={{padding:0}}>
              <details>
                <summary className="section-heading" style={{cursor:"pointer", marginBottom:0, padding: "20px 20px 0"}}>
                  <h3 className="muted">Needs a Decision ({grayProjects.length})</h3>
                </summary>
                <div className="table-wrap" style={{marginTop:0}}>
                  <table>
                    <thead><tr><th>Project</th><th>Name</th><th>Client</th><th>PM</th><th>Fee</th><th>Rule</th><th>Risk</th><th>Action</th><th>PM note</th></tr></thead>
                    <tbody>{grayProjects.map(renderPortfolioRow)}</tbody>
                  </table>
                </div>
              </details>
            </Blueprint>

            <div className="two-col">
              <Blueprint>
                <div className="section-heading"><h3>Team Capacity</h3></div>
                <p className="muted small">{capacity?.label || "based on recent actuals"}</p>
                {capacity?.disciplines?.length > 0 ? (
                  <div className="bars mb-4">
                    {capacity.disciplines.map(discipline => (
                      <Bar key={discipline.discipline} label={`${discipline.discipline} (${discipline.headcount})`} value={Number(discipline.actualHours)} max={Number(discipline.availableHours) || 1} tone={discipline.utilization > .9 ? "high" : "medium"} />
                    ))}
                  </div>
                ) : <p className="muted mt-4">No capacity data.</p>}
                <div className="table-wrap border-t pt-4">
                  <table>
                    <thead><tr><th>Employee</th><th>Week</th><th>Actual Hrs</th><th>Available</th></tr></thead>
                    <tbody>
                      {capacity?.disciplines?.flatMap(discipline => discipline.people).map((person, i) => (
                        <tr key={`${person.discipline}-${person.employee}-${i}`}>
                          <td>{person.employee} {person.flag && <span className="badge high ml-2">{person.flag}</span>}</td>
                          <td>{person.discipline}</td>
                          <td>{metricValue(person.actualHours)}</td>
                          <td>{metricValue(person.availableHours)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Blueprint>

              <Blueprint>
                <div className="section-heading">
                  <div>
                    <h3>Actions</h3>
                    <p className="muted small mt-1">{lateActions.length} late, {openActions.length} open, {closedActions.length} closed</p>
                  </div>
                </div>
                <div className="table-wrap mb-4">
                  <table>
                    <thead><tr><th>What</th><th>Status</th><th>Owner</th><th/></tr></thead>
                    <tbody>
                      {sortedActions.map(a => (
                        <tr key={a.id}>
                          <td><strong style={{color: a.status !== "done" && a.dueDate && new Date(a.dueDate) < new Date() ? "var(--danger)" : "inherit"}}>{a.what}</strong></td>
                          <td>{a.status}</td>
                          <td>{a.ownerEmployeeId || "—"}</td>
                          <td style={{textAlign:"right"}}>
                            {a.status !== "closed" && access?.canEdit && <button className="text-button" onClick={() => closeAction(a.id)}>Close</button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {access?.canEdit && (
                  <div className="overlay-form border-t pt-4">
                    <label><span>Add Action</span>
                      <div className="flex mt-1" style={{display:"flex", gap:"8px"}}>
                        <input id="new-action-what" placeholder="What needs to be done?" style={{flex: 1}} />
                        <button className="secondary" onClick={() => {
                          const what = document.getElementById("new-action-what").value;
                          if (what) postAction({ what, priority: "medium" }).then(() => { document.getElementById("new-action-what").value = ""; });
                        }}>Add</button>
                      </div>
                    </label>
                  </div>
                )}
              </Blueprint>
            </div>
          </div>
        )}

        {tab === "my_projects" && (
          <MyProjectsTab portfolio={portfolio} projectsData={projectsData} access={access} openCard={openCard} />
        )}

        {tab === "plan_vs_actual" && (
          <PlanVsActualTab portfolio={portfolio} />
        )}
      </div>
    </div>
  );
}

function MyProjectsTab({ portfolio, projectsData, access, openCard }) {
  const pms = [...new Set(portfolio.map(p => p.pm).filter(Boolean))].sort();
  const [pm, setPm] = useState(pms[0] || "");
  const filtered = portfolio.filter(p => p.pm === pm);
  
  return (
    <div className="content">
      <Blueprint>
        <div className="filters mb-0">
          <select value={pm} onChange={e => setPm(e.target.value)}>
            {pms.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </Blueprint>
      
      {filtered.map(p => {
        return (
          <Blueprint key={p.id} className="mb-4">
            <div className="project-title pt-0 border-t-0 pb-0 mb-4 flex" style={{display: "flex", justifyContent:"space-between"}}>
              <div>
                <span className="overline muted">{p.number} · {p.client}</span>
                <h2 style={{margin: "4px 0"}}>{p.name}</h2>
              </div>
              <div style={{display:"flex", gap:"10px", alignItems:"center"}}>
                <span className={`badge ${p.severity}`}>{p.severity} health</span>
                {p.noContractAmountOnFile && <span className="badge gray">No contract amount on file</span>}
                <button className="secondary" onClick={() => openCard(p.id)}>View Details</button>
              </div>
            </div>
            <div className="metric-grid compact mb-4">
              <Metric label="Budget burn" value={p.metrics?.budgetHours == null ? "UNKNOWN" : `${metricValue((p.metrics.budgetBurn || 0) * 100)}%`} />
              <Metric label="Complete vs burn" value={`${metricValue(p.percentComplete)}% / ${p.metrics?.budgetBurn == null ? "UNKNOWN" : `${metricValue(p.metrics.budgetBurn * 100)}%`}`} />
              <Metric label="Fee remaining" value={metricValue(p.metrics?.feeRemaining || 0, money)} />
              <Metric label="AR / oldest" value={`${metricValue(p.metrics?.arTotal || 0, money)} / ${p.metrics?.oldestPastDueDays ?? 0}d`} />
              <Metric label="WIP / age" value={`${metricValue(p.metrics?.wipEstimate || 0, money)} / ${p.metrics?.wipAgeDays ?? 0}d`} />
              <Metric label="Last time / contact" value={`${p.metrics?.daysSinceLastTime ?? "Never"}d / ${p.metrics?.daysSinceLastContact ?? "Never"}d`} />
            </div>
            <p className="muted"><b>Rule:</b> {p.triggeredRules?.[0]?.name || "Green otherwise"}</p>
            <p><b>Risk:</b> {p.riskLine || "—"} &nbsp; <b>Action:</b> {p.actionLine || "—"}</p>
            {access?.canEdit && <PMNoteEditor projectId={p.id} initial={{ riskLine: p.riskLine, actionLine: p.actionLine, percentComplete: p.percentComplete }} />}
          </Blueprint>
        );
      })}
      {filtered.length === 0 && (
        <Blueprint className="empty-state placeholder-panel pt-6 pb-6">
           <div className="placeholder-icon"><UsersIcon /></div>
           <h2>No projects found</h2>
           <p className="muted">No projects assigned to this PM.</p>
        </Blueprint>
      )}
    </div>
  );
}

function PMNoteEditor({ projectId, initial = {} }) {
  const [note, setNote] = useState({
    riskLine: initial.riskLine || "",
    actionLine: initial.actionLine || "",
    percentComplete: initial.percentComplete ?? "",
  });
  const [status, setStatus] = useState("");
  const save = async () => {
    setStatus("Saving...");
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/notes`, {
        method: "POST", headers: {"Content-Type":"application/json"}, credentials: "include",
        body: JSON.stringify(note)
      });
      if (!res.ok) throw new Error("Save failed");
      setStatus("Saved.");
    } catch(err) { setStatus(err.message); }
  };
  return (
    <div className="overlay-form pt-4 border-t">
      <label><span>Risk, action, percent complete</span>
        <div className="flex mt-1" style={{display:"flex", gap:"8px"}}>
          <input value={note.riskLine} onChange={e=>setNote({...note, riskLine: e.target.value})} placeholder="Risk line" style={{flex:1}} />
          <input value={note.actionLine} onChange={e=>setNote({...note, actionLine: e.target.value})} placeholder="Action line" style={{flex:1}} />
          <input type="number" min="0" max="100" value={note.percentComplete} onChange={e=>setNote({...note, percentComplete: e.target.value})} placeholder="%" style={{width:"72px"}} />
          <button className="secondary" onClick={save}>Save</button>
        </div>
        {status && <small className="muted mt-2" style={{display: "block"}}>{status}</small>}
      </label>
    </div>
  );
}

function PlanVsActualTab({ portfolio }) {
  const [projectId, setProjectId] = useState("");
  const [plan, setPlan] = useState(null);
  
  useEffect(() => {
    if (projectId) {
      fetch(`/api/manager/plan-vs-actual/${encodeURIComponent(projectId)}`, { credentials: "include" })
        .then(res => res.json())
        .then(data => setPlan(data))
        .catch(err => console.error(err));
    } else {
      setPlan(null);
    }
  }, [projectId]);

  return (
    <div className="content">
      <Blueprint>
        <div className="filters mb-0">
          <select value={projectId} onChange={e => setProjectId(e.target.value)}>
            <option value="">Select a project...</option>
            {portfolio.map(p => <option key={p.id} value={p.id}>{p.number} - {p.name}</option>)}
          </select>
        </div>
      </Blueprint>

      {plan && (
        <Blueprint>
          <div className="section-heading">
            <h3>{plan.project?.name} - Plan vs Actual</h3>
          </div>
          {!plan.hasBudget && <div className="notice warning mb-4" style={{border: "1px solid #d9aa3e", color:"#916816", background:"#fff0c7", textAlign:"left"}}>No plan loaded. Load a budget to enable comparison.</div>}
          
          <div className="table-wrap border-t pt-4">
            <table>
              <thead><tr><th>Phase / activity</th><th>Planned</th><th>Actual</th><th>Variance</th><th>Variance %</th></tr></thead>
              <tbody>
                {(plan.phases || []).flatMap(phase => [
                  <tr key={`phase-${phase.id}`}><td><b>{phase.code} — {phase.name}</b></td><td>{phase.planned == null ? "UNKNOWN" : metricValue(phase.planned)}</td><td>{metricValue(phase.actual)}</td><td>{phase.variance == null ? "—" : metricValue(phase.variance)}</td><td>{phase.variancePercent == null ? "—" : `${metricValue(phase.variancePercent * 100)}%`}</td></tr>,
                  ...(phase.activities || []).map(activity => <tr key={`${phase.id}-${activity.code}`}><td>&nbsp;&nbsp;{activity.code} — {activity.name}</td><td>{activity.planned == null ? "UNKNOWN" : metricValue(activity.planned)}</td><td>{metricValue(activity.actual)}</td><td>{activity.variance == null ? "—" : metricValue(activity.variance)}</td><td>{activity.variancePercent == null ? "—" : `${metricValue(activity.variancePercent * 100)}%`}</td></tr>)
                ])}
                {!(plan.phases?.length) && <tr><td colSpan="5" className="muted text-center">No actuals recorded.</td></tr>}
              </tbody>
            </table>
          </div>
        </Blueprint>
      )}
    </div>
  );
}


function MappingRow({ row, fingerprints, onSave, disabled }) {
  const [key, setKey] = useState(row.fingerprintKey || "");
  const [active, setActive] = useState(row.active);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setKey(row.fingerprintKey || "");
    setActive(row.active);
  }, [row.fingerprintKey, row.active]);

  const isDirty = key !== (row.fingerprintKey || "") || active !== row.active;

  const handleSave = async () => {
    setSaving(true);
    await onSave(row.sourceValue, key, active);
    setSaving(false);
  };

  return (
    <tr className={disabled ? "disabled-row" : ""}>
      <td className="break-word" style={{ maxWidth: "200px" }}><strong>{row.sourceValue || "(Empty)"}</strong></td>
      <td>{row.hours > 0 ? `${metricValue(row.hours)} (${metricValue(row.count)})` : "—"}</td>
      <td>
        <select value={key} onChange={e => setKey(e.target.value)} disabled={saving || disabled} className="mappings-select" aria-label={`Mapping for ${row.sourceValue}`}>
          <option value="">Select mapping…</option>
          {fingerprints.map(f => (
            <option key={f.key} value={f.key}>{f.key} {f.active ? "" : "(Inactive)"}</option>
          ))}
        </select>
      </td>
      <td>
        <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} disabled={saving || disabled} aria-label={`Active status for ${row.sourceValue}`} />
      </td>
      <td>
        {isDirty && !disabled && (
          <button className="secondary" style={{padding: "6px 12px"}} onClick={handleSave} disabled={saving || !key}>
            {saving ? "…" : "Save"}
          </button>
        )}
      </td>
    </tr>
  );
}

function Phase2Admin() {
  const [data, setData] = useState(null);
  const [mappingsData, setMappingsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [localSourceKind, setLocalSourceKind] = useState("");
  const [localSourceFieldKey, setLocalSourceFieldKey] = useState("");
  const [savingSource, setSavingSource] = useState(false);

  const loadData = async () => {
    try {
      const [recRes, mapRes] = await Promise.all([
        fetch("/api/admin/phase2/reconciliation", { credentials: "include" }),
        fetch("/api/admin/phase2/mappings", { credentials: "include" })
      ]);
      if (!recRes.ok || !mapRes.ok) throw new Error("Failed to load Phase 2 data");

      const recData = await recRes.json();
      const mapData = await mapRes.json();

      setData(recData);
      setMappingsData(mapData);

      setLocalSourceKind(mapData.source?.sourceKind || "");
      setLocalSourceFieldKey(mapData.source?.sourceFieldKey || "");

      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const runReconciliation = async () => {
    setRunning(true);
    setMessage("Running D-1 reconciliation. This may take a moment...");
    setError("");
    try {
      const res = await fetch("/api/admin/phase2/reconciliation", { method: "POST", credentials: "include" });
      if (!res.ok) {
         const err = await res.json().catch(() => ({}));
         throw new Error(err.error || "Failed to run reconciliation");
      }
      setMessage("Reconciliation complete.");
      await loadData();
    } catch (err) {
      setError(err.message);
      setMessage("");
    } finally {
      setRunning(false);
    }
  };

  const handleSaveMappingSource = async () => {
    setSavingSource(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/phase2/mapping-source", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sourceKind: localSourceKind === "" ? null : localSourceKind,
          sourceFieldKey: localSourceKind === "custom_field" ? localSourceFieldKey : null
        })
      });
      if (!res.ok) {
         const err = await res.json().catch(() => ({}));
         throw new Error(err.error || "Failed to save mapping source");
      }
      setMessage("Mapping source saved successfully.");
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingSource(false);
    }
  };

  const updateMapping = async (sourceValue, fingerprintKey, active) => {
    try {
       const res = await fetch(`/api/admin/phase2/mappings/${encodeURIComponent(sourceValue)}`, {
         method: "PUT",
         headers: { "Content-Type": "application/json" },
         credentials: "include",
         body: JSON.stringify({ fingerprintKey, active })
       });
       if (!res.ok) {
         const err = await res.json().catch(() => ({}));
         throw new Error(err.error || "Failed to update mapping");
       }
       await loadData();
       setMessage("Mapping saved successfully.");
    } catch (err) {
       setError(err.message);
    }
  };

  if (loading && !data) return <Blueprint><div className="notice" data-testid="status-phase2-loading">Loading Phase 2 data…</div></Blueprint>;

  const latest = data?.latest;
  const runs = data?.runs || [];
  const mappings = mappingsData?.mappings || [];
  const fingerprints = mappingsData?.fingerprints || [];

  const allSourceValues = new Set();
  mappings.forEach(m => allSourceValues.add(m.sourceValue));
  (latest?.unmappedValues || []).forEach(u => allSourceValues.add(u.sourceValue));

  const combinedMappings = Array.from(allSourceValues).map(val => {
    const mapping = mappings.find(m => m.sourceValue === val);
    const unmappedData = latest?.unmappedValues?.find(u => u.sourceValue === val);
    return {
      sourceValue: val,
      fingerprintKey: mapping?.fingerprintKey || "",
      active: mapping ? mapping.active : true,
      hours: unmappedData?.hours || 0,
      count: unmappedData?.count ?? unmappedData?.projectCount ?? 0,
      isMapped: !!mapping,
    };
  }).sort((a, b) => {
    if (a.isMapped !== b.isMapped) return a.isMapped ? 1 : -1;
    return b.hours - a.hours;
  });

  const isSourceDirty = localSourceKind !== (mappingsData?.source?.sourceKind || "") ||
                        (localSourceKind === "custom_field" && localSourceFieldKey !== (mappingsData?.source?.sourceFieldKey || ""));

  const editorDisabled = (!mappingsData?.source?.sourceKind || mappingsData?.source?.sourceKind === "name_pattern");

  return (
    <div className="phase2-admin" style={{ marginTop: "48px", display: "flex", flexDirection: "column", gap: "22px" }}>
      <Blueprint>
        <div className="section-heading">
          <div>
            <h3>Phase 2: D-1 Reconciliation</h3>
            <p className="muted">Estimator vs Actual data readiness check.</p>
          </div>
          <button className="primary" onClick={runReconciliation} disabled={running}>
            {running ? "Running…" : "Run D-1"}
          </button>
        </div>
        {message && <div className="notice admin-message">{message}</div>}
        {error && <div className="notice error">{error}</div>}

        {latest ? (
          <>
            <div className={`reconciliation-banner ${latest.passed ? "pass" : "fail"}`}>
              <div>
                <h3>{latest.passed ? "RECONCILIATION PASSED" : "RECONCILIATION FAILED"}</h3>
                <p className="muted">As of {new Date(latest.asOfDate).toLocaleString()} · Source Pull: {latest.sourcePullRunId}</p>
              </div>
              <div className="banner-actions">
                 <a href={`/api/admin/phase2/reconciliation/${latest.id}/population.csv`} className="secondary" download>Population CSV</a>
                 <a href={`/api/admin/phase2/reconciliation/${latest.id}/exclusions.csv`} className="secondary" download>Exclusions CSV</a>
              </div>
            </div>

            <div className="two-col mb-3">
              <div>
                <h4 className="mb-3">Exact Tie-Out</h4>
                <div className="table-wrap" style={{marginTop: 0}}>
                  <table>
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>Expected (Anchor)</th>
                        <th>Accounted</th>
                        <th>Difference</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><strong>Hours</strong></td>
                        <td>{metricValue(latest.anchorHours)}</td>
                        <td>{metricValue(latest.accountedHours)}</td>
                        <td>{metricValue(latest.differenceHours)}</td>
                      </tr>
                      <tr>
                        <td><strong>Projects</strong></td>
                        <td>{metricValue(latest.projectCountExpected)}</td>
                        <td>{metricValue(latest.projectCountAccounted)}</td>
                        <td>{metricValue(latest.projectCountDifference)}</td>
                      </tr>
                      <tr>
                        <td><strong>Type Subtotals</strong></td>
                        <td>—</td>
                        <td>—</td>
                        <td>{metricValue(latest.typeSubtotalDifference)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                 <h4 className="mb-3">Cohort Metrics</h4>
                 <div className="metric-grid compact">
                   <div className="metric">
                      <span className="overline">Cohort A — Completed</span>
                     <strong>{metricValue(latest.cohortA?.count)}</strong>
                     <small className="muted">{metricValue(latest.cohortA?.hours)} hours</small>
                   </div>
                   <div className="metric">
                      <span className="overline">Cohort B — Active</span>
                     <strong>{metricValue(latest.cohortB?.count)}</strong>
                     <small className="muted">{metricValue(latest.cohortB?.hours)} hours</small>
                   </div>
                 </div>

                 <h4 className="mb-3 mt-6">Non-Project Buckets</h4>
                 <div className="table-wrap" style={{marginTop: 0}}>
                   <table>
                     <thead>
                       <tr><th>Bucket</th><th>Hours</th><th>Entries</th></tr>
                     </thead>
                     <tbody>
                       {(latest.nonProjectBuckets || []).map(b => (
                         <tr key={b.bucket}>
                           <td><strong>{b.bucket}</strong></td>
                           <td>{metricValue(b.hours)}</td>
                           <td>{metricValue(b.entryCount)}</td>
                         </tr>
                       ))}
                       {(!latest.nonProjectBuckets || latest.nonProjectBuckets.length === 0) && (
                         <tr><td colSpan="3" className="muted text-center">No non-project data</td></tr>
                       )}
                     </tbody>
                   </table>
                 </div>
              </div>
            </div>
          </>
        ) : (
          <div className="notice">No recent reconciliation runs.</div>
        )}
      </Blueprint>

      {latest && (
        <Blueprint>
          <div className="section-heading">
            <div>
              <h3>Type Subtotals</h3>
              <p className="muted">Reconciliation across mapped fingerprints.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mapping source value</th>
                  <th>Fingerprint Key</th>
                  <th>Project Count</th>
                  <th>Hours</th>
                </tr>
              </thead>
              <tbody>
                {(latest.typeSubtotals || []).map((ts, i) => (
                  <tr key={i}>
                    <td><strong>{ts.sourceValue || ts.projectType}</strong></td>
                    <td>{ts.fingerprintKey}</td>
                    <td>{metricValue(ts.projectCount)}</td>
                    <td>{metricValue(ts.hours)}</td>
                  </tr>
                ))}
                {(!latest.typeSubtotals || latest.typeSubtotals.length === 0) && (
                  <tr><td colSpan="4" className="muted text-center">No type subtotals available</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Blueprint>
      )}

      {latest && (
        <Blueprint>
          <div className="section-heading">
            <div>
              <h3>Exclusions</h3>
              <p className="muted">Projects omitted from the target cohort due to rule failures.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Hours</th>
                  <th>Failed Rules</th>
                </tr>
              </thead>
              <tbody>
                {(latest.exclusions || []).map(ex => (
                  <tr key={ex.projectId}>
                    <td><strong>{ex.projectCode}</strong><small className="muted">{ex.projectName}</small></td>
                    <td>{ex.projectType}</td>
                    <td>{ex.status}</td>
                    <td>{metricValue(ex.hours)}</td>
                    <td>
                       <div className="filters compact" style={{marginBottom: 0}}>
                         {(ex.failedRules || []).map(r => <span key={r} className="badge high">{r}</span>)}
                       </div>
                    </td>
                  </tr>
                ))}
                {(!latest.exclusions || latest.exclusions.length === 0) && (
                  <tr><td colSpan="5" className="muted text-center">No exclusions in the latest run</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Blueprint>
      )}

      <Blueprint>
        <div className="section-heading">
          <div>
            <h3>D-2: Mapping Source Control</h3>
            <p className="muted">Select the BQE field driving Phase 2 estimation mapping.</p>
          </div>
        </div>

        <div className="filters">
          <select value={localSourceKind} onChange={e => setLocalSourceKind(e.target.value)} disabled={savingSource}>
            <option value="">Unselected</option>
            <option value="class">Project class</option>
            <option value="custom_field">Project custom field</option>
            <option value="name_pattern">Name-pattern review (future)</option>
          </select>

          {localSourceKind === "custom_field" && (
            <select value={localSourceFieldKey} onChange={e => setLocalSourceFieldKey(e.target.value)} disabled={savingSource}>
              <option value="">Select custom field…</option>
              {(mappingsData?.candidateFields || []).map(f => (
                <option key={f.fieldKey} value={f.fieldKey}>{f.label} ({f.distinctValueCount} values)</option>
              ))}
            </select>
          )}

          {isSourceDirty && (
            <button className="primary" onClick={handleSaveMappingSource} disabled={savingSource || (localSourceKind === "custom_field" && !localSourceFieldKey)}>
              {savingSource ? "Saving…" : "Save Source"}
            </button>
          )}
        </div>

        {localSourceKind === "" && (
          <div className="admin-notice-block danger">
            <strong>Warning:</strong> Unselected means all projects fail I-2 classification.
          </div>
        )}
        {localSourceKind === "name_pattern" && (
          <div className="admin-notice-block warning">
            <strong>Warning:</strong> Name pattern is diagnostic/future and does not auto-classify.
          </div>
        )}

        <div className="section-heading mt-6 pt-6 top-rule">
          <div>
            <h3>D-2: Value Mappings</h3>
            <p className="muted">Map distinct source values to estimating fingerprints.</p>
          </div>
        </div>

        {editorDisabled ? (
           <div className="placeholder-panel pt-6 pb-6">
             <p className="muted">Mapping editor is disabled because the current source is Unselected or Name-pattern.</p>
           </div>
        ) : (
          <div className="table-wrap" style={{marginTop: 0}}>
            <table>
              <thead>
                <tr>
                  <th>Source Value</th>
                  <th>Hours (Projects)</th>
                  <th>Fingerprint</th>
                  <th>Active</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {combinedMappings.map((m, i) => (
                  <MappingRow key={`${m.sourceValue}-${i}`} row={m} fingerprints={fingerprints} onSave={updateMapping} disabled={editorDisabled} />
                ))}
                {combinedMappings.length === 0 && (
                  <tr><td colSpan="5" className="text-center muted">No values found for the current mapping source.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Blueprint>

      <Blueprint>
        <div className="section-heading">
          <div>
            <h3>Diagnostics & Audit Tables</h3>
            <p className="muted">Review data distribution for mapping strategies.</p>
          </div>
        </div>

        <div className="two-col">
          <div>
            <h4 className="mb-3">Project Class Values</h4>
            <div className="table-wrap" style={{marginTop: 0}}>
              <table>
                <thead>
                  <tr><th>Value</th><th>Projects</th><th>Hours</th></tr>
                </thead>
                <tbody>
                  {(latest?.classDiagnostics || []).map((c, i) => (
                    <tr key={i}>
                      <td className="break-word">{c.value || "(Empty)"}</td>
                      <td>{metricValue(c.projectCount)}</td>
                      <td>{metricValue(c.hours)}</td>
                    </tr>
                  ))}
                  {!(latest?.classDiagnostics?.length) && <tr><td colSpan="3" className="text-center muted">No class values found</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h4 className="mb-3">Project Custom-Field Values</h4>
            {(() => {
              const cfGroups = (latest?.customFieldDiagnostics || []).reduce((acc, c) => {
                if (!acc[c.fieldLabel]) acc[c.fieldLabel] = [];
                acc[c.fieldLabel].push(c);
                return acc;
              }, {});
              const entries = Object.entries(cfGroups);
              if (entries.length === 0) {
                return <p className="muted mt-4">No custom field values found.</p>;
              }
              return entries.map(([label, items]) => (
                <div key={label} className="mb-4">
                  <strong className="overline">{label}</strong>
                  <div className="table-wrap" style={{marginTop: 4}}>
                    <table>
                      <thead>
                        <tr><th>Value</th><th>Projects</th><th>Hours</th></tr>
                      </thead>
                      <tbody>
                        {items.map((c, i) => (
                          <tr key={i}>
                            <td className="break-word">{c.value || "(Empty)"}</td>
                            <td>{metricValue(c.projectCount)}</td>
                            <td>{metricValue(c.hours)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>

        <div className="mt-6 pt-6 top-rule">
          <div className="section-heading mb-3">
            <div>
              <h4 className="mb-2">Text Hints from Names</h4>
              <span className="badge high mb-2">NON-AUTHORITATIVE</span>
              <p className="muted">This is a human review worksheet only. These hints are extracted diagnostically and do not perform classification.</p>
            </div>
          </div>
          <div className="table-wrap" style={{ maxHeight: "400px", overflowY: "auto" }}>
            <table>
              <thead style={{ position: "sticky", top: 0, zIndex: 1, background: "rgba(255,255,255,0.95)" }}>
                <tr><th>Hint Value</th><th>Projects</th><th>Hours</th></tr>
              </thead>
              <tbody>
                {(latest?.textHintDiagnostics || []).map((t, i) => (
                  <tr key={i}>
                    <td className="break-word">{t.value || "(Empty)"}</td>
                    <td>{metricValue(t.projectCount)}</td>
                    <td>{metricValue(t.hours)}</td>
                  </tr>
                ))}
                {!(latest?.textHintDiagnostics?.length) && <tr><td colSpan="3" className="text-center muted">No text hints found</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </Blueprint>

      <Blueprint>
        <div className="section-heading">
          <div>
            <h3>Run History</h3>
            <p className="muted">Previous reconciliation attempts.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Run ID</th>
                <th>Date</th>
                <th>Status</th>
                <th>Expected Hours</th>
                <th>Difference</th>
                <th>CSV</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(run => (
                <tr key={run.id}>
                  <td><strong>{run.id.slice(0, 8)}</strong></td>
                  <td>{new Date(run.createdAt).toLocaleString()}</td>
                  <td><span className={`badge ${run.passed ? "low" : "high"}`}>{run.passed ? "PASS" : "FAIL"}</span></td>
                  <td>{metricValue(run.anchorHours)}</td>
                  <td>{metricValue(run.differenceHours)}</td>
                  <td>
                    <a href={`/api/admin/phase2/reconciliation/${run.id}/population.csv`} className="text-button" download style={{marginRight: "12px"}}>Pop</a>
                    <a href={`/api/admin/phase2/reconciliation/${run.id}/exclusions.csv`} className="text-button" download>Exc</a>
                  </td>
                </tr>
              ))}
              {runs.length === 0 && (
                <tr><td colSpan="6" className="muted text-center">No run history available</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Blueprint>
    </div>
  );
}

function AdminView({ dashboard, currentUserId, onDashboardReload }) {
  const selfAdminRoleError = "You cannot remove or downgrade your own administrator role.";
  const [status, setStatus] = useState(null);
  const [users, setUsers] = useState([]);
  const [accessChanges, setAccessChanges] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const loadAdmin = async () => {
    setLoading(true);
    setMessage("");
    try {
      const [statusResponse, usersResponse, accessChangesResponse] = await Promise.all([
        fetch("/api/admin/status", { credentials: "include" }),
        fetch("/api/admin/users", { credentials: "include" }),
        fetch("/api/admin/access-changes", { credentials: "include" }),
      ]);
      if (!statusResponse.ok || !usersResponse.ok || !accessChangesResponse.ok) throw new Error("Admin data could not be loaded.");
      const [statusPayload, usersPayload, accessChangesPayload] = await Promise.all([statusResponse.json(), usersResponse.json(), accessChangesResponse.json()]);
      setStatus(statusPayload);
      setUsers(usersPayload.users);
      setAccessChanges(accessChangesPayload.changes);
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
    if (userId === currentUserId && role !== "admin") {
      setMessage(selfAdminRoleError);
      return;
    }
    setMessage("Saving access role…");
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/role`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: role || null }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "The user role could not be saved.");
      }
      setUsers((current) => current.map((user) => user.id === userId ? { ...user, role: payload.role } : user));
      await loadAdmin();
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
      {message && <div className="notice admin-message" role="status" aria-live="polite" data-testid="status-admin-message">{message}</div>}
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
        <div className="section-heading"><div><h3>Recent access changes</h3><p className="muted">Administrator-only history of dashboard role changes. Rejected self-lockout attempts are not included.</p></div></div>
        {accessChanges.length === 0 ? <div className="notice" data-testid="status-access-history-empty">No dashboard access changes recorded yet.</div> : <div className="table-wrap"><table className="access-history-table"><thead><tr><th>Changed</th><th>Administrator</th><th>User</th><th>Role change</th></tr></thead><tbody>{accessChanges.map((change) => {
          const actor = users.find((user) => user.id === change.actorUserId);
          const target = users.find((user) => user.id === change.targetUserId);
          return <tr key={change.id} data-testid={`row-access-change-${change.id}`}><td><time dateTime={change.changedAt}>{new Date(change.changedAt).toLocaleString()}</time></td><td><strong>{actor?.name ?? change.actorUserId}</strong>{actor?.email && <small className="muted">{actor.email}</small>}</td><td><strong>{target?.name ?? change.targetUserId}</strong>{target?.email && <small className="muted">{target.email}</small>}</td><td><span className="access-role">{change.previousRole ?? "Unapproved"}</span><span className="access-arrow" aria-hidden="true">→</span><span className="access-role">{change.newRole ?? "Unapproved"}</span></td></tr>;
        })}</tbody></table></div>}
      </Blueprint>
      <Blueprint>
        <div className="section-heading"><div><h3>User access</h3><p className="muted">Unapproved users cannot access operations data. Your own admin role is locked here to prevent accidental lockout.</p></div></div>
        <div className="table-wrap"><table><thead><tr><th>User</th><th>Email</th><th>Dashboard role</th></tr></thead><tbody>{users.map((user) => <tr key={user.id} data-testid={`row-admin-user-${user.id}`}><td><strong>{user.name}</strong>{user.id === currentUserId && <small className="muted">Current user</small>}</td><td>{user.email}</td><td><select value={user.role ?? ""} disabled={user.id === currentUserId} onChange={(event) => updateRole(user.id, event.target.value)} data-testid={`select-user-role-${user.id}`}><option value="">Unapproved</option><option value="viewer">Viewer</option><option value="editor">Editor</option><option value="admin">Admin</option></select></td></tr>)}</tbody></table></div>
      </Blueprint>

      <Phase2Admin />
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
  const [subParam, setSubParam] = useState(() => {
    const parts = window.location.pathname.slice(basePath.length).replace(/^\/+|\/+$/g, "").split("/");
    return parts[1] || "";
  });
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
    const handlePopState = () => {
      setPage(pageFromPath(window.location.pathname));
      const parts = window.location.pathname.slice(basePath.length).replace(/^\/+|\/+$/g, "").split("/");
      setSubParam(parts[1] || "");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    document.title = `${page === "home" ? "Home" : page === "manager" ? "Manager Dashboard" : page[0].toUpperCase() + page.slice(1)} · CDI Operations Hub`;
    if (access && page === "admin" && !access.isAdmin) {
      window.history.replaceState({}, "", pathForPage("home"));
      setPage("home");
      setSubParam("");
    }
  }, [access, page]);

  const navigate = (nextPage, nextSub = "") => {
    if (!hubPages.has(nextPage)) return;
    const nextPath = pathForPage(nextPage) + (nextSub ? `/${nextSub}` : "");
    if (window.location.pathname !== nextPath) window.history.pushState({}, "", nextPath);
    setPage(nextPage);
    setSubParam(nextSub);
    document.querySelector(".hub-main")?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const userName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.primaryEmailAddress?.emailAddress || "Approved user";

  const openCard = (code) => {
    setSelectedCode(code); // keep this for backward compatibility if needed
    navigate("projects", code);
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
            <button onClick={(event) => {
              event.currentTarget.focus();
              window.dispatchEvent(new CustomEvent("cdi-open-global-search"));
            }} data-testid="sidebar-search">
              <SearchIcon /> Search <kbd style={{ marginLeft: 4, fontFamily: "var(--font-mono)", fontSize: 9, opacity: 0.7 }}>⌘K</kbd>
            </button>
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
            <SheetPage page={page} userName={userName} data={data}>
              {page === 'home' && <HomeView onNavigate={navigate} isAdmin={access?.isAdmin} userName={userName} />}
              {page === 'reports' && <ReportsView data={data} access={access} view={view} setView={setView} query={query} setQuery={setQuery} pmFilter={pmFilter} setPmFilter={setPmFilter} priority={priority} setPriority={setPriority} selectedCode={selectedCode} setSelectedCode={setSelectedCode} updateProject={updateProject} openCard={openCard} />}
              {page === 'projects' && !subParam && <ProjectsView onOpen={openCard} />}
              {page === 'projects' && subParam && <ProjectDetailView code={subParam} onBack={() => navigate("projects")} onSave={updateProject} access={access} />}
              {page === 'estimating' && <EstimatingView onNavigate={navigate} />}
              {page === 'pipeline' && <PipelineView onNavigate={navigate} routeIntakeId={subParam} />}
              {page === 'manager' && <ManagerView projectsData={data.projects} openCard={openCard} access={access} />}
              {page === 'admin' && access?.isAdmin && <AdminView dashboard={data} currentUserId={access.userId} onDashboardReload={loadDashboard} />}
            </SheetPage>
          )}
        </main>
        <GlobalSearch navigate={navigate} />
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
    <div className="project-title"><div><span className="overline muted">{project.code} · {project.client}</span><h2>{project.name}</h2><p className="muted">{project.pm} · {project.contractValueVisible ? money.format(project.contractValue) : "Contract value not captured"} · {money.format(project.exposure)} exposure</p>{!project.contractValueVisible && <span className="badge gray">No contract amount on file</span>}</div><span className={`badge ${project.priority.toLowerCase()}`}>{project.priority} priority</span></div>
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
      <SheetTitleBlock page="home" userName="Invitation only" />
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