import React, { createContext, useContext, useState, ReactNode } from 'react';
import { historicalFingerprint, type Activity } from '@/data/dataset';

export type LeadStatus = 'New' | 'Moved to Intake' | 'Dropped';

export interface Lead {
  id: string;
  who: string;
  what: string;
  where: string;
  source: string;
  spotter: string;
  status: LeadStatus;
  createdAt: string;
}

export interface IntakeDrivers {
  lots?: number;
  acreage?: number;
  corners?: number;
  structures?: number;
}

export interface IntakeStepFlags {
  sepa?: boolean;
  easements?: boolean;
  uav?: boolean;
  alta_optional?: boolean;
  stormwater?: boolean;
  roads?: boolean;
  water?: boolean;
}

export interface Intake {
  id: string;
  leadId: string;
  projectType: string;
  drivers: IntakeDrivers;
  client: string;
  projectName: string;
  pm: string;
  contractType: string;
  paymentTerms: string;
  startDate: string;
  address: string;
  notes: string;
  stepFlags: IntakeStepFlags;
  createdAt: string;
  estimateApprovedAt?: string;
}

export type ProjectStatus = 'Draft' | 'Active' | 'On Hold' | 'Closed';
export type PhaseStatus = 'Not Started' | 'In Progress' | 'Complete';

export interface ProjectPhase { name: string; status: PhaseStatus; }
export interface ProjectActivity { code: string; desc: string; phase: string; estimatedHours: number | null; }
export interface ChangeOrder { id: string; description: string; requestedHours: number; reason: string; authorized: boolean; createdAt: string; }
export interface Closeout { actualHours: Record<string, number>; varianceReason?: string; varianceNote?: string; closedAt?: string; }
export interface CloseoutSaveResult { ok: boolean; error?: string; }
export interface AdjustmentLog { id: string; createdAt: string; activityCode: string; activityDescription: string; estimatedHours: number; actualHours: number; varianceHours: number; }

export interface Project {
  id: string;
  projectNumber: string;
  intakeId: string;
  name: string;
  client: string;
  pm: string;
  address: string;
  projectType: string;
  intakeDetails: { drivers: IntakeDrivers; contractType: string; paymentTerms: string; startDate: string; notes: string; stepFlags: IntakeStepFlags; };
  originalHours: number;
  approvedHours: number;
  rate: number;
  fee: number;
  dueDate: string;
  status: ProjectStatus;
  phases: ProjectPhase[];
  activities: ProjectActivity[];
  changeOrders: ChangeOrder[];
  closeout?: Closeout;
  adjustmentLogs: AdjustmentLog[];
  createdAt: string;
}

export interface EstimateActivity extends Activity { calculatedHours: number | null; }
export interface EstimateSnapshot {
  activities: EstimateActivity[];
  phases: { name: string; activities: EstimateActivity[] }[];
  totalHours: number;
  hasPendingHistory: boolean;
}

const roundEstimateHours = (hours: number) => {
  if (hours <= 0) return 0;
  return Math.ceil((hours - Number.EPSILON) * 2) / 2;
};

// CORE ESTIMATING ENGINE. Move this to the backend unchanged.
export function calculateEstimate(intake: Intake): EstimateSnapshot | null {
  const projData = historicalFingerprint[intake.projectType];
  if (!projData || projData.activities.length === 0) return null;

  const typicalDriverValues: Record<string, number> = { lots: 6, acre: 5, corners: 8, structures: 2 };
  const fixedAtTypical = projData.activities
    .filter((a) => a.scaling === 'fixed' && a.base_hours !== null && a.freq_pct !== null)
    .reduce((t, a) => t + a.base_hours! * (a.freq_pct! / 100), 0);
  const rawLinearAtTypical = projData.activities
    .filter((a) => a.scaling === 'linear' && a.base_hours !== null && a.freq_pct !== null)
    .reduce((t, a) => t + a.base_hours! * (typicalDriverValues[a.driver ?? projData.scale_by] ?? 1) * (a.freq_pct! / 100), 0);
  const linearAdjustment = typeof projData.weighted_total === 'number' && rawLinearAtTypical > 0
    ? Math.max(0, (projData.weighted_total - fixedAtTypical) / rawLinearAtTypical)
    : 1;

  const activities = projData.activities.map((activity): EstimateActivity => {
    const stepFlag = activity.scaling === 'step'
      ? intake.stepFlags[(activity.step_key || activity.driver) as keyof typeof intake.stepFlags]
      : true;
    if (!stepFlag || activity.base_hours === null || activity.freq_pct === null) {
      return { ...activity, calculatedHours: stepFlag ? null : 0 };
    }
    let hours = activity.base_hours * (activity.freq_pct / 100);
    if (activity.scaling === 'linear') {
      const driverValue = activity.driver === 'acre'
        ? (intake.drivers.acreage || 0)
        : (intake.drivers[activity.driver as keyof typeof intake.drivers] || 0);
      hours *= driverValue * linearAdjustment;
    }
    return { ...activity, calculatedHours: roundEstimateHours(hours) };
  });
  const visibleActivities = activities.filter((a) => !(a.scaling === 'step' && a.calculatedHours === 0));
  const phases = projData.phases
    .map((phase) => {
      const phaseCodes = new Set(phase.activities);
      const explicit = phase.activities
        .map((code) => visibleActivities.find((a) => a.code === code))
        .filter((a): a is EstimateActivity => Boolean(a));
      const extra = visibleActivities.filter((a) => a.phase === phase.name && !phaseCodes.has(a.code));
      return { name: phase.name, activities: [...explicit, ...extra] };
    })
    .filter((phase) => phase.activities.length > 0);

  return {
    activities: visibleActivities,
    phases,
    totalHours: roundEstimateHours(visibleActivities.reduce((t, a) => t + (a.calculatedHours ?? 0), 0)),
    hasPendingHistory: visibleActivities.some((a) => a.calculatedHours === null),
  };
}

// The React context/provider (addLead, addIntake, createProject, updateProject, updatePhaseStatus,
// addChangeOrder, authorizeChangeOrder, saveCloseout) lives in the source app at
// artifacts/cdi-estimating-prototype/src/store/index.tsx. Its business rules to preserve on the backend:
// - createProject requires estimateApprovedAt; project number increments from 26000; default rate 175;
//   dueDate = startDate + max(14, ceil(hours/8)*2) days; status Draft; phases start Not Started.
// - updateProject: closed projects immutable; fee and rate stay consistent (fee = approvedHours * rate).
// - authorizeChangeOrder: approvedHours = originalHours + sum(authorized change order hours); fee recomputed.
// - saveCloseout: requires all phases Complete, valid nonnegative actuals for every activity,
//   and a variance reason + note when |actual - approved| / approved > 20%. Writes adjustmentLogs and sets Closed.
