import type { DepartureRecord } from "../types/departure";
import { buildPlacaKeysHomeEmAndamentoCard } from "./homeSaidasEmAndamento";

/** Chave estável para cruzar `driver_active_locations.placa` com cadastro (`trim` + maiúsculas). */
export function normalizePlacaKeyDriverMap(placa: string): string {
  return placa.trim().toUpperCase();
}

/**
 * Mantém apenas pinos cuja placa aparece no card **Saídas em Andamento** da página principal
 * (mesmo dia que `dataSaida` = hoje local, não cancelada, KM saída preenchido sem retorno registado).
 */
export function filterDriverLocationPinsPorSaidaIniciada<T extends { placa: string }>(
  pins: readonly T[],
  departures: readonly DepartureRecord[],
): T[] {
  const placasNoCard = buildPlacaKeysHomeEmAndamentoCard(departures);
  if (placasNoCard.size === 0) return [];
  return pins.filter((p) => placasNoCard.has(normalizePlacaKeyDriverMap(p.placa)));
}
