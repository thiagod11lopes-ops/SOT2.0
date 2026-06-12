export type AppearanceMode = "original" | "dark" | "ultra-modern" | "radar";

export const APPEARANCE_IDB_KEY = "sot-appearance";
export const APPEARANCE_LS_KEY = "sot-appearance";

export type AppearanceRecord = {
  mode: AppearanceMode;
  updatedAt: number;
};

export function isAppearanceMode(v: unknown): v is AppearanceMode {
  return v === "dark" || v === "ultra-modern" || v === "original" || v === "radar";
}

/** Aceita string legada, objeto `{ mode }` ou `{ mode, updatedAt }`. */
export function parseAppearanceRecord(raw: unknown): AppearanceRecord | null {
  if (isAppearanceMode(raw)) {
    return { mode: raw, updatedAt: 0 };
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const mode = o.mode;
  if (!isAppearanceMode(mode)) return null;
  const updatedAt = Number(o.updatedAt);
  return {
    mode,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : 0,
  };
}

export function mergeAppearanceRecords(
  a: AppearanceRecord | null,
  b: AppearanceRecord | null,
): AppearanceRecord {
  if (!a) return b ?? { mode: "original", updatedAt: 0 };
  if (!b) return a;
  if (b.updatedAt > a.updatedAt) return b;
  if (a.updatedAt > b.updatedAt) return a;
  return a;
}

export function readAppearanceFromLocalStorage(): AppearanceRecord | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(APPEARANCE_LS_KEY);
    if (!raw) return null;
    if (raw.startsWith("{")) {
      return parseAppearanceRecord(JSON.parse(raw));
    }
    return parseAppearanceRecord(raw);
  } catch {
    return null;
  }
}

export function writeAppearanceToLocalStorage(record: AppearanceRecord): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(APPEARANCE_LS_KEY, JSON.stringify(record));
  } catch {
    /* ignore */
  }
}

export function appearanceRecordEquals(a: AppearanceRecord, b: AppearanceRecord): boolean {
  return a.mode === b.mode && a.updatedAt === b.updatedAt;
}
