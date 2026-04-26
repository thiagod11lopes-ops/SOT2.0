import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { DetalheServicoFeriasPeriodo } from "../lib/detalheServicoBundle";
import { Button } from "./ui/button";

function parseMonthInput(value: string): { year: number; monthIndex: number } {
  const [y, m] = value.split("-").map(Number);
  return { year: y, monthIndex: (m || 1) - 1 };
}

function monthRangeIso(monthYear: string): { min: string; max: string } {
  const { year, monthIndex } = parseMonthInput(monthYear);
  const last = new Date(year, monthIndex + 1, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    min: `${monthYear}-01`,
    max: `${monthYear}-${pad(last)}`,
  };
}

function normalizeMotoristaKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

function emptySlot(): DetalheServicoFeriasPeriodo {
  return { inicio: "", fim: "" };
}

function padThree(periods: DetalheServicoFeriasPeriodo[] | undefined): [
  DetalheServicoFeriasPeriodo,
  DetalheServicoFeriasPeriodo,
  DetalheServicoFeriasPeriodo,
] {
  const list = [...(periods ?? [])].slice(0, 3);
  while (list.length < 3) list.push(emptySlot());
  return [list[0]!, list[1]!, list[2]!];
}

export type FeriasDraftByMotorKey = Record<string, DetalheServicoFeriasPeriodo[]>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  monthYear: string;
  monthTitle: string;
  /** Motoristas do catálogo (nomes de exibição), ordenados. */
  motoristasCatalog: string[];
  feriasForMonth: FeriasDraftByMotorKey;
  onSave: (next: FeriasDraftByMotorKey) => void;
};

export function DetalheServicoFeriasModal({
  open,
  onOpenChange,
  monthYear,
  monthTitle,
  motoristasCatalog,
  feriasForMonth,
  onSave,
}: Props) {
  const titleId = useId();
  const { min, max } = useMemo(() => monthRangeIso(monthYear), [monthYear]);

  const [draft, setDraft] = useState<
    Record<string, [DetalheServicoFeriasPeriodo, DetalheServicoFeriasPeriodo, DetalheServicoFeriasPeriodo]>
  >({});
  /** Quantas linhas de período mostrar por motorista (1–3); inicia em 1 ou igual aos períodos já guardados. */
  const [visibleSlotsByMotor, setVisibleSlotsByMotor] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!open) return;
    const next: Record<
      string,
      [DetalheServicoFeriasPeriodo, DetalheServicoFeriasPeriodo, DetalheServicoFeriasPeriodo]
    > = {};
    const vis: Record<string, number> = {};
    for (const name of motoristasCatalog) {
      const k = normalizeMotoristaKey(name);
      next[k] = padThree(feriasForMonth[k]);
      const savedCount = (feriasForMonth[k] ?? []).length;
      vis[k] = Math.min(3, Math.max(1, savedCount));
    }
    setDraft(next);
    setVisibleSlotsByMotor(vis);
  }, [open, motoristasCatalog, feriasForMonth]);

  if (!open) return null;

  function updateSlot(motorKey: string, slot: 0 | 1 | 2, field: "inicio" | "fim", value: string) {
    setDraft((prev) => {
      const row = prev[motorKey] ?? padThree(undefined);
      const copy: [DetalheServicoFeriasPeriodo, DetalheServicoFeriasPeriodo, DetalheServicoFeriasPeriodo] = [
        { ...row[0] },
        { ...row[1] },
        { ...row[2] },
      ];
      copy[slot] = { ...copy[slot], [field]: value };
      return { ...prev, [motorKey]: copy };
    });
  }

  function addVisibleSlot(motorKey: string) {
    setVisibleSlotsByMotor((prev) => ({
      ...prev,
      [motorKey]: Math.min(3, (prev[motorKey] ?? 1) + 1),
    }));
  }

  function handleSave() {
    const out: FeriasDraftByMotorKey = {};
    for (const name of motoristasCatalog) {
      const k = normalizeMotoristaKey(name);
      const triple = draft[k] ?? padThree(undefined);
      const periods: DetalheServicoFeriasPeriodo[] = [];
      for (const p of triple) {
        const ini = p.inicio.trim();
        const fim = p.fim.trim();
        if (!ini || !fim) continue;
        periods.push({ inicio: ini, fim: fim });
      }
      if (periods.length > 0) out[k] = periods;
    }
    onSave(out);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[265] flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div
        className="flex max-h-[min(92vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[0_24px_70px_rgba(10,10,40,0.35)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-[hsl(var(--border))] px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-[hsl(var(--foreground))]">
            Escala de Férias
          </h2>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Um período por motorista; use <span className="font-medium text-[hsl(var(--foreground))]">+</span> para
            acrescentar até três no total (datas inclusivas). O mês da grelha é{" "}
            <span className="font-medium text-[hsl(var(--foreground))]">{monthTitle}</span> — as datas ficam
            limitadas a esse mês civil.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {motoristasCatalog.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Não há motoristas no catálogo. Adicione motoristas na aba correspondente.
            </p>
          ) : (
            <ul className="space-y-4">
              {motoristasCatalog.map((nome) => {
                const k = normalizeMotoristaKey(nome);
                const triple = draft[k] ?? padThree(feriasForMonth[k]);
                const savedCount = (feriasForMonth[k] ?? []).length;
                const visible =
                  visibleSlotsByMotor[k] ?? Math.min(3, Math.max(1, savedCount));
                const slotsToShow = ([0, 1, 2] as const).slice(0, visible);
                return (
                  <li
                    key={k}
                    className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.06)] px-3 py-3"
                  >
                    <div className="mb-2 text-sm font-semibold text-[hsl(var(--foreground))]">{nome}</div>
                    <div className="space-y-2">
                      {slotsToShow.map((slot) => (
                        <div
                          key={slot}
                          className="flex flex-wrap items-center gap-2 text-xs sm:text-sm"
                        >
                          <span className="w-16 shrink-0 text-[hsl(var(--muted-foreground))]">
                            {slot + 1}º
                          </span>
                          <label className="flex min-w-0 flex-1 items-center gap-1">
                            <span className="shrink-0 text-[hsl(var(--muted-foreground))]">De</span>
                            <input
                              type="date"
                              min={min}
                              max={max}
                              className="min-w-0 flex-1 rounded-md border border-[hsl(var(--border))] bg-white px-2 py-1 text-[hsl(var(--foreground))]"
                              value={triple[slot].inicio}
                              onChange={(e) => updateSlot(k, slot, "inicio", e.target.value)}
                            />
                          </label>
                          <label className="flex min-w-0 flex-1 items-center gap-1">
                            <span className="shrink-0 text-[hsl(var(--muted-foreground))]">a</span>
                            <input
                              type="date"
                              min={min}
                              max={max}
                              className="min-w-0 flex-1 rounded-md border border-[hsl(var(--border))] bg-white px-2 py-1 text-[hsl(var(--foreground))]"
                              value={triple[slot].fim}
                              onChange={(e) => updateSlot(k, slot, "fim", e.target.value)}
                            />
                          </label>
                        </div>
                      ))}
                    </div>
                    {visible < 3 ? (
                      <div className="mt-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 min-w-8 px-0 font-semibold tabular-nums"
                          aria-label={`Adicionar período de férias para ${nome}`}
                          onClick={() => addVisibleSlot(k)}
                        >
                          +
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.12)] px-5 py-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={motoristasCatalog.length === 0}>
            Guardar
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
