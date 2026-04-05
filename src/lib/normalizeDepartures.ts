import type { DepartureRecord } from "../types/departure";

export function normalizeDepartureRows(value: unknown): DepartureRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is DepartureRecord => {
      if (!row || typeof row !== "object") return false;
      const r = row as Record<string, unknown>;
      return typeof r.id === "string" && !!r.id && (r.tipo === "Administrativa" || r.tipo === "Ambulância");
    })
    .map((row) => ({
      ...row,
      rubrica: typeof row.rubrica === "string" ? row.rubrica : "",
    }));
}
