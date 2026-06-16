import { Clock3, Sparkles, X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { resolveSiadDriverRequestForSlot } from "../lib/siadDriverRequest";
import type { DepartureRecord } from "../types/departure";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

export function SiadDriverRequestTimePickerModal({
  open,
  dateSaida,
  departures,
  horarios,
  onClose,
  onSelect,
}: {
  open: boolean;
  dateSaida: string;
  departures: DepartureRecord[];
  horarios: string[];
  onClose: () => void;
  onSelect: (horaSaida: string) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[290] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="siad-time-picker-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
        aria-label="Fechar seleção de horário"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-t-3xl border border-orange-200/40 bg-gradient-to-br from-white via-orange-50 to-amber-100 p-6 shadow-[0_32px_80px_-24px_rgba(249,115,22,0.55)] sm:rounded-3xl">
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-orange-300/25 blur-3xl" />
        <div className="relative mb-5 flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-orange-600">
              <Sparkles className="h-4 w-4" aria-hidden />
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em]">Saída SIAD</span>
            </div>
            <h2 id="siad-time-picker-title" className="text-xl font-bold tracking-tight text-slate-900">
              Escolha o horário
            </h2>
            <p className="text-sm text-slate-600">
              Há várias saídas em <strong>{dateSaida}</strong>. Selecione o horário da solicitação.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-xl"
            aria-label="Fechar"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ul className="relative space-y-2">
          {horarios.map((hora) => {
            const slot = resolveSiadDriverRequestForSlot(dateSaida, hora, departures);
            const blocked = slot?.status === "requested" || slot?.status === "confirmed";
            const statusLabel =
              slot?.status === "confirmed"
                ? "Confirmada"
                : slot?.status === "requested"
                  ? "Aguardando"
                  : "Disponível";

            return (
              <li key={hora}>
                <button
                  type="button"
                  disabled={blocked}
                  onClick={() => onSelect(hora)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors touch-manipulation",
                    blocked
                      ? "cursor-not-allowed border-slate-200 bg-slate-100/80 opacity-70"
                      : "border-orange-200/80 bg-white shadow-sm hover:border-orange-300 hover:bg-orange-50/80 active:scale-[0.99]",
                  )}
                >
                  <span className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
                      <Clock3 className="h-5 w-5" aria-hidden />
                    </span>
                    <span>
                      <span className="block text-lg font-bold tabular-nums text-slate-900">{hora}</span>
                      <span className="block text-xs text-slate-500">Horário da saída</span>
                    </span>
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
                      blocked
                        ? slot?.status === "confirmed"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                        : "bg-orange-100 text-orange-800",
                    )}
                  >
                    {statusLabel}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
