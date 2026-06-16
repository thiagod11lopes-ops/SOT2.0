import {
  getSiadDriverRequestForSlot,
  isSiadDeparture,
  normalizeSiadDriverRequestHora,
} from "./siadDriverRequest";
import { parsePassageirosFromObjetivo } from "./siadStatistics";
import type { DepartureRecord } from "../types/departure";

function isPlaceholderMotorista(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  return trimmed.toUpperCase() === "ASD";
}

export type SiadDayDepartureGroup = {
  horaSaida: string;
  bairros: string[];
  passageiros: string[];
  motoristaStatus: "none" | "requested" | "confirmed";
  recordIds: string[];
  motoristasEscalados: string[];
};

function dedupePreserveOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.trim());
  }
  return out;
}

export function groupSiadDeparturesForDay(
  departures: DepartureRecord[],
  dateSaida: string,
): SiadDayDepartureGroup[] {
  const date = dateSaida.trim();
  if (!date) return [];

  const byHora = new Map<string, DepartureRecord[]>();
  for (const row of departures) {
    if (!isSiadDeparture(row)) continue;
    if (row.cancelada) continue;
    if (row.dataSaida.trim() !== date) continue;
    const normalized = normalizeSiadDriverRequestHora(row.horaSaida);
    const hora = normalized ?? (row.horaSaida.trim() || "—");
    const list = byHora.get(hora) ?? [];
    list.push(row);
    byHora.set(hora, list);
  }

  return [...byHora.entries()]
    .map(([horaSaida, records]) => {
      const bairros = dedupePreserveOrder(records.map((r) => r.bairro));
      const passageiros = dedupePreserveOrder(
        records.flatMap((r) => parsePassageirosFromObjetivo(r.objetivoSaida)),
      );
      const motoristasEscalados = dedupePreserveOrder(
        records.map((r) => r.motoristas).filter((m) => !isPlaceholderMotorista(m)),
      );
      const slot = getSiadDriverRequestForSlot(date, horaSaida);
      let motoristaStatus: SiadDayDepartureGroup["motoristaStatus"] = "none";
      if (slot?.status === "confirmed") motoristaStatus = "confirmed";
      else if (slot?.status === "requested") motoristaStatus = "requested";

      return {
        horaSaida,
        bairros,
        passageiros,
        motoristaStatus,
        recordIds: records.map((r) => r.id),
        motoristasEscalados,
      };
    })
    .sort((a, b) => a.horaSaida.localeCompare(b.horaSaida, "pt-BR"));
}

/** Motorista escalado no SOT 2.0 para a saída SIAD (data + horário), se houver. */
export function resolveSiadEscalatedMotorista(
  departures: DepartureRecord[],
  dateSaida: string,
  horaSaida: string | null,
): string | null {
  const date = dateSaida.trim();
  if (!date) return null;

  const targetHora = horaSaida ? normalizeSiadDriverRequestHora(horaSaida) : null;

  for (const row of departures) {
    if (!isSiadDeparture(row) || row.cancelada) continue;
    if (row.dataSaida.trim() !== date) continue;
    if (targetHora) {
      const rowHora = normalizeSiadDriverRequestHora(row.horaSaida) ?? row.horaSaida.trim();
      if (rowHora !== targetHora) continue;
    }
    const motorista = row.motoristas.trim();
    if (!isPlaceholderMotorista(motorista)) return motorista;
  }

  return null;
}
