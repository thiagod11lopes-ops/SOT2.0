import {
  isSiadDeparture,
  normalizeSiadDriverRequestHora,
  resetSiadDriverRequest,
} from "./siadDriverRequest";
import type { SiadDayDepartureGroup } from "./siadDayDepartures";
import type { DepartureRecord } from "../types/departure";

/**
 * Remove permanentemente uma saída SIAD agrupada por horário: apaga todos os registros
 * (bairros) e limpa o pedido de motorista do slot, para não restar vestígio nos dados.
 */
export function deleteSiadDepartureGroupCompletely(params: {
  group: SiadDayDepartureGroup;
  dateSaida: string;
  departures: DepartureRecord[];
  removeDeparture: (id: string) => void;
}): void {
  const { group, dateSaida, departures, removeDeparture } = params;
  const date = dateSaida.trim();
  const idsToRemove = new Set(group.recordIds);

  for (const id of group.recordIds) {
    removeDeparture(id);
  }

  if (!date || group.horaSaida === "—") return;

  const stillHasSlotDeparture = departures.some((row) => {
    if (!isSiadDeparture(row) || row.cancelada || idsToRemove.has(row.id)) return false;
    if (row.dataSaida.trim() !== date) return false;
    const hora =
      normalizeSiadDriverRequestHora(row.horaSaida) ?? (row.horaSaida.trim() || "—");
    return hora === group.horaSaida;
  });

  if (!stillHasSlotDeparture) {
    resetSiadDriverRequest(date, group.horaSaida);
  }
}
