import { useEffect, useId, useMemo, useState } from "react";
import {
  listMotoristasComServicoOuRotinaNoDia,
  type DetalheServicoMotoristaMarcacao,
} from "../lib/detalheServicoDayMarkers";
import { loadDetalheServicoBundleFromIdb } from "../lib/detalheServicoBundle";
import { ptBrToIsoDate } from "../lib/dateFormat";
import { Button } from "./ui/button";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Data do filtro da lista (dd/mm/aaaa), igual à da tabela. */
  filterDatePtBr: string;
};

function isCompleteDatePtBr(value: string) {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(value);
}

export function DetalheServicoServicoModal({ open, onOpenChange, filterDatePtBr }: Props) {
  const titleId = useId();
  const [items, setItems] = useState<DetalheServicoMotoristaMarcacao[]>([]);
  const [loading, setLoading] = useState(false);

  const isoDate = useMemo(() => ptBrToIsoDate(filterDatePtBr.trim()), [filterDatePtBr]);
  const dateOk = isCompleteDatePtBr(filterDatePtBr.trim()) && isoDate.length > 0;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void loadDetalheServicoBundleFromIdb()
      .then((bundle) => {
        if (cancelled) return;
        if (!dateOk) {
          setItems([]);
          setLoading(false);
          return;
        }
        setItems(listMotoristasComServicoOuRotinaNoDia(bundle, isoDate));
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, isoDate, dateOk]);

  if (!open) return null;

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[280] flex items-end justify-center bg-black/55 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div
        className="flex max-h-[min(90vh,640px)] w-full max-w-lg flex-col rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-2xl sm:max-w-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-[hsl(var(--border))] px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-[hsl(var(--foreground))]">
            Detalhe de Serviço — Serviço e Rotina
          </h2>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Motoristas com <strong className="text-[hsl(var(--foreground))]">S</strong> (serviço) ou{" "}
            <strong className="text-[hsl(var(--foreground))]">RO</strong> (rotina) no dia{" "}
            <span className="font-medium text-[hsl(var(--foreground))]">
              {dateOk ? filterDatePtBr.trim() : "—"}
            </span>
            {dateOk ? null : (
              <span className="block pt-1 text-amber-800 dark:text-amber-200/90">
                Indique uma data de saída completa (dd/mm/aaaa) no campo acima da tabela.
              </span>
            )}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">A carregar…</p>
          ) : !dateOk ? null : items.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Nenhum motorista com S ou RO marcados neste dia na grelha «Detalhe de Serviço» (mês correspondente).
            </p>
          ) : (
            <ul className="space-y-2">
              {items.map((row, i) => (
                <li
                  key={`${row.motorista}-${i}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.08)] px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 font-medium text-[hsl(var(--foreground))]">
                    {row.motorista}
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-[hsl(var(--muted-foreground))]">
                    {row.servico ? (
                      <span className="mr-2 rounded bg-emerald-600/15 px-1.5 py-0.5 font-semibold text-emerald-800 dark:text-emerald-300">
                        S
                      </span>
                    ) : null}
                    {row.rotina ? (
                      <span className="rounded bg-sky-600/15 px-1.5 py-0.5 font-semibold text-sky-900 dark:text-sky-200">
                        RO
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="shrink-0 border-t border-[hsl(var(--border))] px-5 py-3">
          <Button type="button" variant="default" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
