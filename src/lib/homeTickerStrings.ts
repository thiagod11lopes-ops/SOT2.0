import {
  OLEO_ALERTA_DIAS_PRAZO,
  type StatusTrocaOleo,
} from "./oilMaintenance";

/** Placa com prefixo “Viatura” (telão e card de troca de óleo). */
export function rotuloViaturaPlaca(placa: string): string {
  return `Viatura ${placa.trim()}`;
}

/**
 * Mesma lógica do card “Próximas Trocas de Óleo” no dashboard (prazo 6 meses / km).
 */
export function fraseProximaTrocaOleo(st: StatusTrocaOleo): string {
  const noPrazoSeisMeses =
    st.diasAtePrazo !== null && st.diasAtePrazo <= OLEO_ALERTA_DIAS_PRAZO;
  if (noPrazoSeisMeses) {
    const dias = Math.max(0, st.diasAtePrazo!);
    if (dias === 1) return "Falta 1 dia para o vencimento do Óleo";
    return `Faltam ${dias} dias para o vencimento do Óleo`;
  }
  if (st.kmRestantes !== null) {
    return `Faltam ${st.kmRestantes.toLocaleString("pt-BR")} km para troca de óleo`;
  }
  return "—";
}
