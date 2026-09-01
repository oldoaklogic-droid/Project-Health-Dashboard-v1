import React, { useState, useEffect, useCallback, useRef } from "react";
import { useActiveIntake } from "../hooks/use-active-intake";

function Blueprint({ children, className = "" }) {
  return <section className={`blueprint ${className}`}>{children}</section>;
}

export function EstimatingView({ onNavigate }) {
  const [activeIntakeId] = useActiveIntake();

  if (!activeIntakeId) {
    return (
      <div className="content fade-in" data-testid="estimating-view">
        <div className="page-header"><span className="overline">Estimating</span><h2>From opportunity to confident fee</h2></div>
        <Blueprint className="empty-state placeholder-panel flex-center py-4 bg-white border p-6 text-center">
           <h2 className="mb-2">No active intake</h2>
           <p className="muted">Please select or start an intake from the Pipeline page to view its estimate.</p>
        </Blueprint>
      </div>
    );
  }

  return (
    <div className="content fade-in" data-testid="estimating-view">
       <EstimatingInner activeIntakeId={activeIntakeId} onNavigate={onNavigate} />
    </div>
  );
}

export function EstimatingInner({ activeIntakeId, isPipelineView, onNavigate, refreshCounter = 0, onIntakeChanged }) {
  const [intake, setIntake] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const [fingerprints, setFingerprints] = useState(null);
  const [loading, setLoading] = useState(true);
  const [overrides, setOverrides] = useState({});
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [overrideError, setOverrideError] = useState("");
  const overrideSavePromise = useRef(Promise.resolve());
  const [approving, setApproving] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [employeeGroupName, setEmployeeGroupName] = useState("");
  const [createLog, setCreateLog] = useState("");

  const loadData = useCallback(async () => {
    if (!activeIntakeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [inRes, estRes, fpRes] = await Promise.all([
        fetch(`/api/intakes`, { credentials: "include" }),
        fetch(`/api/intakes/${activeIntakeId}/estimate`, { credentials: "include" }),
        fetch("/api/estimating/fingerprints", { credentials: "include" })
      ]);
      if (inRes.ok && fpRes.ok) {
        const intakes = await inRes.json();
        const inData = intakes.find(i => i.id === activeIntakeId);
        if (inData) {
          setIntake(inData);
          setOverrides(inData.overrides || {});
        }
        setEstimate(estRes.ok
          ? await estRes.json()
          : { disciplines: [], totalHours: 0, totalFee: 0, rate: 220 });
        setFingerprints(await fpRes.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [activeIntakeId, refreshCounter]);

  useEffect(() => { loadData(); }, [loadData]);

  const patchOverrides = async (newOverrides) => {
    setOverrideSaving(true);
    setOverrideError("");
    const save = async () => {
      const response = await fetch(`/api/intakes/${activeIntakeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ overrides: newOverrides })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Could not save estimate override.");
      }
    };
    const pending = overrideSavePromise.current.then(save, save);
    overrideSavePromise.current = pending;
    try {
      await pending;
    } catch (error) {
      setOverrideError(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      if (overrideSavePromise.current === pending) setOverrideSaving(false);
    }
  };

  const handleOverrideChange = (activityCode, value) => {
    const val = value === "" ? null : Number(value);
    const updated = {
      ...overrides,
      [activityCode]: {
        ...(overrides[activityCode] || {}),
        hours: val
      }
    };
    if (val === null && updated[activityCode]) {
      delete updated[activityCode].hours;
      if (Object.keys(updated[activityCode]).length === 0) {
        delete updated[activityCode];
      }
    }
    setOverrides(updated);
    patchOverrides(updated).catch(() => {});
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      await overrideSavePromise.current;
      const response = await fetch(`/api/intakes/${activeIntakeId}/approve-estimate`, {
        method: "POST",
        credentials: "include"
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Could not approve estimate.");
      }
      await loadData();
      onIntakeChanged?.();
    } catch (e) {
      setOverrideError(e instanceof Error ? e.message : String(e));
    } finally {
      setApproving(false);
    }
  };

  const handleCreateProject = async () => {
    if (!employeeGroupName) {
      setCreateLog("Error: Employee Group Name is required.");
      return;
    }
    try {
      const res = await fetch(`/api/intakes/${activeIntakeId}/create-project?dryRun=${dryRun}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ employeeGroupName })
      });
      const data = await res.json();
      setCreateLog(JSON.stringify(data, null, 2));
      if (!dryRun && res.ok) loadData();
    } catch (e) {
      setCreateLog(String(e));
    }
  };

  if (loading) return <div className="p-6 text-gray-500">Loading estimate...</div>;
  if (!intake || !estimate) return <div className="p-6 text-red-500">Error loading estimate data.</div>;

  const isApproved = !!intake.estimateApprovedAt;

  // Compute adjusted totals
  let adjTotalHours = 0;
  let adjTotalFee = 0;
  const rate = estimate.rate || 220;

  const disciplinesAdj = estimate.disciplines?.map(d => {
    let dAdjHours = 0;
    let dAdjFee = 0;
    
    const isTemplatePending = d.templatePending;

    const phasesAdj = d.phases?.map(p => {
      let pAdjHours = 0;
      let pAdjFee = 0;
      
      const activitiesAdj = p.activities?.map(a => {
        const over = overrides[a.code] || {};
        const calcHours = a.calculatedHours ?? 0;
        const hours = over.hours !== undefined ? over.hours : calcHours;
        const fee = hours * rate;
        pAdjHours += hours;
        pAdjFee += fee;
        return { ...a, adjHours: hours, adjFee: fee, calcHours };
      }) || [];
      
      dAdjHours += pAdjHours;
      dAdjFee += pAdjFee;
      return { ...p, activities: activitiesAdj, adjHours: pAdjHours, adjFee: pAdjFee };
    }) || [];
    
    adjTotalHours += dAdjHours;
    adjTotalFee += dAdjFee;

    // fingerprints
    let fpCount = 0;
    if (fingerprints && d.disciplineKey) {
      const fp = fingerprints[d.disciplineKey];
      if (fp) fpCount = fp.project_count;
    }

    return { ...d, phases: phasesAdj, adjHours: dAdjHours, adjFee: dAdjFee, fpCount, isTemplatePending };
  }) || [];

  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

  const Wrapper = isPipelineView ? "div" : Blueprint;

  return (
    <div className={`h-full flex flex-col ${isPipelineView ? "p-4 bg-gray-50" : ""}`}>
       {!isPipelineView && (
         <div className="page-header mb-6">
           <span className="overline">Estimating</span>
           <h2>{intake.client}</h2>
           <p className="muted">{intake.primaryRequest || "No request specified"}</p>
         </div>
       )}
       
       <div className={`finance-grid mb-6 ${isPipelineView ? "grid-cols-1" : ""}`}>
         <div className="metric bg-white border p-4 shadow-sm flex flex-col justify-center">
           <span className="overline muted">Project Total Hours</span>
           <strong className="accent text-3xl font-bold">{adjTotalHours.toFixed(2)}</strong>
           {adjTotalHours !== estimate.totalHours && <small className="muted text-xs">Baseline: {estimate.totalHours.toFixed(2)}</small>}
         </div>
         <div className="metric bg-white border p-4 shadow-sm flex flex-col justify-center">
           <span className="overline muted">Project Total Fee</span>
           <strong className="accent text-3xl font-bold">{money.format(adjTotalFee)}</strong>
           {adjTotalFee !== estimate.totalFee && <small className="muted text-xs">Baseline: {money.format(estimate.totalFee)}</small>}
         </div>
       </div>

       {disciplinesAdj.length === 0 && <p className="text-gray-500 bg-white p-4 border text-center">No active disciplines.</p>}

       {disciplinesAdj.map(disc => (
          <Wrapper key={disc.disciplineKey || disc.discipline} className={`mb-6 bg-white border ${isPipelineView ? "" : "p-6"}`}>
           <div className={`flex justify-between items-baseline mb-4 border-b ${isPipelineView ? "p-4 pb-2" : "pb-2"}`}>
             <div>
               <h3 className="text-xl font-bold text-gray-800">{disc.discipline}</h3>
               {disc.isTemplatePending ? (
                 <span className="badge high text-xs bg-yellow-50 text-yellow-800 border-yellow-200 mt-1 block w-max">Template pending</span>
               ) : (
                 <span className="text-xs text-gray-500 mt-1 block">Based on {disc.fpCount || 0} similar CDI projects</span>
               )}
             </div>
             <div className="text-right">
                <strong className="text-lg">{disc.adjHours.toFixed(2)} hrs</strong> &nbsp; | &nbsp; <strong className="text-lg text-gray-700">{money.format(disc.adjFee)}</strong>
             </div>
           </div>
           
           {!disc.isTemplatePending && disc.phases?.map(phase => (
             <div key={phase.name} className={`mb-6 ${isPipelineView ? "px-4" : ""}`}>
               <h4 className="font-semibold text-sm mb-2 mt-4 text-gray-700 uppercase tracking-wider">{phase.name}</h4>
               <table className="w-full text-left text-sm border-collapse border">
                 <thead>
                   <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase">
                     <th className="p-2 border-r">Activity</th>
                     <th className="p-2 w-20 border-r">Hours</th>
                     <th className="p-2 w-24">Fee</th>
                   </tr>
                 </thead>
                 <tbody>
                   {phase.activities?.map(act => {
                     const isOverridden = overrides[act.code]?.hours !== undefined;
                     return (
                       <tr key={act.code} className={`border-b ${isOverridden ? "bg-blue-50" : "bg-white"}`}>
                         <td className="p-2 border-r">
                           <div className="font-medium text-gray-800">{act.desc || act.name}</div>
                           <div className="font-mono text-xs text-gray-400 mt-1">{act.code}</div>
                         </td>
                         <td className="p-2 border-r">
                           <div className="flex flex-col gap-1">
                             <input 
                               key={`hours-${act.code}-${overrides[act.code]?.hours !== undefined ? overrides[act.code].hours : act.calcHours}`}
                               type="number" 
                               className={`border p-1 w-full text-right font-mono ${isApproved ? "bg-gray-100" : "bg-white"}`}
                               disabled={isApproved}
                               defaultValue={overrides[act.code]?.hours !== undefined ? overrides[act.code].hours : act.calcHours}
                               onBlur={(e) => handleOverrideChange(act.code, e.target.value)}
                             />
                             {isOverridden && (
                               <small className="text-gray-400 text-right line-through font-mono">{act.calcHours}</small>
                             )}
                           </div>
                         </td>
                         <td className="p-2 font-mono text-right text-gray-700">
                           {money.format(act.adjFee)}
                         </td>
                       </tr>
                     );
                   })}
                 </tbody>
               </table>
             </div>
           ))}
         </Wrapper>
       ))}

       <Wrapper className={`mt-6 bg-white border ${isPipelineView ? "p-4" : "p-6"}`}>
         <h3 className="mb-4">Approval & Actions</h3>
         <div className="flex items-center gap-4 mb-4 pb-4 border-b">
           {isApproved ? (
             <div className="badge high text-green-700 bg-green-50 border-green-200" data-testid="status-estimate-approved">
               Estimate Approved {new Date(intake.estimateApprovedAt).toLocaleString()}
             </div>
           ) : (
              <div>
                {overrideError && <p className="error-text mb-2" data-testid="override-save-error">{overrideError}</p>}
                <button className="primary" onClick={handleApprove} disabled={approving || overrideSaving} data-testid="button-approve-estimate">
                  {approving ? "Approving..." : overrideSaving ? "Saving override..." : "Approve Estimate"}
                </button>
              </div>
           )}
         </div>

         {isApproved && (
           <div className="pt-2">
             <h4 className="mb-3 text-sm font-bold uppercase text-gray-700">Create Project</h4>
             <div className="form-grid mb-4" style={{ gridTemplateColumns: "1fr" }}>
               <label className="text-sm"><span>Employee Group Name</span>
                 <input className="w-full p-2 border mt-1 bg-white" value={employeeGroupName} onChange={e => setEmployeeGroupName(e.target.value)} required placeholder="e.g. CDIOperations" />
               </label>
             </div>
             <div className="flex flex-col gap-4 mb-4">
               <label className="check flex items-start gap-2 bg-red-50 border border-red-100 p-3">
                 <input type="checkbox" className="mt-1" checked={dryRun} onChange={e => setDryRun(e.target.checked)} data-testid="checkbox-dry-run" />
                 <div>
                   <span className="font-bold text-red-700 uppercase block">Dry Run</span>
                   <span className="text-xs text-red-600">Uncheck to execute live BQE creation. Use with caution.</span>
                 </div>
               </label>
               <button className="secondary self-start" onClick={handleCreateProject} data-testid="button-create-project">
                 {dryRun ? "Run dry run" : "Execute Create Project"}
               </button>
             </div>
             
             {createLog && (
               <div className="mt-4 border-t pt-4">
                 <span className="overline">Payload Log</span>
                 <pre className="p-3 bg-gray-50 border text-xs overflow-auto max-h-64 mt-2 text-gray-700 shadow-inner" data-testid="pre-create-log">
                   {createLog}
                 </pre>
               </div>
             )}
           </div>
         )}
       </Wrapper>
    </div>
  );
}
