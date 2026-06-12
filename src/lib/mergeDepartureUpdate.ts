import type { DepartureRecord } from "../types/departure";

/** Campos parciais aceites em `updateDeparture` (evita sobrescrever com snapshot stale). */
export type DepartureUpdatePatch = Partial<Omit<DepartureRecord, "id" | "createdAt">>;

const COMPLETION_STRING_FIELDS = [
  "kmSaida",
  "kmChegada",
  "chegada",
  "rubrica",
  "ocorrencias",
  "ocorrenciasRubrica",
] as const satisfies ReadonlyArray<keyof DepartureRecord>;

function hasText(value: unknown): boolean {
  return String(value ?? "").trim().length > 0;
}

/**
 * Funde um patch sobre o registo actual sem regredir dados de conclusão da saída
 * (KM, chegada, rubrica…) quando o patch traz strings vazias por snapshot desatualizado.
 */
export function mergeDeparturePatch(
  current: DepartureRecord,
  patch: DepartureUpdatePatch,
): DepartureRecord {
  const merged: DepartureRecord = {
    ...current,
    ...patch,
    id: current.id,
    createdAt: current.createdAt,
  };

  for (const key of COMPLETION_STRING_FIELDS) {
    if (!(key in patch)) continue;
    if (hasText(current[key]) && !hasText(patch[key])) {
      merged[key] = current[key];
    }
  }

  if (
    current.ficouNaOficina === true &&
    patch.ficouNaOficina === false &&
    !hasText(patch.kmChegada) &&
    !hasText(patch.chegada)
  ) {
    merged.ficouNaOficina = true;
  }

  if (patch.rubrica !== undefined && hasText(patch.rubrica)) {
    merged.rubrica = patch.rubrica;
  }

  return merged;
}

/** Pontuação simples de «quão finalizada» está a saída (para resolver conflitos de sync). */
export function departureCompletionScore(record: DepartureRecord): number {
  let score = 0;
  if (hasText(record.kmSaida)) score += 1;
  if (hasText(record.kmChegada) && hasText(record.chegada)) score += 3;
  if (record.ficouNaOficina === true && hasText(record.rubrica)) score += 3;
  else if (hasText(record.rubrica)) score += 2;
  if (hasText(record.ocorrencias)) score += 1;
  return score;
}

export function isDepartureFinalizada(record: DepartureRecord): boolean {
  const kmSaida = hasText(record.kmSaida);
  const normal =
    kmSaida && hasText(record.kmChegada) && hasText(record.chegada) && hasText(record.rubrica);
  const oficina =
    kmSaida && record.ficouNaOficina === true && hasText(record.rubrica);
  return normal || oficina;
}
