import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { isoDateToPtBr } from "../lib/dateFormat";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import {
  clearRdvPdfSalvoKeepData,
  getPdfSalvoIsoSet,
  RDV_STORAGE_EVENT,
} from "../lib/relatorioDiarioViaturasStorage";

function startOfLocalMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthLabelPtBr(date: Date): string {
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function clearCarroQuebradoHash() {
  window.location.hash = "";
}

function navigateToRdv(iso: string) {
  window.location.hash = `#/carro-quebrado/dia/${iso}`;
}

export function RelatorioDiarioViaturasCalendarPage() {
  const [month, setMonth] = useState(() => startOfLocalMonth(new Date()));
  const [tick, setTick] = useState(0);
  const [confirmSalvoOpen, setConfirmSalvoOpen] = useState(false);
  const [pendingIso, setPendingIso] = useState<string | null>(null);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const onStorage = () => refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener(RDV_STORAGE_EVENT, onStorage as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(RDV_STORAGE_EVENT, onStorage as EventListener);
    };
  }, [refresh]);

  useEffect(() => {
    if (!confirmSalvoOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setConfirmSalvoOpen(false);
        setPendingIso(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmSalvoOpen]);

  const pdfSalvoSet = useMemo(() => getPdfSalvoIsoSet(), [tick]);

  const calendarDays = useMemo(() => {
    const y = month.getFullYear();
    const m = month.getMonth();
    const first = new Date(y, m, 1);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const pad = first.getDay();
    const total = Math.ceil((pad + daysInMonth) / 7) * 7;
    const out: Array<{ iso: string | null; day: number | null }> = [];
    for (let i = 0; i < total; i++) {
      if (i < pad) {
        out.push({ iso: null, day: null });
        continue;
      }
      const day = i - pad + 1;
      if (day > daysInMonth) {
        out.push({ iso: null, day: null });
        continue;
      }
      const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      out.push({ iso, day });
    }
    return out;
  }, [month]);

  /** Verde só com PDF gerado. Vermelho = tarja PENDENTE (sem PDF salvo), inclusive no dia atual. */
  function dayStateClass(iso: string): string {
    const pdfOk = pdfSalvoSet.has(iso);
    return pdfOk
      ? "border-emerald-500/80 bg-emerald-500 text-white"
      : "border-red-500/80 bg-red-500 text-white";
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={() => clearCarroQuebradoHash()}>
          Voltar ao sistema
        </Button>
      </div>

      <Card>
        <CardHeader className="border-b border-[hsl(var(--border))] bg-gradient-to-r from-[hsl(var(--primary))/0.14] via-[hsl(var(--muted))/0.2] to-[hsl(var(--primary))/0.08]">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-[hsl(var(--primary))]" />
            <CardTitle className="text-lg text-[hsl(var(--primary))]">Relatório Diário de Viaturas</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))/0.15] px-3 py-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setMonth((prev) => startOfLocalMonth(new Date(prev.getFullYear(), prev.getMonth() - 1, 1)))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <p className="text-sm font-semibold capitalize text-[hsl(var(--primary))]">{monthLabelPtBr(month)}</p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setMonth((prev) => startOfLocalMonth(new Date(prev.getFullYear(), prev.getMonth() + 1, 1)))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-[hsl(var(--muted-foreground))]">
            <span>Dom</span>
            <span>Seg</span>
            <span>Ter</span>
            <span>Qua</span>
            <span>Qui</span>
            <span>Sex</span>
            <span>Sáb</span>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {calendarDays.map((cell, idx) => {
              if (!cell.iso || !cell.day) {
                return <div key={`empty-${idx}`} className="h-12 rounded-lg border border-transparent" />;
              }
              const iso = cell.iso;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => {
                    if (pdfSalvoSet.has(iso)) {
                      setPendingIso(iso);
                      setConfirmSalvoOpen(true);
                      return;
                    }
                    navigateToRdv(iso);
                  }}
                  className={`h-12 rounded-lg border text-sm font-semibold shadow-sm transition-all hover:scale-[1.02] ${dayStateClass(iso)}`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {typeof document !== "undefined" &&
        confirmSalvoOpen &&
        pendingIso &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setConfirmSalvoOpen(false);
                setPendingIso(null);
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="rdv-cal-confirm-salvo-title"
              className="w-full max-w-md rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <h2
                id="rdv-cal-confirm-salvo-title"
                className="text-lg font-semibold text-[hsl(var(--foreground))]"
              >
                RDV já concluído
              </h2>
              <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                Já foi gerado PDF para <strong className="font-medium text-[hsl(var(--foreground))]">{isoDateToPtBr(pendingIso)}</strong>. Pode editar o relatório, ou excluir só o registo de PDF gerado: as linhas da planilha mantêm-se e a data fica <strong>vermelha</strong> no calendário (pendente), também no dia atual.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setConfirmSalvoOpen(false);
                    setPendingIso(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-50"
                  onClick={() => {
                    const iso = pendingIso;
                    if (iso) clearRdvPdfSalvoKeepData(iso);
                    setConfirmSalvoOpen(false);
                    setPendingIso(null);
                    refresh();
                  }}
                >
                  Excluir
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    const iso = pendingIso;
                    setConfirmSalvoOpen(false);
                    setPendingIso(null);
                    if (iso) navigateToRdv(iso);
                  }}
                >
                  Editar RDV
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
