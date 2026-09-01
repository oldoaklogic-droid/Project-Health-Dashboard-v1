import {
  historicalFingerprint,
  type Activity,
  type Phase,
  type ProjectData,
} from './historicalFingerprint.js';

export interface EstimateDrivers {
  lots?: number;
  acreage?: number;
  corners?: number;
  structures?: number;
}

export interface EstimateStepFlags {
  sepa?: boolean;
  easements?: boolean;
  uav?: boolean;
  alta_optional?: boolean;
  stormwater?: boolean;
  roads?: boolean;
  water?: boolean;
}

export interface EstimateIntake {
  projectType?: string | string[];
  disciplines?: string[];
  drivers: EstimateDrivers;
  stepFlags: EstimateStepFlags;
  rate?: number;
}

export interface EstimateActivity extends Activity {
  calculatedHours: number | null;
}

export interface EstimateSnapshot {
  activities: EstimateActivity[];
  phases: { name: string; activities: EstimateActivity[] }[];
  totalHours: number;
  hasPendingHistory: boolean;
}

export interface DisciplineEstimate extends EstimateSnapshot {
  discipline: CanonicalDiscipline;
  disciplineKey: DisciplineKey | null;
  fee: number;
  templatePending: boolean;
}

export interface EstimateResult {
  disciplines: DisciplineEstimate[];
  totalHours: number;
  totalFee: number;
  rate: number;
}

export type DisciplineKey = 'shortPlat' | 'boundary' | 'alta' | 'topo' | 'civil';
export type CanonicalDiscipline =
  | 'Short Plat'
  | 'Boundary Survey'
  | 'ALTA Survey'
  | 'Topographic Survey'
  | 'Civil Engineering'
  | 'Planning'
  | 'Architecture'
  | 'Structural'
  | 'Landscape'
  | 'Interior';

export const SUPPORTED_ESTIMATING_DISCIPLINES = [
  'Short Plat',
  'Boundary Survey',
  'ALTA Survey',
  'Topographic Survey',
  'Civil Engineering',
] as const satisfies readonly CanonicalDiscipline[];

const disciplineDefinitions: ReadonlyArray<{
  label: CanonicalDiscipline;
  key: DisciplineKey | null;
  aliases: readonly string[];
}> = [
  { label: 'Short Plat', key: 'shortPlat', aliases: ['short plat', 'shortplat'] },
  { label: 'Boundary Survey', key: 'boundary', aliases: ['boundary survey', 'boundary'] },
  { label: 'ALTA Survey', key: 'alta', aliases: ['alta survey', 'alta'] },
  { label: 'Topographic Survey', key: 'topo', aliases: ['topographic survey', 'topo'] },
  { label: 'Civil Engineering', key: 'civil', aliases: ['civil engineering', 'civil'] },
  { label: 'Planning', key: null, aliases: ['planning'] },
  { label: 'Architecture', key: null, aliases: ['architecture'] },
  { label: 'Structural', key: null, aliases: ['structural'] },
  { label: 'Landscape', key: null, aliases: ['landscape'] },
  { label: 'Interior', key: null, aliases: ['interior'] },
];

const normalizeDiscipline = (discipline: string) =>
  discipline.trim().replace(/[\s_-]+/g, ' ').toLowerCase();

const findDiscipline = (discipline: string) => {
  const normalized = normalizeDiscipline(discipline);
  return disciplineDefinitions.find(
    ({ label, key, aliases }) =>
      normalizeDiscipline(label) === normalized ||
      (key !== null && normalizeDiscipline(key) === normalized) ||
      aliases.includes(normalized),
  );
};

const roundEstimateHours = (hours: number) => {
  if (hours <= 0) return 0;
  return Math.ceil((hours - Number.EPSILON) * 2) / 2;
};

function calculateDisciplineEstimate(
  projData: ProjectData,
  intake: EstimateIntake,
): EstimateSnapshot {
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
      ? intake.stepFlags[(activity.step_key || activity.driver) as keyof EstimateStepFlags]
      : true;
    if (!stepFlag || activity.base_hours === null || activity.freq_pct === null) {
      return { ...activity, calculatedHours: stepFlag ? null : 0 };
    }
    let hours = activity.base_hours * (activity.freq_pct / 100);
    if (activity.scaling === 'linear') {
      const driverValue = activity.driver === 'acre'
        ? (intake.drivers.acreage || 0)
        : (intake.drivers[activity.driver as keyof EstimateDrivers] || 0);
      hours *= driverValue * linearAdjustment;
    }
    return { ...activity, calculatedHours: roundEstimateHours(hours) };
  });
  const visibleActivities = activities.filter((a) => !(a.scaling === 'step' && a.calculatedHours === 0));
  const phases = projData.phases
    .map((phase: Phase) => {
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

/**
 * Calculates each requested discipline independently. Unknown discipline names
 * are ignored; if no requested discipline is recognized, null is returned.
 */
export function calculateEstimate(intake: EstimateIntake): EstimateResult | null {
  const requested = intake.disciplines ?? (
    Array.isArray(intake.projectType) ? intake.projectType : [intake.projectType ?? '']
  );
  const definitions = requested
    .map(findDiscipline)
    .filter((definition): definition is (typeof disciplineDefinitions)[number] => Boolean(definition));
  if (definitions.length === 0) return null;

  const rate = intake.rate ?? 220;
  const disciplines = definitions.map((definition): DisciplineEstimate => {
    if (definition.key === null) {
      return {
        discipline: definition.label,
        disciplineKey: null,
        activities: [],
        phases: [],
        totalHours: 0,
        hasPendingHistory: false,
        fee: 0,
        templatePending: true,
      };
    }
    const snapshot = calculateDisciplineEstimate(historicalFingerprint[definition.key], intake);
    return {
      ...snapshot,
      discipline: definition.label,
      disciplineKey: definition.key,
      fee: snapshot.totalHours * rate,
      templatePending: false,
    };
  });

  return {
    disciplines,
    totalHours: roundEstimateHours(disciplines.reduce((total, estimate) => total + estimate.totalHours, 0)),
    totalFee: disciplines.reduce((total, estimate) => total + estimate.fee, 0),
    rate,
  };
}