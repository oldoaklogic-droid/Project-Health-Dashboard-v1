export type Scaling = 'fixed' | 'linear' | 'step';

export interface Activity {
  code: string;
  desc: string;
  phase: string;
  base_hours: number | null;
  scaling: Scaling;
  driver?: string;
  step_key?: string;
  freq_pct: number | null;
}

export interface Phase {
  name: string;
  activities: string[];
  comm?: string;
  review?: string;
  step_optional?: string[];
}

export interface ProjectData {
  scale_by: string;
  typical_total?: number;
  n_projects: number;
  weighted_total?: number;
  activities: Activity[];
  phases: Phase[];
  driver_note?: string;
  note?: string;
}

export const historicalFingerprint: Record<string, ProjectData> = {
  shortPlat: {
    scale_by: 'lots',
    typical_total: 22.8,
    n_projects: 44,
    weighted_total: 21.9,
    activities: [
      { code: 'S-105', desc: 'Research', phase: 'Intake & Research', base_hours: 2, scaling: 'fixed', freq_pct: 48 },
      { code: 'S-106', desc: 'Site Visit/ Utility Locate', phase: 'Intake & Research', base_hours: 1.2, scaling: 'fixed', freq_pct: 32 },
      { code: 'S-104', desc: 'Quality Control', phase: 'Intake & Research', base_hours: 2.5, scaling: 'fixed', freq_pct: 59 },
      { code: 'S-302', desc: 'Project Administration', phase: 'Intake & Research', base_hours: 1.9, scaling: 'fixed', freq_pct: 91 },
      { code: 'S-107', desc: 'Scope & Feasibility Review', phase: 'Intake & Research', base_hours: null, scaling: 'fixed', freq_pct: null },
      { code: 'S-108', desc: 'Record & Title Research', phase: 'Intake & Research', base_hours: null, scaling: 'fixed', freq_pct: null },
      { code: 'S-109', desc: 'Existing Survey Review', phase: 'Intake & Research', base_hours: null, scaling: 'fixed', freq_pct: null },
      { code: 'S-616', desc: 'Topography', phase: 'Field Survey', base_hours: 8, scaling: 'linear', driver: 'lots', freq_pct: 55 },
      { code: 'S-617', desc: 'Corner Ties', phase: 'Field Survey', base_hours: 5.5, scaling: 'linear', driver: 'lots', freq_pct: 41 },
      { code: 'S-605', desc: 'Field Crew Coordination', phase: 'Field Survey', base_hours: 2.1, scaling: 'linear', driver: 'lots', freq_pct: 64 },
      { code: 'S-604', desc: 'D.C. Upload-Download', phase: 'Field Survey', base_hours: 0.8, scaling: 'linear', driver: 'lots', freq_pct: 61 },
      { code: 'S-613', desc: 'Set Lot Corners', phase: 'Field Survey', base_hours: 6, scaling: 'linear', driver: 'lots', freq_pct: 30 },
      { code: 'S-400', desc: 'Compute Boundary', phase: 'Office Computation', base_hours: null, scaling: 'linear', driver: 'lots', freq_pct: null },
      { code: 'S-513', desc: 'Drafting', phase: 'Office Computation', base_hours: 1.8, scaling: 'linear', driver: 'lots', freq_pct: 52 },
      { code: 'S-502', desc: 'Draft Plat', phase: 'Drafting & Preliminary Plat', base_hours: 4.2, scaling: 'linear', driver: 'lots', freq_pct: 82 },
      { code: 'S-506', desc: 'Draft Topography', phase: 'Drafting & Preliminary Plat', base_hours: 3.1, scaling: 'linear', driver: 'lots', freq_pct: 32 },
      { code: 'S-201', desc: 'Application Preparation', phase: 'Drafting & Preliminary Plat', base_hours: 1, scaling: 'fixed', freq_pct: 66 },
      { code: 'S-510', desc: 'Reproduction', phase: 'Drafting & Preliminary Plat', base_hours: null, scaling: 'fixed', freq_pct: null },
      { code: 'S-507', desc: 'Draft Legal Description', phase: 'Drafting & Preliminary Plat', base_hours: null, scaling: 'linear', driver: 'lots', freq_pct: null },
      { code: 'S-508', desc: 'Draft Easements', phase: 'Drafting & Preliminary Plat', base_hours: null, scaling: 'step', step_key: 'easements', freq_pct: null },
      { code: 'S-509', desc: 'SEPA Checklist Preparation', phase: 'Drafting & Preliminary Plat', base_hours: null, scaling: 'step', step_key: 'sepa', freq_pct: null },
      { code: 'S-301', desc: 'Meeting/Meeting Preparation', phase: 'Agency Review & Revision', base_hours: 1.9, scaling: 'fixed', freq_pct: 55 },
      { code: 'S-202', desc: 'Agency Coordination', phase: 'Agency Review & Revision', base_hours: null, scaling: 'fixed', freq_pct: null },
      { code: 'S-203', desc: 'Agency Comment Response', phase: 'Agency Review & Revision', base_hours: null, scaling: 'fixed', freq_pct: null },
      { code: 'S-204', desc: 'Plat Revision', phase: 'Agency Review & Revision', base_hours: null, scaling: 'linear', driver: 'lots', freq_pct: null },
      { code: 'S-205', desc: 'Recording Coordination', phase: 'Final Plat & Recording', base_hours: null, scaling: 'fixed', freq_pct: null },
      { code: 'S-206', desc: 'Final Plat Certification', phase: 'Final Plat & Recording', base_hours: null, scaling: 'fixed', freq_pct: null },
      { code: 'S-207', desc: 'Final Monumentation Record', phase: 'Final Plat & Recording', base_hours: null, scaling: 'fixed', freq_pct: null },
    ],
    phases: [
      { name: 'Intake & Research', activities: ['S-105', 'S-106', 'S-104', 'S-302', 'S-107', 'S-108', 'S-109'], review: 'scope & feasibility check before field work' },
      { name: 'Field Survey', activities: ['S-616', 'S-617', 'S-605', 'S-604', 'S-613'], comm: 'notify client field work complete' },
      { name: 'Office Computation', activities: ['S-400', 'S-513'], review: 'boundary closure & lot geometry QC' },
      { name: 'Drafting & Preliminary Plat', activities: ['S-502', 'S-506', 'S-201', 'S-510', 'S-507', 'S-508', 'S-509'], step_optional: ['Draft Easements (if easements present)', 'SEPA Checklist Preparation (if SEPA triggered)'], comm: 'submit preliminary plat to jurisdiction' },
      { name: 'Agency Review & Revision', activities: ['S-301', 'S-202', 'S-203', 'S-204'], comm: 'respond to county/city comments' },
      { name: 'Final Plat & Recording', activities: ['S-205', 'S-206', 'S-207'], comm: 'deliver for signature/recording', review: 'final PLS stamp & certification' },
    ],
  },
  boundary: {
    scale_by: 'acre',
    typical_total: 7.8,
    n_projects: 19,
    weighted_total: 16.1,
    activities: [
      { code: 'S-105', desc: 'Research', phase: 'Research & Reconstruction', base_hours: 2, scaling: 'fixed', freq_pct: 58 },
      { code: 'S-106', desc: 'Site Visit/ Utility Locate', phase: 'Field Evidence', base_hours: 1, scaling: 'fixed', freq_pct: 26 },
      { code: 'S-104', desc: 'Quality Control', phase: 'Deliverable', base_hours: 1, scaling: 'fixed', freq_pct: 42 },
      { code: 'S-107', desc: 'Scope & Feasibility Review', phase: 'Research & Reconstruction', base_hours: null, scaling: 'fixed', freq_pct: null },
      { code: 'S-108', desc: 'Record & Title Research', phase: 'Research & Reconstruction', base_hours: null, scaling: 'fixed', freq_pct: null },
      { code: 'S-109', desc: 'Existing Survey Review', phase: 'Research & Reconstruction', base_hours: null, scaling: 'fixed', freq_pct: null },
      { code: 'S-400', desc: 'Compute Boundary', phase: 'Boundary Resolution', base_hours: 2, scaling: 'linear', driver: 'acre', freq_pct: 47 },
      { code: 'S-302', desc: 'Project Administration', phase: 'Boundary Resolution', base_hours: 1, scaling: 'fixed', freq_pct: 47 },
      { code: 'S-616', desc: 'Topography', phase: 'Field Evidence', base_hours: 15, scaling: 'linear', driver: 'acre', freq_pct: 47 },
      { code: 'S-617', desc: 'Corner Ties', phase: 'Field Evidence', base_hours: 4, scaling: 'linear', driver: 'acre', freq_pct: 47 },
      { code: 'S-605', desc: 'Field Crew Coordination', phase: 'Field Evidence', base_hours: 1.5, scaling: 'linear', driver: 'acre', freq_pct: 68 },
      { code: 'S-604', desc: 'D.C. Upload-Download', phase: 'Field Evidence', base_hours: 1.1, scaling: 'linear', driver: 'acre', freq_pct: 63 },
      { code: 'S-613', desc: 'Set Lot Corners', phase: 'Field Evidence', base_hours: null, scaling: 'linear', driver: 'corners', freq_pct: null },
      { code: 'S-503', desc: 'Draft ROS', phase: 'Deliverable', base_hours: 3.5, scaling: 'linear', driver: 'acre', freq_pct: 26 },
      { code: 'S-506', desc: 'Draft Topography', phase: 'Deliverable', base_hours: 2.8, scaling: 'linear', driver: 'acre', freq_pct: 47 },
      { code: 'S-513', desc: 'Drafting', phase: 'Deliverable', base_hours: null, scaling: 'linear', driver: 'acre', freq_pct: null },
      { code: 'S-510', desc: 'Reproduction', phase: 'Deliverable', base_hours: null, scaling: 'fixed', freq_pct: null },
      { code: 'S-301', desc: 'Meeting/Meeting Preparation', phase: 'Deliverable', base_hours: null, scaling: 'fixed', freq_pct: null },
      { code: 'S-202', desc: 'Agency Coordination', phase: 'Deliverable', base_hours: null, scaling: 'fixed', freq_pct: null },
      { code: 'S-205', desc: 'Recording/Delivery Coordination', phase: 'Deliverable', base_hours: null, scaling: 'fixed', freq_pct: null },
    ],
    phases: [
      { name: 'Research & Reconstruction', activities: ['S-105', 'S-107', 'S-108', 'S-109'], review: 'record research adequacy before field' },
      { name: 'Field Evidence', activities: ['S-106', 'S-617', 'S-616', 'S-605', 'S-604', 'S-613'], comm: 'field findings, any evidence conflicts' },
      { name: 'Boundary Resolution', activities: ['S-400', 'S-302'], review: 'PLS boundary determination (licensed judgment)' },
      { name: 'Deliverable', activities: ['S-503', 'S-506', 'S-513', 'S-510', 'S-301', 'S-202', 'S-205', 'S-104'], comm: 'deliver; file R.O.S. with county if required' },
    ],
  },
  alta: {
    scale_by: 'acre',
    typical_total: 47,
    n_projects: 21,
    weighted_total: 39.5,
    activities: [
      { code: 'S-105', desc: 'Research', phase: 'Authorization & Scope', base_hours: 3.2, scaling: 'fixed', freq_pct: 76 },
      { code: 'S-104', desc: 'Quality Control', phase: 'Certification & Delivery', base_hours: 3.2, scaling: 'fixed', freq_pct: 86 },
      { code: 'S-106', desc: 'Site Visit/ Utility Locate', phase: 'Fieldwork', base_hours: 2.2, scaling: 'fixed', freq_pct: 67 },
      { code: 'S-400', desc: 'Compute Boundary', phase: 'Computation & Title Resolution', base_hours: 3.9, scaling: 'linear', driver: 'acre', freq_pct: 48 },
      { code: 'S-302', desc: 'Project Administration', phase: 'Certification & Delivery', base_hours: 1, scaling: 'fixed', freq_pct: 67 },
      { code: 'S-506', desc: 'Draft Topography', phase: 'Plat Preparation', base_hours: 7, scaling: 'linear', driver: 'acre', freq_pct: 62 },
      { code: 'S-503', desc: 'Draft ROS', phase: 'Plat Preparation', base_hours: 5, scaling: 'linear', driver: 'acre', freq_pct: 90 },
      { code: 'S-513', desc: 'Drafting', phase: 'Plat Preparation', base_hours: 2.5, scaling: 'linear', driver: 'acre', freq_pct: 48 },
      { code: 'S-510', desc: 'Reproduction', phase: 'Plat Preparation', base_hours: 0.2, scaling: 'linear', driver: 'acre', freq_pct: 33 },
      { code: 'S-616', desc: 'Topography', phase: 'Fieldwork', base_hours: 17.5, scaling: 'linear', driver: 'acre', freq_pct: 76 },
      { code: 'S-617', desc: 'Corner Ties', phase: 'Fieldwork', base_hours: 7, scaling: 'linear', driver: 'acre', freq_pct: 38 },
      { code: 'S-613', desc: 'Set Lot Corners', phase: 'Fieldwork', base_hours: 5, scaling: 'linear', driver: 'acre', freq_pct: 48 },
      { code: 'S-605', desc: 'Field Crew Coordination', phase: 'Fieldwork', base_hours: 1.6, scaling: 'linear', driver: 'acre', freq_pct: 76 },
      { code: 'S-604', desc: 'D.C. Upload-Download', phase: 'Fieldwork', base_hours: 0.8, scaling: 'linear', driver: 'acre', freq_pct: 76 },
      { code: 'S-107', desc: 'Scope & Table A Review', phase: 'Authorization & Scope', base_hours: null, scaling: 'fixed', freq_pct: null },
      { code: 'S-108', desc: 'Title Commitment Review', phase: 'Authorization & Scope', base_hours: null, scaling: 'fixed', freq_pct: null },
      { code: 'S-109', desc: 'Easement & Encumbrance Research', phase: 'Authorization & Scope', base_hours: null, scaling: 'fixed', freq_pct: null },
      { code: 'S-301', desc: 'Meeting/Meeting Preparation', phase: 'Authorization & Scope', base_hours: null, scaling: 'fixed', freq_pct: null },
      { code: 'S-202', desc: 'Title Company Coordination', phase: 'Certification & Delivery', base_hours: null, scaling: 'fixed', freq_pct: null },
      { code: 'S-522', desc: 'Locate Structures & Improvements', phase: 'Fieldwork', base_hours: null, scaling: 'linear', driver: 'structures', freq_pct: null },
      { code: 'S-523', desc: 'Utility Evidence Review', phase: 'Fieldwork', base_hours: null, scaling: 'linear', driver: 'acre', freq_pct: null },
      { code: 'S-508', desc: 'Table A Optional Items', phase: 'Authorization & Scope', base_hours: null, scaling: 'step', step_key: 'alta_optional', freq_pct: null },
      { code: 'S-524', desc: 'ALTA Certification Support', phase: 'Certification & Delivery', base_hours: null, scaling: 'fixed', freq_pct: null },
      { code: 'S-525', desc: 'Lender/Client Comment Response', phase: 'Certification & Delivery', base_hours: null, scaling: 'fixed', freq_pct: null },
      { code: 'S-526', desc: 'Certification & Delivery Coordination', phase: 'Certification & Delivery', base_hours: null, scaling: 'fixed', freq_pct: null },
    ],
    phases: [
      { name: 'Authorization & Scope', activities: ['S-105', 'S-107', 'S-108', 'S-109', 'S-301', 'S-508'], comm: 'written authorization to proceed; negotiate Table A optional items', review: 'Table A items confirmed in writing before proceeding' },
      { name: 'Fieldwork', activities: ['S-106', 'S-616', 'S-617', 'S-613', 'S-605', 'S-604', 'S-522', 'S-523'], comm: 'coordinate site access' },
      { name: 'Computation & Title Resolution', activities: ['S-400'], review: 'relationship of boundary to record documents' },
      { name: 'Plat Preparation', activities: ['S-506', 'S-503', 'S-513', 'S-510'], review: 'ALTA plat content check against Sections 5 & 6' },
      { name: 'Certification & Delivery', activities: ['S-104', 'S-302', 'S-202', 'S-524', 'S-525', 'S-526'], review: 'ALTA certification & PLS stamp', comm: 'deliver certified survey to title company, lender, client' },
    ],
  },
  topo: {
    scale_by: 'acre',
    typical_total: 21.4,
    n_projects: 102,
    weighted_total: 18.6,
    activities: [
      { code: 'S-105', desc: 'Research', phase: 'Setup', base_hours: 2, scaling: 'fixed', freq_pct: 56 },
      { code: 'S-106', desc: 'Site Visit/ Utility Locate', phase: 'Field', base_hours: 1.8, scaling: 'fixed', freq_pct: 40 },
      { code: 'S-104', desc: 'Quality Control', phase: 'Office & Draft', base_hours: 1, scaling: 'fixed', freq_pct: 47 },
      { code: 'S-400', desc: 'Compute Boundary', phase: 'Office & Draft', base_hours: 2.6, scaling: 'linear', driver: 'acre', freq_pct: 29 },
      { code: 'S-302', desc: 'Project Administration', phase: 'Office & Draft', base_hours: 0.6, scaling: 'fixed', freq_pct: 45 },
      { code: 'S-506', desc: 'Draft Topography', phase: 'Office & Draft', base_hours: 3, scaling: 'linear', driver: 'acre', freq_pct: 91 },
      { code: 'S-616', desc: 'Topography', phase: 'Field', base_hours: 9.8, scaling: 'linear', driver: 'acre', freq_pct: 95 },
      { code: 'S-617', desc: 'Corner Ties', phase: 'Field', base_hours: 3, scaling: 'linear', driver: 'acre', freq_pct: 47 },
      { code: 'S-605', desc: 'Field Crew Coordination', phase: 'Field', base_hours: 1.5, scaling: 'linear', driver: 'acre', freq_pct: 91 },
      { code: 'S-604', desc: 'D.C. Upload-Download', phase: 'Office & Draft', base_hours: 0.5, scaling: 'linear', driver: 'acre', freq_pct: 87 },
      { code: 'S-108', desc: 'Existing Data & Record Research', phase: 'Setup', base_hours: null, scaling: 'fixed', freq_pct: null },
      { code: 'S-301', desc: 'Meeting/Meeting Preparation', phase: 'Setup', base_hours: null, scaling: 'fixed', freq_pct: null },
      { code: 'S-613', desc: 'Set/Find Monuments', phase: 'Field', base_hours: null, scaling: 'linear', driver: 'corners', freq_pct: null },
      { code: 'S-507', desc: 'Surface Model & Digital Terrain Model', phase: 'Office & Draft', base_hours: null, scaling: 'linear', driver: 'acre', freq_pct: null },
      { code: 'S-510', desc: 'Reproduction', phase: 'Office & Draft', base_hours: null, scaling: 'fixed', freq_pct: null },
      { code: 'S-520', desc: 'Drone Topo', phase: 'Field', base_hours: null, scaling: 'step', step_key: 'uav', freq_pct: null },
    ],
    phases: [
      { name: 'Setup', activities: ['S-105', 'S-108', 'S-301'], comm: 'confirm scope, datum, deliverable format' },
      { name: 'Field', activities: ['S-106', 'S-616', 'S-617', 'S-605', 'S-613', 'S-520'], step_optional: ['Drone Topo (if UAV method chosen)'], comm: 'field complete' },
      { name: 'Office & Draft', activities: ['S-400', 'S-302', 'S-604', 'S-506', 'S-507', 'S-510', 'S-104'], review: 'surface & contour QC', comm: 'deliver' },
    ],
  },
  civil: {
    scale_by: 'acre',
    n_projects: 216,
    note: "Built from 216 closed CDI civil projects. Phase structure and scope-driver logic are a first draft pending Justin Wilson's validation, same process used for the survey workflows with Seth.",
    driver_note: 'driver pending Justin Wilson confirmation - may vary by sub-scope, e.g. lot count for subdivisions or flow rate for water systems',
    activities: [
      { code: 'C-099', desc: 'Project Setup', phase: 'Project Setup & Client Engagement', scaling: 'fixed', base_hours: 1.0, freq_pct: 7 },
      { code: 'C-020', desc: 'Initial Client Meeting', phase: 'Project Setup & Client Engagement', scaling: 'fixed', base_hours: 1.0, freq_pct: 5 },
      { code: 'C-125', desc: 'Research Project Requirements', phase: 'Project Setup & Client Engagement', scaling: 'fixed', base_hours: 2.2, freq_pct: 6 },
      { code: 'C-130', desc: 'Proposal', phase: 'Project Setup & Client Engagement', scaling: 'fixed', base_hours: 3.5, freq_pct: 6 },
      { code: 'C-100', desc: 'Project Administration', phase: 'Project Setup & Client Engagement', scaling: 'fixed', base_hours: 3.0, freq_pct: 30 },
      { code: 'C-135', desc: 'Conceptual Site Plan Design', phase: 'Preliminary Engineering', scaling: 'linear', driver: 'acre', base_hours: 7.5, freq_pct: 7 },
      { code: 'C-202', desc: 'Preliminary Engineering', phase: 'Preliminary Engineering', scaling: 'linear', driver: 'acre', base_hours: 6.6, freq_pct: 20 },
      { code: 'C-206', desc: 'Preliminary Site Plan', phase: 'Preliminary Engineering', scaling: 'linear', driver: 'acre', base_hours: 12.6, freq_pct: 19 },
      { code: 'C-207', desc: 'Preliminary Stormwater Report', phase: 'Preliminary Engineering', scaling: 'linear', driver: 'acre', base_hours: 6.0, freq_pct: 12 },
      { code: 'C-245', desc: 'Site Visit', phase: 'Preliminary Engineering', scaling: 'fixed', base_hours: 2.0, freq_pct: 10 },
      { code: 'C-200', desc: 'Project Administration', phase: 'Preliminary Engineering', scaling: 'fixed', base_hours: 2.5, freq_pct: 16 },
      { code: 'C-701', desc: 'Final Engineering', phase: 'Final Engineering & Construction Documents', scaling: 'linear', driver: 'acre', base_hours: 11.0, freq_pct: 30 },
      { code: 'C-322', desc: 'Draft Construction Plan Set', phase: 'Final Engineering & Construction Documents', scaling: 'linear', driver: 'acre', base_hours: 9.0, freq_pct: 15 },
      { code: 'C-317', desc: 'Draft Grading Plan', phase: 'Final Engineering & Construction Documents', scaling: 'linear', driver: 'acre', base_hours: 14.0, freq_pct: 7 },
      { code: 'C-319', desc: 'Draft Storm', phase: 'Final Engineering & Construction Documents', scaling: 'linear', driver: 'acre', base_hours: 5.5, freq_pct: 11 },
      { code: 'C-320', desc: 'Draft Utilities', phase: 'Final Engineering & Construction Documents', scaling: 'linear', driver: 'acre', base_hours: 7.0, freq_pct: 7 },
      { code: 'C-321', desc: 'Draft Details', phase: 'Final Engineering & Construction Documents', scaling: 'linear', driver: 'acre', base_hours: 2.0, freq_pct: 8 },
      { code: 'C-325', desc: 'Final Stormwater Report', phase: 'Final Engineering & Construction Documents', scaling: 'linear', driver: 'acre', base_hours: 5.6, freq_pct: 17 },
      { code: 'C-215', desc: 'Infiltration Testing', phase: 'Final Engineering & Construction Documents', scaling: 'step', step_key: 'stormwater', base_hours: 12.8, freq_pct: 7 },
      { code: 'C-318', desc: 'Draft Roads', phase: 'Final Engineering & Construction Documents', scaling: 'step', step_key: 'roads', base_hours: 14.4, freq_pct: 6 },
      { code: 'C-600', desc: 'Water System Design', phase: 'Final Engineering & Construction Documents', scaling: 'step', step_key: 'water', base_hours: 6.2, freq_pct: 4 },
      { code: 'C-601', desc: 'Water System Report', phase: 'Final Engineering & Construction Documents', scaling: 'step', step_key: 'water', base_hours: 42.5, freq_pct: 3 },
      { code: 'C-602', desc: 'Water System Drafting', phase: 'Final Engineering & Construction Documents', scaling: 'step', step_key: 'water', base_hours: 17.0, freq_pct: 2 },
      { code: 'C-440', desc: 'Agency Comment Review', phase: 'Agency Review & Revisions', scaling: 'fixed', base_hours: 7.5, freq_pct: 12 },
      { code: 'C-335', desc: 'Agency Coordination', phase: 'Agency Review & Revisions', scaling: 'fixed', base_hours: 1.0, freq_pct: 6 },
      { code: 'C-430', desc: 'Storm Plan Revisions', phase: 'Agency Review & Revisions', scaling: 'step', step_key: 'stormwater', base_hours: 3.2, freq_pct: 7 },
      { code: 'C-445', desc: 'Utility Plans Revisions', phase: 'Agency Review & Revisions', scaling: 'step', step_key: 'water', base_hours: 5.8, freq_pct: 6 },
      { code: 'C-210', desc: 'Project Meeting', phase: 'Agency Review & Revisions', scaling: 'fixed', base_hours: 1.0, freq_pct: 6 },
      { code: 'C-311', desc: 'Client Meeting', phase: 'Agency Review & Revisions', scaling: 'fixed', base_hours: 1.0, freq_pct: 6 },
      { code: 'C-240', desc: 'Client Meeting', phase: 'Agency Review & Revisions', scaling: 'fixed', base_hours: 1.0, freq_pct: 10 },
      { code: 'C-560', desc: 'As-built Plans', phase: 'Construction Administration & Closeout', scaling: 'linear', driver: 'acre', base_hours: 4.5, freq_pct: 12 },
      { code: 'C-570', desc: 'Stormwater Certification Letter', phase: 'Construction Administration & Closeout', scaling: 'fixed', base_hours: 1.0, freq_pct: 6 },
      { code: 'C-400', desc: 'Quality Control', phase: 'Construction Administration & Closeout', scaling: 'fixed', base_hours: 1.0, freq_pct: 2 },
      { code: 'C-880', desc: 'Project Administration', phase: 'Construction Administration & Closeout', scaling: 'fixed', base_hours: 3.0, freq_pct: 13 },
    ],
    phases: [
      { name: 'Project Setup & Client Engagement', activities: ['C-099', 'C-020', 'C-125', 'C-130', 'C-100'], comm: 'kickoff, confirm scope and site conditions', review: 'scope & feasibility check before design begins' },
      { name: 'Preliminary Engineering', activities: ['C-135', 'C-202', 'C-206', 'C-207', 'C-245', 'C-200'], comm: 'submit preliminary design to client for review' },
      { name: 'Final Engineering & Construction Documents', activities: ['C-701', 'C-322', 'C-317', 'C-319', 'C-320', 'C-321', 'C-325'], step_optional: ['C-215 Infiltration Testing (if geotech triggers it)', 'C-318 Draft Roads (if road/frontage design in scope)', 'C-600/C-601/C-602 Water System Design, Report, Drafting (if water system design in scope)'], review: 'final engineering QC before agency submittal (licensed judgment - Justin, PE stamp)' },
      { name: 'Agency Review & Revisions', activities: ['C-440', 'C-335', 'C-210', 'C-311', 'C-240'], step_optional: ['C-430 Storm Plan Revisions (if comments require)', 'C-445 Utility Plans Revisions (if comments require)'], comm: 'respond to agency comments, update client on review status' },
      { name: 'Construction Administration & Closeout', activities: ['C-560', 'C-570', 'C-400', 'C-880'], comm: 'deliver as-builts and certifications, final invoice', review: 'PE stamp & certification (licensed judgment - Justin)' },
    ],
  },
};

export const projectTypeNames: Record<string, string> = {
  shortPlat: 'Short Plat',
  boundary: 'Boundary Survey',
  alta: 'ALTA Survey',
  topo: 'Topographic Survey',
  civil: 'Civil Engineering',
};
