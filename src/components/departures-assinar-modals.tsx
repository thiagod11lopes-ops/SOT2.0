import { useEffect, useId, useState } from "react";
import { formatDateToPtBr, sortDatasPtBr } from "../lib/dateFormat";
import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";

type OpcoesModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssinarDiaAtual: () => void;
  onAssinarPeriodosAnteriores: () => void;
};

/** Escolha: assinar só o dia em contexto ou marcar vários dias no calendário. */
export function AssinarOpcoesModal({
  open,
  onOpenChange,
  onAssinarDiaAtual,
  onAssinarPeriodosAnteriores,
}: OpcoesModalProps) {
  const titleId = useId();

  function fechar() {
    onOpenChange(false);
  }

  if (!open) return null;

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[420] flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) fechar();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-[hsl(var(--foreground))]">
          Como pretende assinar?
        </h2>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          Escolha assinar apenas o dia atual da lista ou selecionar vários dias (incluindo anteriores).
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-stretch">
          <Button
            type="button"
            variant="default"
            className="flex-1 rounded-xl"
            onClick={() => {
              onAssinarDiaAtual();
              fechar();
            }}
          >
            Assinar dia atual
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1 rounded-xl"
            onClick={() => {
              onAssinarPeriodosAnteriores();
              fechar();
            }}
          >
            Períodos anteriores
          </Button>
        </div>
        <Button type="button" variant="ghost" size="sm" className="mt-4 w-full" onClick={fechar}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

type PeriodosModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado com datas dd/mm/aaaa ordenadas. */
  onConfirmar: (datasPtBr: string[]) => void;
};

/** Calendário com seleção múltipla: um mês de cada vez, início no mês atual; setas para navegar. */
export function AssinarPeriodosCalendarModal({
  open,
  onOpenChange,
  onConfirmar,
}: PeriodosModalProps) {
  const titleId = useId();
  const [selected, setSelected] = useState<Date[] | undefined>(undefined);
  /** Mês visível (sempre inicia no mês civil atual ao abrir o modal). */
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

  useEffect(() => {
    if (open) {
      setSelected(undefined);
      setCalendarMonth(new Date());
    }
  }, [open]);

  function fechar() {
    onOpenChange(false);
  }

  function handleOk() {
    const dates = selected ?? [];
    if (dates.length === 0) {
      window.alert("Selecione pelo menos um dia no calendário.");
      return;
    }
    const asPt = sortDatasPtBr(dates.map((d) => formatDateToPtBr(d)));
    onConfirmar(asPt);
    fechar();
  }

  if (!open) return null;

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[430] flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) fechar();
      }}
    >
      <div
        className="max-h-[min(90vh,40rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-2xl sm:p-6"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-[hsl(var(--foreground))]">
          Dias a assinar
        </h2>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Toque nos dias em que a assinatura deve aparecer (pode escolher vários). Use as setas para mudar de
          mês. Depois confirme com OK.
        </p>
        <div className="mt-4 flex justify-center">
          <Calendar
            mode="multiple"
            selected={selected}
            onSelect={setSelected}
            month={calendarMonth}
            onMonthChange={setCalendarMonth}
            numberOfMonths={1}
            className="rounded-2xl"
          />
        </div>
        <p className="mt-3 text-center text-xs text-[hsl(var(--muted-foreground))]" aria-live="polite">
          {(() => {
            const n = selected?.length ?? 0;
            if (n === 0) return "Nenhum dia selecionado.";
            return `${n} dia${n === 1 ? "" : "s"} selecionado${n === 1 ? "" : "s"}.`;
          })()}
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="rounded-xl sm:min-w-[7rem]" onClick={fechar}>
            Cancelar
          </Button>
          <Button type="button" variant="default" className="rounded-xl sm:min-w-[7rem]" onClick={handleOk}>
            OK
          </Button>
        </div>
      </div>
    </div>
  );
}
