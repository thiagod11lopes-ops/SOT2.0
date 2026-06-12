import { groupDeparturesForListDisplay, type DepartureRecord } from "../types/departure";
import { getCurrentDatePtBr, isDepartureDateSameLocalDay } from "./dateFormat";
import { parseHhMm } from "./timeInput";
import { primaryPlacaFromViaturasField } from "./viaturaPlaca";

/**
 * KM saída preenchido, KM chegada e hora de chegada vazios — **mesmo critério**
 * do card «Saídas em Andamento» na página principal (`dashboard.tsx`).
 * Oficina só conta como finalizada quando há rubrica (como no dashboard).
 */
export function saidaEmAndamentoHomeCard(r: DepartureRecord): boolean {
  const finalizadaPorOficinaRubricada =
    r.kmSaida.trim().length > 0 && r.ficouNaOficina === true && r.rubrica.trim().length > 0;
  if (finalizadaPorOficinaRubricada) return false;
  return (
    r.kmSaida.trim().length > 0 &&
    r.kmChegada.trim().length === 0 &&
    r.chegada.trim().length === 0
  );
}

/** Saída não cancelada, data de saída = dia indicado, e critério `saidaEmAndamentoHomeCard`. */
export function departureMatchesHomeEmAndamentoCard(
  r: DepartureRecord,
  dataSaidaEsperadaDdMmYyyy: string,
): boolean {
  if (r.cancelada === true) return false;
  if (!isDepartureDateSameLocalDay(r.dataSaida, dataSaidaEsperadaDdMmYyyy)) return false;
  return saidaEmAndamentoHomeCard(r);
}

function sortKeyHoraSaida(hora: string): number {
  const parsed = parseHhMm(hora);
  if (!parsed) return Number.POSITIVE_INFINITY;
  return parsed.h * 60 + parsed.m;
}

/** Mesma lista que alimenta o card na home — ordenação igual ao dashboard. */
export function saidasEmAndamentoHojeRecords(
  rows: readonly DepartureRecord[],
  hojeDdMmYyyy: string,
): DepartureRecord[] {
  return rows
    .filter((r) => isDepartureDateSameLocalDay(r.dataSaida, hojeDdMmYyyy))
    .filter((r) => saidaEmAndamentoHomeCard(r))
    .sort((a, b) => {
      const ka = sortKeyHoraSaida(a.horaSaida);
      const kb = sortKeyHoraSaida(b.horaSaida);
      if (ka !== kb) return ka - kb;
      return a.id.localeCompare(b.id);
    });
}

/**
 * Grupos em andamento na home — agrupa antes de filtrar (mesma viatura, motorista e horário),
 * usando o registo primário do grupo (alinhado com as listas de saídas).
 */
export function saidasEmAndamentoGruposHoje(
  rows: readonly DepartureRecord[],
  hojeDdMmYyyy: string,
): ReturnType<typeof groupDeparturesForListDisplay> {
  const doDia = rows
    .filter((r) => isDepartureDateSameLocalDay(r.dataSaida, hojeDdMmYyyy))
    .sort((a, b) => {
      const ka = sortKeyHoraSaida(a.horaSaida);
      const kb = sortKeyHoraSaida(b.horaSaida);
      if (ka !== kb) return ka - kb;
      return a.id.localeCompare(b.id);
    });
  return groupDeparturesForListDisplay(doDia).filter((g) => saidaEmAndamentoHomeCard(g.primary));
}

function normalizePlacaKey(p: string): string {
  return p.trim().toUpperCase();
}

/**
 * Placas presentes no card «Saídas em Andamento» da página principal (hoje local,
 * registos não cancelados).
 */
export function buildPlacaKeysHomeEmAndamentoCard(departures: readonly DepartureRecord[]): Set<string> {
  const hoje = getCurrentDatePtBr();
  const set = new Set<string>();
  for (const d of departures) {
    if (!departureMatchesHomeEmAndamentoCard(d, hoje)) continue;
    const k = normalizePlacaKey(primaryPlacaFromViaturasField(d.viaturas));
    if (k) set.add(k);
  }
  return set;
}
