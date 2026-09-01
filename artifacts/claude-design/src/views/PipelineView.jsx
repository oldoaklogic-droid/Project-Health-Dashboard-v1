import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { PlusIcon, SearchIcon, CheckIcon, TrashIcon } from "../icons";
import { useActiveIntake } from "../hooks/use-active-intake";
import { useDebounce } from "../hooks/use-debounce";
import { EstimatingInner } from "./EstimatingView";

function Blueprint({ children, className = "" }) {
  return <section className={`blueprint ${className}`}>{children}</section>;
}

export function PipelineView({ onNavigate }) {
  const [view, setView] = useState("leads");
  
  return (
    <div className="content fade-in" data-testid="pipeline-view">
      <div className="page-header">
        <span className="overline">Pipeline</span>
        <h2>A clear path from lead to project</h2>
        <p className="muted">A shared operating view for business development and project activation.</p>
      </div>
      
      <nav className="tabs" aria-label="Pipeline views">
        <button className={view === "leads" ? "active" : ""} onClick={() => setView("leads")} data-testid="tab-leads">Leads</button>
        <button className={view === "intake" ? "active" : ""} onClick={() => setView("intake")} data-testid="tab-intake">Intake</button>
        <button className={view === "projects" ? "active" : ""} onClick={() => setView("projects")} data-testid="tab-projects">Projects</button>
      </nav>
      
      <div className="reports-content pt-6 pb-6">
        {view === "leads" && <LeadsView setView={setView} />}
        {view === "intake" && <IntakesView onNavigate={onNavigate} />}
        {view === "projects" && <LocalProjectsView />}
      </div>
    </div>
  );
}

function LeadsView({ setView }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [, setActiveIntakeId] = useActiveIntake();

  const [who, setWho] = useState("");
  const [what, setWhat] = useState("");
  const [where, setWhere] = useState("");
  const [source, setSource] = useState("");
  const [spotter, setSpotter] = useState("");

  const loadLeads = async () => {
    try {
      const res = await fetch("/api/leads", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load leads");
      setLeads(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadLeads(); }, []);

  const handleAddLead = async (e) => {
    e.preventDefault();
    if (!who || !what || !where || !source || !spotter) return;
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ who, what, where, source, spotter, status: "New" })
      });
      if (res.ok) {
        setWho(""); setWhat(""); setWhere(""); setSource(""); setSpotter("");
        loadLeads();
      }
    } catch (err) {
      alert("Failed to create lead");
    }
  };

  const handleUpdateStatus = async (id, status) => {
    try {
      await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status })
      });
      loadLeads();
    } catch (err) {
      alert("Failed to update status");
    }
  };

  const handleStartIntake = async (lead) => {
    try {
      const res = await fetch("/api/intakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ 
          leadId: lead.id, 
          client: lead.who, 
          answers: { leadNotes: lead.what }, 
          disciplines: [], 
          drivers: {}, 
          stepFlags: {}, 
          pmByDiscipline: {}, 
          overrides: {},
          paymentTerms: "Net 15"
        })
      });
      if (res.ok) {
        const intake = await res.json();
        setActiveIntakeId(intake.id);
        setView("intake");
      }
    } catch (err) {
      alert("Failed to start intake");
    }
  };

  if (loading) return <div>Loading leads...</div>;
  if (error) return <div className="notice error">{error}</div>;

  return (
    <div>
      <div className="section-heading mb-3">
        <h3>Leads</h3>
      </div>
      
      <form onSubmit={handleAddLead} className="border p-4 bg-gray-50 mb-6 form-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr auto", alignItems: "end" }}>
        <label><span>Who</span><input value={who} onChange={e => setWho(e.target.value)} required data-testid="input-lead-who" /></label>
        <label><span>What</span><input value={what} onChange={e => setWhat(e.target.value)} required data-testid="input-lead-what" /></label>
        <label><span>Where</span><input value={where} onChange={e => setWhere(e.target.value)} required data-testid="input-lead-where" /></label>
        <label><span>Source</span><input value={source} onChange={e => setSource(e.target.value)} required data-testid="input-lead-source" /></label>
        <label><span>Spotter</span><input value={spotter} onChange={e => setSpotter(e.target.value)} required data-testid="input-lead-spotter" /></label>
        <button type="submit" className="primary" data-testid="button-new-lead"><PlusIcon /> Add</button>
      </form>

      <div className="table-wrap mt-0">
        <table>
          <thead>
            <tr>
              <th>Who</th>
              <th>What</th>
              <th>Where</th>
              <th>Source</th>
              <th>Spotter</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {leads.map(lead => (
              <tr key={lead.id} data-testid={`row-lead-${lead.id}`}>
                <td><strong>{lead.who}</strong></td>
                <td className="break-word" style={{ maxWidth: 200 }}>{lead.what}</td>
                <td>{lead.where}</td>
                <td>{lead.source}</td>
                <td>{lead.spotter}</td>
                <td>
                  <select className="mappings-select" value={lead.status || "New"} onChange={(e) => handleUpdateStatus(lead.id, e.target.value)} data-testid={`select-lead-status-${lead.id}`}>
                    <option value="New">New</option>
                    <option value="Moved to Intake">Moved to Intake</option>
                    <option value="Dropped">Dropped</option>
                  </select>
                </td>
                <td>{new Date(lead.createdAt).toLocaleDateString()}</td>
                <td>
                  {lead.status !== "Moved to Intake" && (
                    <button className="secondary" onClick={() => handleStartIntake(lead)} data-testid={`button-start-intake-${lead.id}`}>Start Intake</button>
                  )}
                </td>
              </tr>
            ))}
            {leads.length === 0 && <tr><td colSpan="8" className="text-center muted">No leads found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IntakesView({ onNavigate }) {
  const [intakes, setIntakes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeIntakeId, setActiveIntakeId] = useActiveIntake();

  const loadIntakes = async () => {
    try {
      const res = await fetch("/api/intakes", { credentials: "include" });
      if (res.ok) setIntakes(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadIntakes(); }, []);
  
  const activeIntake = intakes.find(i => i.id === activeIntakeId);

  return (
    <div>
      <div className="mb-6 form-grid" style={{ gridTemplateColumns: "300px" }}>
        <label><span>Active Intake</span>
          <select className="border p-2 bg-white" value={activeIntakeId || ""} onChange={e => setActiveIntakeId(e.target.value)} data-testid="select-active-intake">
            <option value="">Select an intake...</option>
            {intakes.map(i => (
              <option key={i.id} value={i.id}>{i.client} - {i.primaryRequest || "New"}</option>
            ))}
          </select>
        </label>
      </div>

      {activeIntake ? (
        <ActiveIntake
          key={activeIntake.id}
          intake={activeIntake}
          onChange={loadIntakes}
          onSaved={(saved) => setIntakes((current) => current.map((item) => item.id === saved.id ? saved : item))}
          onNavigate={onNavigate}
        />
      ) : (
        <div className="placeholder-panel flex-center p-6 border bg-white col-span-3">
          <p className="muted">Select an intake above to view details.</p>
        </div>
      )}
    </div>
  );
}

function ActiveIntake({ intake, onChange, onSaved, onNavigate }) {
  const [tree, setTree] = useState([]);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [dismissedDisciplines, setDismissedDisciplines] = useState([]);
  
  useEffect(() => {
    fetch("/api/question-tree", { credentials: "include" })
      .then(res => res.json())
      .then(data => setTree(data))
      .catch(console.error);
  }, []);

  const [localIntake, setLocalIntake] = useState(intake);
  const [saveStatus, setSaveStatus] = useState("Saved");
  const [refreshCounter, setRefreshCounter] = useState(0);
  const saveTimer = useRef(null);
  const estimateRefreshTimer = useRef(null);
  const pendingSave = useRef({});

  const patchIntake = useCallback(async (updates) => {
    setSaveStatus("Saving...");
    try {
      const response = await fetch(`/api/intakes/${intake.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates)
      });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || "Autosave failed");
      const saved = await response.json();
      setSaveStatus("Saved");
      onSaved?.(saved);
      if (["disciplines", "drivers", "stepFlags", "overrides"].some((key) => Object.prototype.hasOwnProperty.call(updates, key))) {
        if (estimateRefreshTimer.current) clearTimeout(estimateRefreshTimer.current);
        estimateRefreshTimer.current = setTimeout(() => setRefreshCounter(c => c + 1), 250);
      }
    } catch (err) {
      console.error(err);
      setSaveStatus("Error");
    }
  }, [intake.id, onSaved]);

  const handleUpdate = (updates, immediate = false) => {
    setLocalIntake(prev => ({ ...prev, ...updates }));
    pendingSave.current = { ...pendingSave.current, ...updates };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (immediate) {
      const pending = pendingSave.current;
      pendingSave.current = {};
      patchIntake(pending);
    } else {
      setSaveStatus("Saving...");
      saveTimer.current = setTimeout(() => {
        const pending = pendingSave.current;
        pendingSave.current = {};
        patchIntake(pending);
      }, 600);
    }
  };

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (estimateRefreshTimer.current) clearTimeout(estimateRefreshTimer.current);
    const pending = pendingSave.current;
    pendingSave.current = {};
    if (Object.keys(pending).length) {
      fetch(`/api/intakes/${intake.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        keepalive: true,
        body: JSON.stringify(pending),
      }).catch(() => {});
    }
  }, [intake.id]);

  const isLocked = !!localIntake.estimateApprovedAt;

  const sections = [
    { title: "1. Who and where", id: "who" },
    { title: "2. Primary request", id: "request" },
    { title: "3. Property plans", id: "plans" },
    { title: "4. Discipline questions", id: "disciplines" },
    { title: "5. Contract and timing", id: "contract" },
  ];

  return (
    <div className="three-panel-workflow">
      {/* Panel 1: Guided Conversation */}
      <div className="panel bg-white flex flex-col justify-between" data-testid="panel-guided">
        <div>
          <h3 className="mb-4">{sections[sectionIndex].title}</h3>
          <GuidedSection 
            sectionId={sections[sectionIndex].id} 
            form={localIntake} 
            tree={tree} 
            onUpdate={handleUpdate} 
            isLocked={isLocked}
          />
        </div>
        <div className="flex justify-between mt-6 pt-4 border-t">
           <button className="secondary" disabled={sectionIndex === 0} onClick={() => setSectionIndex(i => i - 1)} data-testid="button-intake-back">Back</button>
           <button className="primary" disabled={sectionIndex === sections.length - 1} onClick={() => setSectionIndex(i => i + 1)} data-testid="button-intake-next">Next</button>
        </div>
      </div>

      {/* Panel 2: Center Intake Sheet */}
      <div className="panel middle-panel relative bg-gray-50" data-testid="panel-sheet">
         <div className="flex justify-between items-center mb-4 pb-2 border-b">
           <h3>Intake Sheet</h3>
           <span className={`text-xs font-bold uppercase ${saveStatus === "Error" ? "text-red-600" : saveStatus === "Saving..." ? "text-blue-600" : "text-green-700"}`}>{saveStatus}</span>
         </div>
         <div className={isLocked ? "opacity-60 pointer-events-none" : ""}>
           <ClientInfo form={localIntake} onUpdate={(u) => handleUpdate(u, false)} />
           <ScopeQuestions form={localIntake} tree={tree} onUpdate={(u) => handleUpdate(u, true)} />
           <ContractTiming form={localIntake} onUpdate={(u) => handleUpdate(u, false)} />
         </div>
         {isLocked && <div className="absolute top-0 left-0 w-full h-full z-10 flex-center" style={{background:"rgba(255,255,255,0.5)"}}><span className="badge high bg-white p-2 text-lg shadow">LOCKED</span></div>}
      </div>

      {/* Panel 3: Right Estimate */}
      <div className="panel right-panel p-0 bg-white" data-testid="panel-estimate">
         
         {(() => {
           if (isLocked) return null;
           
           let suggestions = [];
           const q = tree.find(q => q.mapsTo?.field === "propertyPlans");
            if (localIntake.propertyPlans && q) {
              const opt = q.options.find(o => o.label === localIntake.propertyPlans);
             if (opt && opt.mapsTo) {
               opt.mapsTo.forEach(mapped => {
                   const canon = canonicalSuggestedDiscipline(mapped);
                   if (!canon) return;
                   if (!localIntake.disciplines?.includes(canon) && !dismissedDisciplines.includes(canon) && !suggestions.includes(canon)) {
                    suggestions.push(canon);
                  }
               });
             }
           }
            if (localIntake.primaryRequest) {
               const pr = localIntake.primaryRequest;
               const pushMap = (cond, canon) => { if (cond && !localIntake.disciplines?.includes(canon) && !dismissedDisciplines.includes(canon) && !suggestions.includes(canon)) suggestions.push(canon); };
              pushMap(/boundary/i.test(pr), "Boundary Survey");
              pushMap(/short plat/i.test(pr) || /lot split/i.test(pr), "Short Plat");
              pushMap(/topographic/i.test(pr), "Topographic Survey");
              pushMap(/alta/i.test(pr), "ALTA Survey");
              pushMap(/civil/i.test(pr) || /site plan/i.test(pr), "Civil Engineering");
              pushMap(/planning/i.test(pr), "Planning");
              pushMap(/architect/i.test(pr), "Architecture");
              pushMap(/struct/i.test(pr), "Structural");
              pushMap(/landscape/i.test(pr), "Landscape");
              pushMap(/interior/i.test(pr), "Interior");
           }
           
           if (suggestions.length === 0) return null;
           
           return (
             <div className="p-4 bg-blue-50 border-b">
               {suggestions.map(canon => (
                  <div key={canon} className="flex flex-col bg-white p-3 border mb-2 shadow-sm">
                     <span className="text-sm font-semibold mb-2">Add {canon} to this project?</span>
                     <div className="flex gap-2">
                        <button className="primary p-1 px-4 text-xs" onClick={() => handleUpdate({ disciplines: [...(localIntake.disciplines || []), canon] }, true)}>Yes</button>
                       <button className="secondary p-1 px-4 text-xs" onClick={() => setDismissedDisciplines(prev => [...prev, canon])}>No</button>
                     </div>
                  </div>
               ))}
             </div>
           );
         })()}

          <EstimatingInner
            activeIntakeId={intake.id}
            isPipelineView={true}
            onNavigate={onNavigate}
            refreshCounter={refreshCounter}
            onIntakeChanged={() => {
              setLocalIntake((current) => ({ ...current, estimateApprovedAt: new Date().toISOString() }));
              onChange();
            }}
          />
      </div>
    </div>
  );
}

function getAnswerValue(form, mapsToObj) {
  if (mapsToObj.field) return form[mapsToObj.field];
  if (mapsToObj.answer) return form.answers?.[mapsToObj.answer];
  if (mapsToObj.driver) return form.drivers?.[mapsToObj.driver];
  if (mapsToObj.stepFlag) return form.stepFlags?.[mapsToObj.stepFlag];
  return "";
}

function handleAnswerHelper(mapsToObj, value, form, onUpdate) {
  let drivers = { ...form.drivers };
  let stepFlags = { ...form.stepFlags };
  let answers = { ...form.answers };
  
  if (mapsToObj.field) {
    if (mapsToObj.field === "primaryRequest") {
      const discipline = primaryRequestDiscipline(value);
      const disciplines = discipline && !form.disciplines?.includes(discipline)
        ? [...(form.disciplines || []), discipline]
        : (form.disciplines || []);
      onUpdate({ primaryRequest: value, disciplines }, true);
    } else {
      onUpdate({ [mapsToObj.field]: value }, true);
    }
    return;
  }
  
  if (mapsToObj.answer) answers[mapsToObj.answer] = value;
  if (mapsToObj.driver) drivers[mapsToObj.driver] = Number(value);
  if (mapsToObj.stepFlag) stepFlags[mapsToObj.stepFlag] = Boolean(value);
  
  onUpdate({ answers, drivers, stepFlags });
}

function primaryRequestDiscipline(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("boundary")) return "Boundary Survey";
  if (normalized.includes("short plat") || normalized.includes("lot split")) return "Short Plat";
  if (normalized.includes("topographic")) return "Topographic Survey";
  if (normalized.includes("alta")) return "ALTA Survey";
  if (normalized.includes("civil") || normalized.includes("site plan")) return "Civil Engineering";
  if (normalized.includes("planning")) return "Planning";
  if (normalized.includes("architecture")) return "Architecture";
  if (normalized.includes("landscape")) return "Landscape";
  if (normalized.includes("interior")) return "Interior";
  if (normalized.includes("structural")) return "Structural";
  return null;
}

function canonicalSuggestedDiscipline(value) {
  const aliases = {
    Topo: "Topographic Survey",
    Boundary: "Boundary Survey",
    ALTA: "ALTA Survey",
    Civil: "Civil Engineering",
    "Site plan": "Civil Engineering",
    "Short plat": "Short Plat",
    Planning: "Planning",
    Architecture: "Architecture",
    Structural: "Structural",
    Landscape: "Landscape",
    Interior: "Interior",
  };
  return aliases[value] || null;
}

function GuidedSection({ sectionId, form, tree, onUpdate, isLocked }) {
  if (isLocked) return <p className="muted">This intake is locked. Estimate has been approved.</p>;

  const handleAnswer = (mapsToObj, value, type) => {
    handleAnswerHelper(mapsToObj, value, form, onUpdate);
  };

  const renderQuestion = (q) => (
    <div key={q.prompt} className="mb-4 p-3 border bg-gray-50">
       <p className="font-semibold text-sm mb-2">{q.prompt}</p>
       {q.answerType === "yes-no" && (
         <div className="flex gap-4">
           <label className="check"><input type="radio" checked={getAnswerValue(form, q.mapsTo) === true} onChange={() => handleAnswer(q.mapsTo, true, "boolean")} /> <span>Yes</span></label>
           <label className="check"><input type="radio" checked={getAnswerValue(form, q.mapsTo) === false} onChange={() => handleAnswer(q.mapsTo, false, "boolean")} /> <span>No</span></label>
         </div>
       )}
       {q.answerType === "number" && (
         <input type="number" className="w-full p-2 border bg-white" value={getAnswerValue(form, q.mapsTo) || ""} onChange={e => handleAnswer(q.mapsTo, e.target.value, "number")} />
       )}
       {q.answerType === "text" && (
         <input type="text" className="w-full p-2 border bg-white" value={getAnswerValue(form, q.mapsTo) || ""} onChange={e => handleAnswer(q.mapsTo, e.target.value, "text")} />
       )}
       {q.answerType === "single-select" && (
         <select className="w-full p-2 border bg-white" value={getAnswerValue(form, q.mapsTo) || ""} onChange={e => handleAnswer(q.mapsTo, e.target.value, "string")}>
            <option value="">Select...</option>
            {q.options?.map(o => {
               const label = typeof o === "string" ? o : o.label;
               return <option key={label} value={label}>{label}</option>
            })}
         </select>
       )}
       {q.answerType === "multi-select" && (
         <div className="flex flex-col gap-2">
            {q.options?.map(o => {
               const label = typeof o === "string" ? o : o.label;
               const currentArr = getAnswerValue(form, q.mapsTo) || [];
               return (
                 <label key={label} className="check">
                   <input type="checkbox" checked={currentArr.includes(label)} onChange={e => {
                      const next = e.target.checked ? [...currentArr, label] : currentArr.filter(x => x !== label);
                      handleAnswer(q.mapsTo, next, "multi");
                   }} />
                   <span>{label}</span>
                 </label>
               );
            })}
         </div>
       )}
    </div>
  );

  if (sectionId === "who") {
    return (
      <div className="flex flex-col gap-3">
        <label><span>Client Name</span><input className="w-full p-2 border" value={form.client || ""} onChange={e => onUpdate({ client: e.target.value })} /></label>
        <label><span>Contact</span><input className="w-full p-2 border" value={form.contact || ""} onChange={e => onUpdate({ contact: e.target.value })} /></label>
        <label><span>Phone</span><input className="w-full p-2 border" value={form.phone || ""} onChange={e => onUpdate({ phone: e.target.value })} /></label>
        <label><span>Email</span><input className="w-full p-2 border" value={form.email || ""} onChange={e => onUpdate({ email: e.target.value })} /></label>
        <label><span>Property Address</span><input className="w-full p-2 border" value={form.address || ""} onChange={e => onUpdate({ address: e.target.value })} /></label>
        <label><span>Parcel</span><input className="w-full p-2 border" value={form.parcel || ""} onChange={e => onUpdate({ parcel: e.target.value })} /></label>
        <label><span>Referral Source</span><input className="w-full p-2 border" value={form.referralSource || ""} onChange={e => onUpdate({ referralSource: e.target.value })} /></label>
      </div>
    );
  }

  if (sectionId === "request") {
    const q = tree.find(q => q.mapsTo?.field === "primaryRequest");
    return <div>{q && renderQuestion(q)}</div>;
  }

  if (sectionId === "plans") {
    const q = tree.find(q => q.mapsTo?.field === "propertyPlans");
    return (
      <div>
        <div className="read-aloud-prompt" data-testid="prompt-property-plans">
          Ask the client: what are your plans for the property?
        </div>
        {q && renderQuestion(q)}
        {form.propertyPlans && (
          <div className="notice mt-4" data-testid="property-plan-follow-up">
            <strong>Follow up:</strong> Ask about the intended timing, known site constraints, and what decisions the client needs this work to support.
          </div>
        )}
      </div>
    );
  }

  if (sectionId === "disciplines") {
    const questions = tree.filter(q => {
      if (!q.discipline) return false;
      if (q.discipline === "Survey") {
        return form.disciplines?.some(d => d.includes("Survey") || d === "Short Plat");
      }
      return form.disciplines?.includes(q.discipline);
    });
    return (
      <div>
        {questions.length === 0 ? <p className="muted">Select property plans or disciplines first to reveal questions.</p> : questions.map(renderQuestion)}
      </div>
    );
  }

  if (sectionId === "contract") {
    return (
      <div className="flex flex-col gap-3">
        <div className="col-span-2">
           <h4 className="font-semibold mb-2">Project Managers</h4>
           {(!form.disciplines || form.disciplines.length === 0) ? (
             <p className="text-sm text-gray-500">Add disciplines to assign PMs.</p>
           ) : (
             <div className="flex flex-col gap-2">
               {form.disciplines.map(d => (
                 <label key={d} className="flex items-center gap-4">
                   <span className="w-40 text-sm font-semibold">{d}</span>
                   <input className="flex-1 p-2 border bg-white" placeholder="PM Name" value={form.pmByDiscipline?.[d] || ""} onChange={e => {
                     const newPm = { ...(form.pmByDiscipline || {}), [d]: e.target.value };
                     onUpdate({ pmByDiscipline: newPm });
                   }} />
                 </label>
               ))}
             </div>
           )}
        </div>

        <label><span>Contract Type</span>
           <select className="w-full p-2 border bg-white" value={form.contractType || ""} onChange={e => onUpdate({ contractType: e.target.value })}>
             <option value="">Select...</option>
             <option value="Fixed Fee">Fixed Fee</option>
             <option value="Time & Materials">Time & Materials</option>
           </select>
        </label>
        <label><span>Payment Terms</span>
           <select className="w-full p-2 border bg-white" value={form.paymentTerms || ""} onChange={e => onUpdate({ paymentTerms: e.target.value })}>
             <option value="">Select...</option>
              <option value="Net 15">Net 15</option>
             <option value="Net 30">Net 30</option>
             <option value="Due on Receipt">Due on Receipt</option>
           </select>
        </label>
        <label><span>Start Date</span><input type="date" className="w-full p-2 border bg-white" value={form.startDate || ""} onChange={e => onUpdate({ startDate: e.target.value })} /></label>
        <label><span>Target Completion</span><input type="date" className="w-full p-2 border bg-white" value={form.targetCompletion || ""} onChange={e => onUpdate({ targetCompletion: e.target.value })} /></label>
      </div>
    );
  }

  return null;
}

// Center Panel Components
function ClientInfo({ form, onUpdate }) {
  const [clientQuery, setClientQuery] = useState(form.client || "");
  const [clientResults, setClientResults] = useState([]);
  
  const searchBqe = async (q) => {
    if (!q) {
      setClientResults([]);
      return;
    }
    try {
      const res = await fetch(`/api/bqe/clients/search?q=${encodeURIComponent(q)}`, { credentials: "include" });
      if (res.ok) setClientResults(await res.json());
    } catch (e) { }
  };
  
  const debouncedQ = useDebounce(clientQuery, 300);
  useEffect(() => { searchBqe(debouncedQ); }, [debouncedQ]);

  const selectClient = (name, bqeClientId) => {
    setClientQuery(name);
    setClientResults([]);
    onUpdate({ 
      client: name, 
      answers: { ...form.answers, bqeClientId, clientStatus: bqeClientId ? 'existing' : 'new' }
    });
  };

  const handleBlur = () => {
    if (clientQuery !== form.client) {
      onUpdate({ 
        client: clientQuery, 
        answers: { ...form.answers, clientStatus: 'new' }
      });
    }
  };

  return (
    <div className="mb-6 p-4 border bg-white">
      <h3 className="mb-3">Client & Request</h3>
      <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="col-span-2 relative">
          <label><span>Client Name (BQE Search)</span>
            <input className="w-full p-2 border" value={clientQuery} onChange={e => setClientQuery(e.target.value)} onBlur={handleBlur} />
          </label>
          {clientResults.length > 0 && (
            <div className="autocomplete-dropdown absolute w-full bg-white border shadow mt-1 z-10 max-h-64 overflow-auto">
              {clientResults.map((c, i) => (
                <div key={i} className="p-2 hover:bg-gray-100 cursor-pointer text-sm" onMouseDown={(event) => { event.preventDefault(); selectClient(c.name, c.bqeClientId); }}>
                  {c.name} <span className="text-xs text-gray-500">({c.bqeClientId})</span>
                </div>
              ))}
            </div>
          )}
          {form.answers?.clientStatus && (
            <span className={`text-xs mt-1 block ${form.answers.clientStatus === 'existing' ? 'text-green-700' : 'text-blue-600'}`}>
              Status: {form.answers.clientStatus} client
            </span>
          )}
        </div>
        <label><span>Contact Name</span><input className="w-full p-2 border" value={form.contact || ""} onChange={e => onUpdate({ contact: e.target.value })} /></label>
        <label><span>Phone</span><input className="w-full p-2 border" value={form.phone || ""} onChange={e => onUpdate({ phone: e.target.value })} /></label>
        <label><span>Email</span><input className="w-full p-2 border" value={form.email || ""} onChange={e => onUpdate({ email: e.target.value })} /></label>
        <label><span>Parcel</span><input className="w-full p-2 border" value={form.parcel || ""} onChange={e => onUpdate({ parcel: e.target.value })} /></label>
        <label><span>Referral Source</span><input className="w-full p-2 border" value={form.referralSource || ""} onChange={e => onUpdate({ referralSource: e.target.value })} /></label>
        <label className="col-span-2"><span>Property Address</span><input className="w-full p-2 border" value={form.address || ""} onChange={e => onUpdate({ address: e.target.value })} /></label>
      </div>
    </div>
  );
}

function ScopeQuestions({ form, tree, onUpdate }) {
  const setAnswer = (question, value) => handleAnswerHelper(question.mapsTo, value, form, onUpdate);
  const renderEditableValue = (question) => {
    const value = getAnswerValue(form, question.mapsTo);
    if (question.answerType === "yes-no") {
      return (
        <select value={value === true ? "yes" : value === false ? "no" : ""} onChange={(event) => setAnswer(question, event.target.value === "yes")} data-testid={`sheet-question-${question.id}`}>
          <option value="">Select...</option><option value="yes">Yes</option><option value="no">No</option>
        </select>
      );
    }
    if (question.answerType === "single-select") {
      return (
        <select value={value || ""} onChange={(event) => setAnswer(question, event.target.value)} data-testid={`sheet-question-${question.id}`}>
          <option value="">Select...</option>
          {question.options?.map((option) => {
            const label = typeof option === "string" ? option : option.label;
            return <option value={label} key={label}>{label}</option>;
          })}
        </select>
      );
    }
    if (question.answerType === "multi-select") {
      const selected = Array.isArray(value) ? value : [];
      return (
        <div className="flex flex-wrap gap-2">
          {question.options?.map((option) => {
            const label = typeof option === "string" ? option : option.label;
            return <label className="check" key={label}><input type="checkbox" checked={selected.includes(label)} onChange={(event) => setAnswer(question, event.target.checked ? [...selected, label] : selected.filter((item) => item !== label))} /><span>{label}</span></label>;
          })}
        </div>
      );
    }
    return <input type={question.answerType === "number" ? "number" : "text"} value={value ?? ""} onChange={(event) => setAnswer(question, event.target.value)} data-testid={`sheet-question-${question.id}`} />;
  };

  return (
    <div className="mb-6 p-4 border bg-white">
      <h3 className="mb-3">Scope & Discovery</h3>
      <div className="mb-4">
        <label><span>Active Disciplines</span>
           <div className="flex gap-2 mt-2 flex-wrap">
              {["Planning", "Architecture", "Structural", "Landscape", "Interior", "Boundary Survey", "Short Plat", "Topographic Survey", "ALTA Survey", "Civil Engineering"].map(disc => {
                 const isActive = form.disciplines?.includes(disc);
                 return (
                   <button key={disc} className={`badge ${isActive ? "high" : "bg-gray-100"}`} onClick={() => {
                      let newD = isActive ? form.disciplines.filter(d => d !== disc) : [...(form.disciplines || []), disc];
                      onUpdate({ disciplines: newD });
                   }}>
                     {disc}
                   </button>
                 );
              })}
           </div>
        </label>
      </div>
      <div className="tree-questions">
         {tree.map((q, i) => {
            const isRelevant = !q.discipline || form.disciplines?.includes(q.discipline) || (q.discipline === "Survey" && form.disciplines?.some(d => d.includes("Survey") || d === "Short Plat"));
            if (!isRelevant) return null;
            return (
              <div key={i} className="mb-2 pb-2 border-b">
                 <p className="text-sm font-semibold">{q.prompt}</p>
                 {renderEditableValue(q)}
              </div>
            );
         })}
      </div>
    </div>
  );
}

function ContractTiming({ form, onUpdate }) {
  return (
    <div className="mb-6 p-4 border bg-white">
      <h3 className="mb-3">Contract & Timing</h3>
      <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="col-span-2">
           <h4 className="font-semibold mb-2">Project Managers</h4>
           {(!form.disciplines || form.disciplines.length === 0) ? (
             <p className="text-sm text-gray-500">Add disciplines to assign PMs.</p>
           ) : (
             <div className="flex flex-col gap-2">
               {form.disciplines.map(d => (
                 <label key={d} className="flex items-center gap-4">
                   <span className="w-40 text-sm font-semibold">{d}</span>
                   <input className="flex-1 p-2 border bg-white" placeholder="PM Name" value={form.pmByDiscipline?.[d] || ""} onChange={e => {
                     const newPm = { ...(form.pmByDiscipline || {}), [d]: e.target.value };
                     onUpdate({ pmByDiscipline: newPm });
                   }} />
                 </label>
               ))}
             </div>
           )}
        </div>

        <label><span>Contract Type</span>
           <select className="w-full p-2 border" value={form.contractType || ""} onChange={e => onUpdate({ contractType: e.target.value })}>
             <option value="">Select...</option>
             <option value="Fixed Fee">Fixed Fee</option>
             <option value="Time & Materials">Time & Materials</option>
           </select>
        </label>
        <label><span>Payment Terms</span>
           <select className="w-full p-2 border" value={form.paymentTerms || ""} onChange={e => onUpdate({ paymentTerms: e.target.value })}>
             <option value="">Select...</option>
             <option value="Net 30">Net 30</option>
             <option value="Due on Receipt">Due on Receipt</option>
           </select>
        </label>
        <label><span>Start Date</span><input className="w-full p-2 border" type="date" value={form.startDate || ""} onChange={e => onUpdate({ startDate: e.target.value })} /></label>
        <label><span>Target Completion</span><input className="w-full p-2 border" type="date" value={form.targetCompletion || ""} onChange={e => onUpdate({ targetCompletion: e.target.value })} /></label>
      </div>
    </div>
  );
}

// Local Projects View

export function LocalProjectsView() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeProjectId, setActiveProjectId] = useState(null);

  const loadProjects = async () => {
    try {
      const res = await fetch("/api/local-projects", { credentials: "include" });
      if (res.ok) setProjects(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProjects(); }, []);

  const activeProject = projects.find(p => p.id === activeProjectId);

  return (
    <div>
      <div className="table-wrap mt-0 mb-6">
        <table data-testid="table-local-projects">
          <thead><tr><th>Number</th><th>Name</th><th>Client</th><th>PM</th><th>Disciplines</th><th>Approved hours</th><th>Fee</th><th>Status</th></tr></thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.id} onClick={() => setActiveProjectId(project.id)} className={activeProjectId === project.id ? "selected-row" : ""} data-testid={`row-local-project-${project.id}`}>
                <td><button className="text-button" onClick={() => setActiveProjectId(project.id)}>{project.projectNumber}</button></td>
                <td>{project.name}</td><td>{project.client}</td><td>{project.pm}</td>
                <td>{project.disciplines?.join(", ")}</td><td>{project.approvedHours}</td>
                <td>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(project.fee || 0))}</td><td>{project.status}</td>
              </tr>
            ))}
            {projects.length === 0 && !loading && <tr><td colSpan="8" className="text-center muted">No local projects found.</td></tr>}
          </tbody>
        </table>
      </div>
      {activeProject ? <ActiveLocalProject key={activeProject.id} project={activeProject} onChange={loadProjects} /> : <div className="panel placeholder-panel flex-center"><p className="muted">Select a project to open its workspace.</p></div>}
    </div>
  );
}

function ActiveLocalProject({ project, onChange }) {
  const [activeTab, setActiveTab] = useState("phases");
  const [projectDetails, setProjectDetails] = useState(null);
  
  const loadDetails = useCallback(async () => {
    try {
      const res = await fetch(`/api/local-projects/${project.id}`, { credentials: "include" });
      if (res.ok) setProjectDetails(await res.json());
    } catch (e) {}
  }, [project.id]);
  
  useEffect(() => { loadDetails(); }, [loadDetails]);

  if (!projectDetails) return <div className="panel">Loading project workspace...</div>;

  return (
    <div className="panel middle-panel" style={{ padding: 0 }}>
      <div className="p-6 border-b bg-gray-50">
        <h2 className="text-xl font-bold mb-1">{project.projectNumber} — {project.name}</h2>
        <p className="text-sm text-gray-500">{project.client} | PM: {project.pm}</p>
      </div>
      <nav className="tabs" style={{ padding: "0 24px" }}>
        <button className={activeTab === "phases" ? "active" : ""} onClick={() => setActiveTab("phases")} data-testid="tab-phases">Phases & Activities</button>
        <button className={activeTab === "change-orders" ? "active" : ""} onClick={() => setActiveTab("change-orders")} data-testid="tab-change-orders">Change Orders</button>
        <button className={activeTab === "closeout" ? "active" : ""} onClick={() => setActiveTab("closeout")} data-testid="tab-closeout">Closeout</button>
      </nav>
      <div className="p-6 overflow-auto">
        {activeTab === "phases" && <ProjectPhases project={projectDetails} onChange={() => { loadDetails(); onChange(); }} />}
        {activeTab === "change-orders" && <ProjectChangeOrders project={projectDetails} onChange={loadDetails} />}
        {activeTab === "closeout" && <ProjectCloseout project={projectDetails} onChange={loadDetails} />}
      </div>
    </div>
  );
}

function ProjectPhases({ project, onChange }) {
  const isClosed = project.status === "Closed";
  const activities = Array.isArray(project.activities) ? project.activities : [];
  const updatePhase = async (phaseName, status) => {
    try {
      await fetch(`/api/local-projects/${project.id}/phases`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: phaseName, status })
      });
      onChange();
    } catch (e) {
      alert("Failed to update phase status");
    }
  };

  return (
    <div>
      <h3 className="mb-4">Project Phases</h3>
      {project.phases?.map((phase, i) => (
        <div key={i} className="mb-6 border p-4 bg-white">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-bold text-lg">{phase.name}</h4>
            <select className="border p-2 text-sm bg-white" value={phase.status} data-testid={`select-phase-status-${phase.name.replace(" ", "-").toLowerCase()}`} onChange={e => updatePhase(phase.name, e.target.value)} disabled={isClosed}>
              <option value="Not Started">Not Started</option>
              <option value="In Progress">In Progress</option>
              <option value="Complete">Complete</option>
            </select>
          </div>
          <table className="w-full text-sm text-left border">
             <thead className="bg-gray-50 border-b">
               <tr>
                 <th className="p-2 border-r">Code</th>
                 <th className="p-2 border-r">Activity</th>
                 <th className="p-2">Hours</th>
               </tr>
             </thead>
             <tbody>
               {activities.filter((activity) => activity.phase === phase.name).map(a => (
                 <tr key={a.code} className="border-b">
                   <td className="p-2 font-mono text-gray-500 text-xs border-r">{a.code}</td>
                    <td className="p-2 border-r">{a.desc}</td>
                    <td className="p-2 font-mono">{a.estimatedHours ?? "Pending"}</td>
                 </tr>
               ))}
                {activities.filter((activity) => activity.phase === phase.name).length === 0 && (
                 <tr><td colSpan="3" className="p-2 text-center text-gray-500">No activities recorded.</td></tr>
               )}
             </tbody>
          </table>
        </div>
      ))}
      {(!project.phases || project.phases.length === 0) && <p className="text-gray-500">No phases defined for this project.</p>}
    </div>
  );
}

function ProjectChangeOrders({ project, onChange }) {
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("Client Request");
  const [hours, setHours] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const isClosed = project.status === "Closed";

  const handleAdd = async () => {
    if (!description || !hours) return;
    try {
      await fetch(`/api/local-projects/${project.id}/change-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ description, reason, requestedHours: Number(hours), authorized })
      });
      setDescription("");
      setHours("");
      setAuthorized(false);
      onChange();
    } catch (e) {
      alert("Failed to create change order");
    }
  };

  const handleAuthorize = async (coId, isAuth) => {
    try {
      await fetch(`/api/local-projects/${project.id}/change-orders/${coId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ authorized: isAuth })
      });
      onChange();
    } catch (e) {
      alert("Failed to update change order");
    }
  };

  return (
    <div>
      <h3 className="mb-4">Change Orders</h3>
      <div className="table-wrap mt-0 mb-6 border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2">Description</th>
              <th className="p-2">Reason</th>
              <th className="p-2">Hours</th>
              <th className="p-2">Status</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {project.changeOrders?.map(co => (
              <tr key={co.id} className="border-b bg-white">
                <td className="p-2">{co.description}</td>
                <td className="p-2 text-xs text-gray-500">{co.reason}</td>
                <td className="p-2 font-mono">{co.requestedHours}</td>
                <td className="p-2">
                  <span className={`badge ${co.authorized ? "high bg-green-50 text-green-700 border-green-200" : ""}`}>
                    {co.authorized ? "Authorized" : "Pending"}
                  </span>
                </td>
                <td className="p-2">
                  {!isClosed && (!co.authorized ? (
                    <button className="text-xs secondary p-1" onClick={() => handleAuthorize(co.id, true)} data-testid={`button-authorize-co-${co.id}`}>Authorize</button>
                  ) : (
                    <button className="text-xs p-1 bg-white border text-gray-500 hover:bg-gray-100" onClick={() => handleAuthorize(co.id, false)} data-testid={`button-revoke-co-${co.id}`}>Revoke</button>
                  ))}
                </td>
              </tr>
            ))}
            {(!project.changeOrders || project.changeOrders.length === 0) && (
              <tr><td colSpan="5" className="text-center p-4 text-gray-500 bg-white">No change orders.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {!isClosed && (
        <div className="border p-4 bg-white">
          <h4 className="font-bold mb-3">New Change Order</h4>
          <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <label className="col-span-2"><span>Description</span><input className="border p-2 w-full" value={description} onChange={e => setDescription(e.target.value)} /></label>
            <label><span>Reason</span>
               <select className="border p-2 w-full" value={reason} onChange={e => setReason(e.target.value)}>
                 <option value="Client Request">Client Request</option>
                 <option value="Unforeseen Condition">Unforeseen Condition</option>
                 <option value="Scope Gap">Scope Gap</option>
               </select>
            </label>
            <label><span>Requested Hours</span><input className="border p-2 w-full" type="number" value={hours} onChange={e => setHours(e.target.value)} /></label>
            <label className="check mt-4 col-span-2"><input type="checkbox" checked={authorized} onChange={e => setAuthorized(e.target.checked)} /> <span>Authorize Immediately</span></label>
          </div>
          <button className="primary mt-4" onClick={handleAdd} data-testid="button-add-co"><PlusIcon /> Add Change Order</button>
        </div>
      )}
    </div>
  );
}

function ProjectCloseout({ project, onChange }) {
  const [actualHours, setActualHours] = useState({});
  const [varianceReason, setVarianceReason] = useState("");
  const [varianceNote, setVarianceNote] = useState("");
  
  useEffect(() => {
    if (project.status !== "Closed") {
      const initial = {};
      project.activities?.forEach((activity) => { initial[activity.code] = activity.estimatedHours ?? 0; });
      setActualHours(initial);
    }
  }, [project.activities, project.status]);

  const handleSubmit = async () => {
    try {
      await fetch(`/api/local-projects/${project.id}/closeout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ actualHours, varianceReason, varianceNote })
      });
      onChange();
    } catch (e) {
      alert("Failed to submit closeout");
    }
  };

  if (project.status === "Closed") {
    return (
      <div>
        <h3 className="mb-4 text-green-700">Project Closed</h3>
        <div className="border p-4 bg-green-50 mb-4 text-green-800">
          <p>This project has been closed out. Variances are locked.</p>
          <p className="mt-2 text-sm"><strong>Reason:</strong> {project.closeout?.varianceReason}</p>
          <p className="text-sm"><strong>Note:</strong> {project.closeout?.varianceNote}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-4">Project Closeout</h3>
      <p className="mb-4 text-sm text-gray-500">Record final actual hours per activity and document variance before closing the project.</p>
      
      <div className="mb-6">
        <h4 className="font-bold mb-3">Actual Hours</h4>
        <table className="w-full text-sm text-left border bg-white">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-2 border-r">Code</th>
              <th className="p-2 border-r">Activity</th>
              <th className="p-2 border-r text-right">Estimated</th>
              <th className="p-2">Actual</th>
            </tr>
          </thead>
          <tbody>
            {project.activities?.map(a => (
              <tr key={a.code} className="border-b">
                <td className="p-2 font-mono text-gray-500 text-xs border-r">{a.code}</td>
                 <td className="p-2 border-r">{a.desc}</td>
                 <td className="p-2 border-r text-right font-mono">{a.estimatedHours ?? "Pending"}</td>
                <td className="p-2">
                  <input type="number" className="border p-1 w-24 bg-white" data-testid={`input-actual-hours-${a.code}`} value={actualHours[a.code] !== undefined ? actualHours[a.code] : ""} onChange={e => setActualHours({...actualHours, [a.code]: Number(e.target.value)})} />
                </td>
              </tr>
             ))}
          </tbody>
        </table>
      </div>

      <div className="border p-4 bg-white mb-4">
        <h4 className="font-bold mb-3">Variance Details</h4>
        <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
          <label><span>Primary Variance Reason</span>
            <select className="border p-2 w-full" value={varianceReason} data-testid="select-variance-reason" onChange={e => setVarianceReason(e.target.value)}>
              <option value="">Select...</option>
              <option value="Beat Estimate">Beat Estimate</option>
              <option value="Missed Estimate">Missed Estimate</option>
              <option value="Scope Creep">Scope Creep</option>
              <option value="Client Delays">Client Delays</option>
            </select>
          </label>
          <label><span>Variance Note</span>
            <textarea className="border p-2 min-h-80 w-full" value={varianceNote} data-testid="textarea-variance-note" onChange={e => setVarianceNote(e.target.value)}></textarea>
          </label>
        </div>
      </div>
      
      <button className="primary" onClick={handleSubmit} data-testid="button-submit-closeout">Submit Closeout</button>
    </div>
  );
}

