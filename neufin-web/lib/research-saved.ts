const SAVED_KEY = "neufin:research:saved";
const REPORT_QUEUE_KEY = "neufin:research:reportQueue";

function readIds(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const j = JSON.parse(raw) as unknown;
    return Array.isArray(j) ? j.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify([...new Set(ids)]));
}

export function getSavedResearchIds(): string[] {
  return readIds(SAVED_KEY);
}

export function toggleSavedResearchId(id: string): boolean {
  const cur = readIds(SAVED_KEY);
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  writeIds(SAVED_KEY, next);
  return next.includes(id);
}

export function isResearchSaved(id: string): boolean {
  return readIds(SAVED_KEY).includes(id);
}

export function getResearchReportQueue(): string[] {
  return readIds(REPORT_QUEUE_KEY);
}

export function addResearchToReportQueue(id: string): void {
  const cur = readIds(REPORT_QUEUE_KEY);
  if (!cur.includes(id)) writeIds(REPORT_QUEUE_KEY, [...cur, id]);
}

export function removeResearchFromReportQueue(id: string): void {
  writeIds(
    REPORT_QUEUE_KEY,
    readIds(REPORT_QUEUE_KEY).filter((x) => x !== id),
  );
}
