import type { DepartureRecord } from "../types/departure";
import { primaryPlacaFromViaturasField } from "./viaturaPlaca";

/**
 * Estado «Iniciada» para o mapa de rastreamento: há KM saída e a saída ainda não
 * foi finalizada (KM+chegada ou fluxo oficina com rubrica). Alinhado a
 * `departure-card.tsx` e ao filtro em `navigation-fullscreen-modal.tsx`.
 */
export function departureTemSaidaIniciadaParaMapaRastreamento(d: DepartureRecord): boolean {
  if (d.cancelada) return false;
  const kmSaidaPreenchido = d.kmSaida.trim().length > 0;
  if (!kmSaidaPreenchido) return false;
  const kmChegadaPreenchido = d.kmChegada.trim().length > 0;
  const chegadaPreenchido = d.chegada.trim().length > 0;
  const ficouNaOficina = d.ficouNaOficina === true && d.rubrica.trim().length > 0;
  const saidaFinalizada = (kmChegadaPreenchido && chegadaPreenchido) || ficouNaOficina;
  return !saidaFinalizada;
}

/** Chave estável para cruzar `driver_active_locations.placa` com cadastro (`trim` + maiúsculas). */
export function normalizePlacaKeyDriverMap(placa: string): string {
  return placa.trim().toUpperCase();
}

/** Placas (normalizadas) com pelo menos uma saída «Iniciada» em `departures`. */
export function buildPlacaKeysComSaidaIniciada(departures: readonly DepartureRecord[]): Set<string> {
  const set = new Set<string>();
  for (const d of departures) {
    if (!departureTemSaidaIniciadaParaMapaRastreamento(d)) continue;
    const k = normalizePlacaKeyDriverMap(primaryPlacaFromViaturasField(d.viaturas));
    if (k) set.add(k);
  }
  return set;
}

/** Mantém apenas pinos cuja placa corresponde a uma saída em curso (não finalizada nem apagada da lista). */
export function filterDriverLocationPinsPorSaidaIniciada<T extends { placa: string }>(
  pins: readonly T[],
  departures: readonly DepartureRecord[],
): T[] {
  const iniciadas = buildPlacaKeysComSaidaIniciada(departures);
  if (iniciadas.size === 0) return [];
  return pins.filter((p) => iniciadas.has(normalizePlacaKeyDriverMap(p.placa)));
}
