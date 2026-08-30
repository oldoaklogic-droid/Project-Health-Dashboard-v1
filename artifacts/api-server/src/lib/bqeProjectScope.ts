export const NON_PROJECT_BUCKETS = [
  "Admin",
  "Overhead",
  "PTO",
  "Business Development",
  "Internal",
] as const;

export type NonProjectBucket = (typeof NON_PROJECT_BUCKETS)[number];

export function nonProjectBucket(
  code: string | null,
  name: string | null,
): NonProjectBucket | null {
  const value = `${code ?? ""} ${name ?? ""}`.toLowerCase();
  if (/\b(office|admin)\b/.test(value)) return "Admin";
  if (/\boverhead\b/.test(value)) return "Overhead";
  if (/\b(pto|paid time off|holiday|vacation|sick)\b/.test(value)) return "PTO";
  if (/\b(new clients?|business development|business dev|marketing|proposal|sales)\b/.test(value)) return "Business Development";
  if (/\b(internal|training|company meeting|it)\b/.test(value)) return "Internal";
  return null;
}

export function normalizedProjectStatus(
  status: string | null,
): "active" | "completed" | null {
  const value = status?.trim().toLowerCase();
  if (value === "0" || value === "active" || value === "open" || value === "in progress") return "active";
  if (value === "2" || value === "completed" || value === "complete" || value === "closed") return "completed";
  return null;
}