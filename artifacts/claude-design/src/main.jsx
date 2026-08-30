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

const tabs = [
  ["exec", "Executive"],
  ["table", "Project table"],
  ["card", "Project card"],
  ["tuesday", "Tuesday review"],
  ["pm", "PM guide"],
  ["homes", "Field homes"],
];

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const percent = (value) => `${Math.round(value)}%`;
const metricValue = (value, formatter = number) => value == null ? "—" : formatter.format(value);
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const clerkAppearance = {
  variables: {
    colorPrimary: "#416180",
    colorForeground: "#1d1f20",
    colorMutedForeground: "#66676c",
    colorBackground: "#f2f2f3",
    colorInput: "#f5f5f8",
    colorInputForeground: "#1d1f20",
    colorDanger: "#943a34",
    colorNeutral: "#b7b7ba",
    fontFamily: "\"Barlow\", system-ui, sans-serif",
    borderRadius: "4px",
  },
  options: {
    logoPlacement: "inside",
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  elements: {
    cardBox: { backgroundColor: "#f2f2f3", border: "1px solid rgba(29,31,32,.16)", borderRadius: "4px", width: "440px", maxWidth: "100%" },
    card: { boxShadow: "none", backgroundColor: "transparent" },
    footer: { boxShadow: "none", backgroundColor: "transparent" },
    headerTitle: { color: "#1d1f20", fontFamily: "\"Barlow Condensed\", system-ui, sans-serif", fontWeight: 600 },
    headerSubtitle: { color: "#66676c" },
    formFieldLabel: { color: "#1d1f20" },
    formButtonPrimary: { backgroundColor: "#416180" },
    footerActionLink: { color: "#416180" },
    footerActionText: { color: "#66676c" },
  },
};

function Blueprint({ children, className = "" }) {
  return <section className={`blueprint ${className}`}><i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />{children}</section>;
}

function DashboardApp() {
  const [data, setData] = useState(null);
  const [access, setAccess] = useState(null);
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

  const projects = data?.projects ?? [];
  const selected = projects.find((project) => project.code === selectedCode) ?? projects[0];
  const filtered = useMemo(() => projects.filter((project) => {
    const searchable = `${project.code} ${project.name} ${project.client}`.toLowerCase();
    return (!query || searchable.includes(query.toLowerCase()))
      && (pmFilter === "All PMs" || project.pm === pmFilter)
      && (priority === "All exceptions" || project.priority === priority);
  }), [projects, query, pmFilter, priority]);

  const openCard = (code) => { setSelectedCode(code); setView("card"); window.scrollTo({ top: 0, behavior: "smooth" }); };
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

  return <div className="app-shell">
    <header className="site-header">
      <div>
        <div className="brand"><span className="brand-mark"><span /></span><span>Complete Design, Inc.</span></div>
        <h1>Project Health Dashboard <b>v1</b></h1>
        <p className="muted intro">Day 30 baseline — the dashboard shows what BQE can prove today and makes missing controls visible. Unknown is a valid result until project planning data is established.</p>
      </div>
      <div className="controlled-source">
        <div className="overline muted">Controlled source</div>
        <strong>PROJECT_HEALTH_V1</strong>
        <div className="muted">Active + on-hold external roots, plus closed with open AR</div>
        <div className="muted small">BQE extract {data?.extractDate ?? "—"} · PM overlay {data?.overlayUpdated ?? "—"}</div>
        <AccountActions />
      </div>
    </header>
    <nav className="tabs" aria-label="Project health views">
      {tabs.map(([key, label]) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}>{label}</button>)}
    </nav>
    {error ? <div className="notice error">{error} <button onClick={loadDashboard}>Try again</button></div> : !data ? <div className="notice">Loading live BQE hours and financials…</div> : <>
      <BqeStatus status={data.bqe} />
      {view === "exec" && <Executive summary={data.summary} projects={projects} bqe={data.bqe} onOpen={openCard} />}
      {view === "table" && <ProjectTable projects={filtered} query={query} setQuery={setQuery} pmFilter={pmFilter} setPmFilter={setPmFilter} priority={priority} setPriority={setPriority} onOpen={openCard} />}
      {view === "card" && <ProjectCard project={selected} projects={projects} onSelect={setSelectedCode} onSave={updateProject} canEdit={Boolean(access?.canEdit)} />}
      {view === "tuesday" && <TuesdayReview projects={projects} onOpen={openCard} />}
      {view === "pm" && <PmGuide />}
      {view === "homes" && <FieldHomes />}
    </>}
    <footer>Complete Design, Inc. · Project Health Dashboard v1 · Design and visualization of the controlled Day 30 source (PROJECT_HEALTH_V1). No project health status has been invented; Unknown and blank PM-judgment fields are intentional.</footer>
  </div>;
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
  return <main className="content">
    <div className="metric-grid">
      <Metric label="2026 actual hours" value={metricValue(bqe.reconciliation?.hours ?? bqe.totals.hours)} note="latest BQE reconciliation" accent />
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
      <Blueprint><h2>BQE financial reconciliation</h2><div className="finance-grid">{[["Actual hours", metricValue(bqe.reconciliation?.hours ?? bqe.totals.hours)], ["Budget hours", metricValue(bqe.totals.budgetHours)], ["Invoiced", metricValue(bqe.reconciliation?.invoicedAmount ?? bqe.totals.invoicedAmount, money)], ["Paid", metricValue(bqe.reconciliation?.paidAmount ?? bqe.totals.paidAmount, money)]].map(([label, value]) => <div className="finance" key={label}><small className="muted">{label}</small><strong>{value}</strong><span className="muted">{label === "Budget hours" ? "persisted portfolio total" : bqe.reconciliation ? "reconciled 2026 total" : "persisted portfolio total"}</span></div>)}</div><p className="muted small top-rule">Reconciliation totals verify the persisted 2026 pull. Budget hours are summed across persisted BQE budgets because BQE budget rows do not consistently expose a project identifier.</p></Blueprint>
      <Blueprint><h2>Active projects by PM</h2><div className="bars">{Object.entries(summary.byPm).sort((a, b) => b[1] - a[1]).map(([label, count]) => <Bar key={label} label={label} value={count} max={Math.max(...Object.values(summary.byPm))} />)}</div></Blueprint>
    </div>
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
    <div className="evidence-grid bqe-evidence">{[["Actual hours", metricValue(project.actualHours)], ["Budget hours", metricValue(project.budgetHours)], ["Invoiced", metricValue(project.invoicedAmount, money)], ["Paid", metricValue(project.paidAmount, money)], ["Reconciled hours", metricValue(project.reconciliationHours)], ["Reconciled invoiced", metricValue(project.reconciliationInvoicedAmount, money)], ["Reconciled paid", metricValue(project.reconciliationPaidAmount, money)], ["BQE source", project.bqeMatched ? "Matched" : "No project match"]].map(([label, value]) => <div key={label}><small className="muted">{label}</small><strong>{value}</strong></div>)}</div>
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
  return <div className="access-landing">
    <div className="brand"><span className="brand-mark"><span /></span><span>Complete Design, Inc.</span></div>
    <Blueprint className="access-card"><span className="overline muted">Controlled source</span><h1>Project Health Dashboard <b>v1</b></h1><p className="muted">This controlled portfolio view contains client, financial, and PM data. Access is invitation-only.</p><div className="access-actions"><a className="primary" href={`${basePath}/sign-in`}>Sign in</a></div></Blueprint>
  </div>;
}

function AuthPage({ mode }) {
  const signInPath = `${basePath}/sign-in`;
  const signUpPath = `${basePath}/sign-up`;
  return <div className="auth-page">{mode === "sign-up"
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