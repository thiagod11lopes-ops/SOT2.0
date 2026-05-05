import {
  OLEO_ALERTA_DIAS_PRAZO,
  OLEO_ALERTA_KM_RESTANTES,
  type StatusTrocaOleo,
} from "./oilMaintenance";

/** Placa com prefixo “Viatura” (telão e card de troca de óleo). */
export function rotuloViaturaPlaca(placa: string): string {
  return `Viatura ${placa.trim()}`;
}

/** Alerta por intervalo de 6 meses (mesmo limiar do dashboard). */
export function fraseProximaTrocaOleoPorIntervaloTempo(st: StatusTrocaOleo): string | null {
  const noPrazoSeisMeses =
    st.diasAtePrazo !== null && st.diasAtePrazo <= OLEO_ALERTA_DIAS_PRAZO;
  if (!noPrazoSeisMeses) return null;
  const dias = Math.max(0, st.diasAtePrazo!);
  if (dias === 1) return "Falta 1 dia para o vencimento do Óleo";
  return `Faltam ${dias} dias para o vencimento do Óleo`;
}

/** Alerta por quilometragem (mesmo limiar do dashboard). */
export function fraseProximaTrocaOleoPorKmRodados(st: StatusTrocaOleo): string | null {
  if (st.kmRestantes === null) return null;
  if (st.kmRestantes >= OLEO_ALERTA_KM_RESTANTES) return null;
  return `Faltam ${st.kmRestantes.toLocaleString("pt-BR")} km para troca de óleo`;
}

/**
 * Mesma lógica do card “Próximas Trocas de Óleo” no dashboard (prioriza prazo, depois km).
 */
export function fraseProximaTrocaOleo(st: StatusTrocaOleo): string {
  return fraseProximaTrocaOleoPorIntervaloTempo(st) ?? fraseProximaTrocaOleoPorKmRodados(st) ?? "—";
}
