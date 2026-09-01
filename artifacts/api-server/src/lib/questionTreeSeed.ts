import { asc, eq } from "drizzle-orm";
import { db, questionTreeTable, type QuestionTreeItem } from "@workspace/db";

type SeedQuestion = Omit<QuestionTreeItem, "id">;

const primaryRequestOptions = [
  "Boundary survey",
  "Short plat / lot split",
  "Subdivision",
  "Topographic survey",
  "ALTA survey",
  "Site plan",
  "Civil engineering",
  "Land use / planning",
  "Architecture (residential or light commercial)",
  "Landscape design",
  "Interior design",
  "Structural review",
  "Not sure",
];

const propertyPlanOptions = [
  { label: "Building a new house", mapsTo: ["Architecture", "Site plan", "Planning", "Topo"] },
  { label: "Commercial structure", mapsTo: ["Architecture", "Civil", "Planning", "Structural"] },
  { label: "Addition or remodel", mapsTo: ["Architecture", "Structural", "Planning"] },
  { label: "Subdividing to sell lots", mapsTo: ["Short plat", "Subdivision", "Civil", "Planning"] },
  { label: "Subdividing for family", mapsTo: ["Short plat", "Civil", "Planning"] },
  { label: "Selling as-is", mapsTo: ["ALTA"] },
  { label: "Refinancing", mapsTo: ["ALTA", "Boundary"] },
  { label: "Property line dispute", mapsTo: ["Boundary"] },
  { label: "Just want to know", mapsTo: ["Boundary", "Topo"] },
  { label: "Not sure yet", mapsTo: ["Topo"] },
];

const q = (
  section: string,
  discipline: string | null,
  prompt: string,
  answerType: string,
  sortOrder: number,
  mapsTo: Record<string, unknown>,
  options: unknown[] = [],
  trigger: string | null = null,
): SeedQuestion => ({
  section,
  discipline,
  trigger,
  prompt,
  answerType,
  options,
  mapsTo,
  sortOrder: String(sortOrder),
  active: true,
});

export const questionTreeSeed: SeedQuestion[] = [
  q("2", null, "What is the client's primary request?", "single-select", 200, { field: "primaryRequest" }, primaryRequestOptions),
  q(
    "3",
    null,
    "Ask the client: what are your plans for the property?",
    "single-select",
    300,
    { field: "propertyPlans", surfaceDisciplinesFromOptions: true },
    propertyPlanOptions,
  ),
  q("4", "Survey", "How many lots are involved?", "number", 401, { driver: "lots" }),
  q("4", "Survey", "How many acres are involved?", "number", 402, { driver: "acreage" }),
  q("4", "Survey", "How many corners need to be located or set?", "number", 403, { driver: "corners" }),
  q("4", "Survey", "How many structures or improvements are on the property?", "number", 404, { driver: "structures" }),
  q("4", "Survey", "Are easements included?", "yes-no", 405, { stepFlag: "easements" }),
  q("4", "Survey", "Is a SEPA checklist required?", "yes-no", 406, { stepFlag: "sepa" }),
  q("4", "Survey", "Should UAV/drone topography be used?", "yes-no", 407, { stepFlag: "uav" }),
  q("4", "Survey", "Are ALTA Table A optional items requested?", "yes-no", 408, { stepFlag: "alta_optional" }),
  q("4", "Civil", "Is stormwater design in scope?", "yes-no", 420, { stepFlag: "stormwater" }),
  q("4", "Civil", "Are roads or frontage improvements in scope?", "yes-no", 421, { stepFlag: "roads" }),
  q("4", "Civil", "Is water-system design in scope?", "yes-no", 422, { stepFlag: "water" }),
  q("4", "Civil", "How many acres are in the civil scope?", "number", 423, { driver: "acreage" }),
  q("4", "Civil", "Is infiltration testing required?", "yes-no", 424, { stepFlag: "stormwater", activityCode: "C-215" }),
  q("4", "Planning", "What jurisdiction governs the property?", "text", 440, { answer: "jurisdiction" }),
  q("4", "Planning", "Is a conditional use permit required?", "yes-no", 441, { answer: "cup" }),
  q("4", "Planning", "Is a variance required?", "yes-no", 442, { answer: "variance" }),
  q("4", "Planning", "Is a rezone required?", "yes-no", 443, { answer: "rezone" }),
  q("4", "Planning", "Is SEPA review required?", "yes-no", 444, { answer: "sepa", stepFlag: "sepa" }),
  q("4", "Planning", "Is a critical-area review required?", "yes-no", 445, { answer: "criticalArea" }),
  q("4", "Architecture", "Is the project residential or commercial?", "single-select", 460, { answer: "buildingType" }, ["Residential", "Commercial"]),
  q("4", "Architecture", "What is the approximate square footage?", "number", 461, { answer: "squareFeet" }),
  q("4", "Architecture", "Is this new construction, an addition, or a remodel?", "single-select", 462, { answer: "architectureScope" }, ["New construction", "Addition", "Remodel"]),
  q("4", "Architecture", "Does the client already have a design?", "yes-no", 463, { answer: "hasDesign" }),
  q("4", "Architecture", "Which architectural phases are wanted?", "multi-select", 464, { answer: "architecturePhases" }, ["Concept", "Schematic design", "Design development", "Construction documents", "Permitting", "Construction administration"]),
  q("4", "Structural", "Is this review-only or new structural design?", "single-select", 480, { answer: "structuralScope" }, ["Review", "New design"]),
  q("4", "Structural", "Are load-bearing elements affected?", "yes-no", 481, { answer: "loadBearing" }),
  q("4", "Landscape", "What area is included in the landscape scope?", "number", 500, { answer: "landscapeArea" }),
  q("4", "Landscape", "Is concept design or full design wanted?", "single-select", 501, { answer: "landscapeScope" }, ["Concept", "Full design"]),
  q("4", "Interior", "What area is included in the interior scope?", "number", 520, { answer: "interiorArea" }),
  q("4", "Interior", "Is concept design or full design wanted?", "single-select", 521, { answer: "interiorScope" }, ["Concept", "Full design"]),
];

let seedPromise: Promise<void> | null = null;

export async function ensureQuestionTreeSeeded(): Promise<void> {
  seedPromise ??= (async () => {
    const existing = await db
      .select({ id: questionTreeTable.id })
      .from(questionTreeTable)
      .where(eq(questionTreeTable.active, true))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(questionTreeTable).values(questionTreeSeed);
    }
  })();
  await seedPromise;
}

export async function getQuestionTree(): Promise<QuestionTreeItem[]> {
  await ensureQuestionTreeSeeded();
  return db
    .select()
    .from(questionTreeTable)
    .where(eq(questionTreeTable.active, true))
    .orderBy(asc(questionTreeTable.sortOrder));
}