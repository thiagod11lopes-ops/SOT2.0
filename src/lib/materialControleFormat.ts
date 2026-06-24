import type { MaterialMovimento } from "./materialControleStorage";

export function formatMaterialDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function materialMovimentoTipoLabel(tipo: MaterialMovimento["tipo"]): string {
  return tipo === "entrada" ? "Entrada" : "Retirada";
}

export function formatMaterialMovimentoResumo(m: MaterialMovimento, itemNome?: string): string {
  const prefix = itemNome ? `${itemNome} · ` : "";
  const obs = m.observacao.trim() ? ` · ${m.observacao.trim()}` : "";
  return `${prefix}${materialMovimentoTipoLabel(m.tipo)} · ${m.quantidade} un. · ${m.responsavel} · ${formatMaterialDateTime(m.at)}${obs}`;
}
