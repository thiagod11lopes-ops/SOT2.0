import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DetalheServicoBundle } from "../lib/detalheServicoBundle";
import {
  buildViaturasPorMotoristaMap,
  collectInspectionIdsForSelectedCalendarDates,
  getVistoriaCalendarDayTintForIso,
  type VistoriaCalendarDayTint,
} from "../lib/vistoriaCalendarTint";
import type { VistoriaAssignment, VistoriaInspection } from "../lib/vistoriaInspectionShared";
import { getVistoriaCloudState, updateVistoriaCloudState } from "../lib/vistoriaCloudState";
import { Button } from "./ui/button";

function startOfLocalMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthLabelPtBr(date: Date): string {
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detalheServicoBundle: DetalheServicoBundle;
  assignments: VistoriaAssignment[];
  inspections: VistoriaInspection[];
};

const WEEKDAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function SettingsVistoriaClearCalendarModal({
  open,
  onOpenChange,
  detalheServicoBundle,
  assignments,
  inspections,
}: Props) {
  const [calendarCursorMonth, setCalendarCursorMonth] = useState(() => startOfLocalMonth(new Date()));
  const [selectedIsos, setSelectedIsos] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);

  const viaturasPorMotorista = useMemo(
    () => buildViaturasPorMotoristaMap(assignments),
    [assignments],
  );

  useEffect(() => {
    if (!open) return;
    setCalendarCursorMonth(startOfLocalMonth(new Date()));
    setSelectedIsos(new Set());
  }, [open]);

  const calendarDays = useMemo(() => {
    const y = calendarCursorMonth.getFullYear();
    const m = calendarCursorMonth.getMonth();
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
  }, [calendarCursorMonth]);

  function toggleIso(iso: string) {
    setSelectedIsos((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      return next;
    });
  }

  function dayTintClass(tint: VistoriaCalendarDayTint): string {
    if (tint === "green") return "border-emerald-500/80 bg-emerald-500 text-white";
    if (tint === "orange") return "border-orange-300/90 bg-orange-200 text-slate-800 dark:text-slate-900";
    if (tint === "red") return "border-red-500/80 bg-red-500 text-white";
    return "border-[hsl(var(--border))] bg-[hsl(var(--muted))/0.25] text-[hsl(var(--foreground))]";
  }

  function handleApagar() {
    if (selectedIsos.size === 0) {
      window.alert("Selecione um ou mais dias no calendário (verde, laranja ou vermelho).");
      return;
    }
    const cloud = getVistoriaCloudState();
    const ids = collectInspectionIdsForSelectedCalendarDates(
      cloud.inspections,
      detalheServicoBundle,
      cloud.assignments,
      [...selectedIsos],
    );
    if (ids.length === 0) {
      window.alert(
        "Não há vistorias a remover para os dias selecionados (nenhum registo que conte para o calendário nessas datas).",
      );
      return;
    }
    if (
      !window.confirm(
        `Serão eliminadas ${ids.length} vistoria(s) relativas ao calendário da Vistoria nos dias escolhidos. Continuar?`,
      )
    ) {
      return;
    }
    const idSet = new Set(ids);
    setBusy(true);
    try {
      updateVistoriaCloudState((prev) => ({
        ...prev,
        inspections: prev.inspections.filter((i) => !idSet.has(i.id)),
        resolvedIssues: prev.resolvedIssues.filter((r) => !idSet.has(r.inspectionId)),
        issueControls: prev.issueControls.filter((c) => !idSet.has(c.inspectionId)),
      }));
      window.alert(`${ids.length} vistoria(s) removida(s).`);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-vistoria-clear-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="settings-vistoria-clear-title" className="text-lg font-semibold text-[hsl(var(--foreground))]">
          Apagar vistorias por dia
        </h2>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Toque nos dias <strong className="text-emerald-600">verde</strong>,{" "}
          <strong className="text-orange-600">laranja</strong> ou <strong className="text-red-600">vermelho</strong> para
          os marcar. Serão removidas as vistorias que contam para o calendário nessas datas (escala com «S» e vínculos
          de viatura). Dias cinzentos não têm escala aplicável aqui.
        </p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            aria-label="Mês anterior"
            onClick={() => setCalendarCursorMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="min-w-0 flex-1 text-center text-sm font-semibold capitalize text-[hsl(var(--foreground))]">
            {monthLabelPtBr(calendarCursorMonth)}
          </p>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            aria-label="Mês seguinte"
            onClick={() => setCalendarCursorMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1.5 text-center text-[0.65rem] font-medium text-[hsl(var(--muted-foreground))]">
          {WEEKDAYS_PT.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1.5">
          {calendarDays.map((cell, idx) => {
            if (!cell.iso || cell.day === null) {
              return <div key={`e-${idx}`} className="h-10" />;
            }
            const isoDay = cell.iso;
            const tint = getVistoriaCalendarDayTintForIso(
              isoDay,
              detalheServicoBundle,
              viaturasPorMotorista,
              inspections,
            );
            const selectable = tint !== "neutral";
            const isSelected = selectedIsos.has(isoDay);
            const stateClass = dayTintClass(tint);
            return (
              <button
                key={isoDay}
                type="button"
                disabled={!selectable || busy}
                title={
                  selectable
                    ? `${isoDay} — ${tint === "green" ? "completo" : tint === "orange" ? "parcial" : "pendente"}`
                    : "Sem escala aplicável neste dia"
                }
                onClick={() => selectable && toggleIso(isoDay)}
                className={`h-10 rounded-lg border text-xs font-semibold shadow-sm transition-all ${stateClass} ${
                  selectable ? "cursor-pointer hover:scale-[1.03]" : "cursor-not-allowed opacity-60"
                } ${isSelected ? "ring-2 ring-[hsl(var(--primary))] ring-offset-2 ring-offset-[hsl(var(--card))]" : ""}`}
              >
                {cell.day}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-xs text-[hsl(var(--muted-foreground))]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-emerald-600 bg-emerald-500" /> Verde — todas vistoriadas
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-orange-300 bg-orange-200" /> Laranja — parcial
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-red-600 bg-red-500" /> Vermelho — nenhuma
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30" /> Cinza — sem dados
          </span>
        </div>

        <p className="mt-2 text-sm text-[hsl(var(--foreground))]">
          {selectedIsos.size === 0 ? (
            <span className="text-[hsl(var(--muted-foreground))]">Nenhum dia selecionado.</span>
          ) : (
            <span>
              {selectedIsos.size} dia(s) selecionado(s).
            </span>
          )}
        </p>

        <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-[hsl(var(--border))] pt-4">
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={busy} onClick={handleApagar}>
            {busy ? "A remover…" : "Apagar vistorias dos dias selecionados"}
          </Button>
        </div>
      </div>
    </div>
  );
}
