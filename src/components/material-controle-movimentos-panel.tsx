import { History, X } from "lucide-react";
import type { MaterialPlanilha } from "../lib/materialControleStorage";
import {
  formatMaterialDateTime,
  materialMovimentoTipoLabel,
} from "../lib/materialControleFormat";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

type Props = {
  open: boolean;
  onClose: () => void;
  planilha: MaterialPlanilha | null;
};

export function MaterialControleMovimentosPanel({ open, onClose, planilha }: Props) {
  if (!open || !planilha) return null;

  const rows = planilha.items
    .flatMap((item) =>
      item.movimentos.map((m) => ({
        id: m.id,
        itemNome: item.nome,
        movimento: m,
      })),
    )
    .sort((a, b) => b.movimento.at.localeCompare(a.movimento.at));

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[hsl(var(--card))]/98 backdrop-blur-sm">
      <header className="flex shrink-0 items-center gap-3 border-b border-[hsl(var(--border))]/70 px-4 py-3 sm:px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
          <History className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold sm:text-base">Movimentação — {planilha.nome}</h3>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            {rows.length} registo(s) de entrada e retirada
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
        {rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-[hsl(var(--muted-foreground))]">
            Ainda não há movimentação registada nesta planilha.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[hsl(var(--border))]">
            <table className="w-full min-w-[40rem] border-collapse text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40">
                  <th className="px-3 py-2.5 font-semibold">Data/hora</th>
                  <th className="px-3 py-2.5 font-semibold">Tipo</th>
                  <th className="px-3 py-2.5 font-semibold">Material</th>
                  <th className="px-3 py-2.5 font-semibold">Qtd.</th>
                  <th className="px-3 py-2.5 font-semibold">Responsável</th>
                  <th className="px-3 py-2.5 font-semibold">Observações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[hsl(var(--border))]/50 last:border-0 hover:bg-[hsl(var(--muted))]/20"
                  >
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                      {formatMaterialDateTime(row.movimento.at)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase",
                          row.movimento.tipo === "entrada"
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                            : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                        )}
                      >
                        {materialMovimentoTipoLabel(row.movimento.tipo)}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium">{row.itemNome}</td>
                    <td className="px-3 py-2 tabular-nums">{row.movimento.quantidade}</td>
                    <td className="px-3 py-2">{row.movimento.responsavel}</td>
                    <td className="max-w-[14rem] px-3 py-2 text-[hsl(var(--muted-foreground))]">
                      {row.movimento.observacao || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
