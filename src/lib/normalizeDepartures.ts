import type { DepartureRecord } from "../types/departure";

function ambTipoSaidaBools(r: DepartureRecord) {
  const amb = r.tipo === "Ambulância";
  return {
    tipoSaidaInterHospitalar: amb && r.tipoSaidaInterHospitalar === true,
    tipoSaidaAlta: amb && r.tipoSaidaAlta === true,
    tipoSaidaOutros: amb && r.tipoSaidaOutros === true,
  };
}

export function normalizeDepartureRows(value: unknown): DepartureRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is DepartureRecord => {
      if (!row || typeof row !== "object") return false;
      const r = row as Record<string, unknown>;
      return typeof r.id === "string" && !!r.id && (r.tipo === "Administrativa" || r.tipo === "Ambulância");
    })
    .map((row) => {
      const r = row as DepartureRecord;
      return {
        ...r,
        version: typeof r.version === "number" && Number.isFinite(r.version) ? Math.max(0, Math.trunc(r.version)) : 0,
        updatedAt:
          typeof r.updatedAt === "number" && Number.isFinite(r.updatedAt)
            ? Math.max(0, Math.trunc(r.updatedAt))
            : r.createdAt,
        updatedBy: typeof r.updatedBy === "string" ? r.updatedBy : "",
        rubrica: typeof r.rubrica === "string" ? r.rubrica : "",
        cancelada: typeof r.cancelada === "boolean" ? r.cancelada : false,
        ocorrencias: typeof r.ocorrencias === "string" ? r.ocorrencias : "",
        ...ambTipoSaidaBools(r),
      };
    });
}
