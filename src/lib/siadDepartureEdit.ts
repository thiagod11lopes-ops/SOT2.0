import type { SiadDayDepartureGroup } from "./siadDayDepartures";
import {
  buildSiadQuickDeparturePayload,
  dedupeBairrosPreserveOrder,
  dedupePassageirosPreserveOrder,
  EMPTY_SIAD_PASSAGEIRO,
  formatSiadObjetivoComPassageiros,
  parsePassageiroLabelToRow,
  type SiadPassageiroRow,
} from "./siadDepartureForm";
import { resolveMetroRioCityForNeighborhood } from "./metroRioLocations";
import { resetSiadDriverRequest } from "./siadDriverRequest";
import { parsePassageirosFromObjetivo } from "./siadStatistics";
import type { DepartureRecord } from "../types/departure";
import type { DepartureUpdatePatch } from "./mergeDepartureUpdate";

function foldBairroKey(value: string): string {
  return value.trim().toLowerCase();
}

export function groupToSiadFormState(
  group: SiadDayDepartureGroup,
  departures: DepartureRecord[],
): {
  horaSaida: string;
  bairros: string[];
  passageiros: SiadPassageiroRow[];
} {
  const sampleRecord = departures.find((row) => group.recordIds.includes(row.id));
  const passageiroLabels =
    group.passageiros.length > 0
      ? group.passageiros
      : sampleRecord
        ? parsePassageirosFromObjetivo(sampleRecord.objetivoSaida)
        : [];

  return {
    horaSaida: group.horaSaida === "—" ? "" : group.horaSaida,
    bairros: group.bairros.length > 0 ? [...group.bairros] : [""],
    passageiros:
      passageiroLabels.length > 0
        ? passageiroLabels.map(parsePassageiroLabelToRow)
        : [{ ...EMPTY_SIAD_PASSAGEIRO }],
  };
}

export function applySiadGroupEdit(params: {
  group: SiadDayDepartureGroup;
  dateSaida: string;
  horaSaida: string;
  bairros: string[];
  passageiros: SiadPassageiroRow[];
  departures: DepartureRecord[];
  addDeparture: (data: Omit<DepartureRecord, "id" | "createdAt">) => string;
  updateDeparture: (id: string, data: DepartureUpdatePatch) => void;
  removeDeparture: (id: string) => void;
}): void {
  const {
    group,
    dateSaida,
    horaSaida,
    bairros,
    passageiros,
    departures,
    addDeparture,
    updateDeparture,
    removeDeparture,
  } = params;

  const date = dateSaida.trim();
  const hora = horaSaida.trim();
  const bairrosPreenchidos = dedupeBairrosPreserveOrder(bairros);
  const passageirosPreenchidos = dedupePassageirosPreserveOrder(passageiros);
  const objetivoSaida = formatSiadObjetivoComPassageiros(passageirosPreenchidos);
  const numeroPassageiros = String(passageirosPreenchidos.length);

  const records = group.recordIds
    .map((id) => departures.find((row) => row.id === id))
    .filter((row): row is DepartureRecord => Boolean(row));

  const existingByBairro = new Map<string, DepartureRecord>();
  for (const record of records) {
    existingByBairro.set(foldBairroKey(record.bairro), record);
  }

  const usedIds = new Set<string>();
  const sharedPatch: DepartureUpdatePatch = {
    dataSaida: date,
    horaSaida: hora,
    objetivoSaida,
    numeroPassageiros,
  };

  for (const bairro of bairrosPreenchidos) {
    const key = foldBairroKey(bairro);
    const existing = existingByBairro.get(key);
    if (existing) {
      updateDeparture(existing.id, {
        ...sharedPatch,
        bairro,
        cidade: resolveMetroRioCityForNeighborhood(bairro),
      });
      usedIds.add(existing.id);
      continue;
    }

    addDeparture(
      buildSiadQuickDeparturePayload({
        dataSaida: date,
        horaSaida: hora,
        endereco: bairro,
        passageiros: passageirosPreenchidos,
      }),
    );
  }

  for (const record of records) {
    if (!usedIds.has(record.id)) {
      removeDeparture(record.id);
    }
  }

  if (group.horaSaida !== "—" && group.horaSaida !== hora) {
    resetSiadDriverRequest(date, group.horaSaida);
  }
}
