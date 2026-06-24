import { FileDown, Table2, X } from "lucide-react";
import type { MaterialControleDoc } from "../lib/materialControleStorage";
import {
  formatMaterialDateTime,
  materialMovimentoTipoLabel,
} from "../lib/materialControleFormat";
import { downloadMaterialControleBalancoPdf } from "../lib/materialControlePdf";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

type Props = {
  open: boolean;
  onClose: () => void;
  doc: MaterialControleDoc;
};

export function MaterialControleBalancoPanel({ open, onClose, doc }: Props) {
  if (!open) return null;

  function handlePdf() {
    if (doc.planilhas.length === 0) {
      window.alert("Não há planilhas para gerar o balanço.");
      return;
    }
    downloadMaterialControleBalancoPdf(doc);
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[hsl(var(--card))]/98 backdrop-blur-sm">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[hsl(var(--border))]/70 px-4 py-3 sm:px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
          <Table2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold sm:text-base">Balanço de material</h3>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Todas as planilhas · stock e movimentação
          </p>
        </div>
        <Button type="button" size="sm" onClick={handlePdf}>
          <FileDown className="mr-1.5 h-3.5 w-3.5" />
          Gerar PDF
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
        {doc.planilhas.length === 0 ? (
          <p className="py-12 text-center text-sm text-[hsl(var(--muted-foreground))]">
            Nenhuma planilha para exibir.
          </p>
        ) : (
          <div className="space-y-8">
            {doc.planilhas.map((planilha) => {
              const movRows = planilha.items
                .flatMap((item) =>
                  item.movimentos.map((m) => ({ id: m.id, itemNome: item.nome, movimento: m })),
                )
                .sort((a, b) => b.movimento.at.localeCompare(a.movimento.at));

              return (
                <section key={planilha.id} className="space-y-3">
                  <h4 className="text-sm font-semibold text-[hsl(var(--primary))]">{planilha.nome}</h4>

                  <div className="overflow-x-auto rounded-xl border border-[hsl(var(--border))]">
                    <p className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                      Stock atual
                    </p>
                    <table className="w-full min-w-[32rem] border-collapse text-left text-xs sm:text-sm">
                      <thead>
                        <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/25">
                          <th className="px-3 py-2 font-semibold">Material</th>
                          <th className="px-3 py-2 font-semibold">Qtd.</th>
                          <th className="px-3 py-2 font-semibold">Unidade</th>
                          <th className="px-3 py-2 font-semibold">Estado</th>
                          <th className="px-3 py-2 font-semibold">Obs.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {planilha.items.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-3 py-4 text-[hsl(var(--muted-foreground))]">
                              Sem itens.
                            </td>
                          </tr>
                        ) : (
                          planilha.items.map((it) => (
                            <tr
                              key={it.id}
                              className="border-b border-[hsl(var(--border))]/50 last:border-0"
                            >
                              <td className="px-3 py-2 font-medium">{it.nome}</td>
                              <td className="px-3 py-2 tabular-nums">{it.quantidade}</td>
                              <td className="px-3 py-2">{it.unidade || "—"}</td>
                              <td className="px-3 py-2">
                                {it.status === "baixa" ? "Baixa" : "Ativo"}
                              </td>
                              <td className="px-3 py-2 text-[hsl(var(--muted-foreground))]">
                                {it.observacao || "—"}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-[hsl(var(--border))]">
                    <p className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                      Movimentação
                    </p>
                    {movRows.length === 0 ? (
                      <p className="px-3 py-4 text-xs text-[hsl(var(--muted-foreground))]">
                        Sem movimentação registada.
                      </p>
                    ) : (
                      <table className="w-full min-w-[40rem] border-collapse text-left text-xs sm:text-sm">
                        <thead>
                          <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/25">
                            <th className="px-3 py-2 font-semibold">Data/hora</th>
                            <th className="px-3 py-2 font-semibold">Tipo</th>
                            <th className="px-3 py-2 font-semibold">Material</th>
                            <th className="px-3 py-2 font-semibold">Qtd.</th>
                            <th className="px-3 py-2 font-semibold">Responsável</th>
                            <th className="px-3 py-2 font-semibold">Obs.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {movRows.map((row) => (
                            <tr
                              key={row.id}
                              className="border-b border-[hsl(var(--border))]/50 last:border-0"
                            >
                              <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                                {formatMaterialDateTime(row.movimento.at)}
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className={cn(
                                    "text-[0.65rem] font-semibold uppercase",
                                    row.movimento.tipo === "entrada"
                                      ? "text-emerald-700 dark:text-emerald-400"
                                      : "text-amber-700 dark:text-amber-400",
                                  )}
                                >
                                  {materialMovimentoTipoLabel(row.movimento.tipo)}
                                </span>
                              </td>
                              <td className="px-3 py-2">{row.itemNome}</td>
                              <td className="px-3 py-2 tabular-nums">{row.movimento.quantidade}</td>
                              <td className="px-3 py-2">{row.movimento.responsavel}</td>
                              <td className="px-3 py-2 text-[hsl(var(--muted-foreground))]">
                                {row.movimento.observacao || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
