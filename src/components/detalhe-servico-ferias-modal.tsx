import { CalendarRange, Plus, Sparkles, UserRound, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { DetalheServicoFeriasPeriodo } from "../lib/detalheServicoBundle";
import { cn } from "../lib/utils";
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

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

const dateInputClass = cn(
  "h-10 w-full min-w-0 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm tabular-nums text-[hsl(var(--foreground))] shadow-sm",
  "transition-[border-color,box-shadow] placeholder:text-[hsl(var(--muted-foreground))]",
  "focus-visible:border-teal-500/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/20",
);

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
  const descId = useId();
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

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

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
      className="fixed inset-0 z-[265] flex items-center justify-center bg-zinc-950/55 p-4 py-8 backdrop-blur-md sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div
        className={cn(
          "flex max-h-[min(92vh,800px)] w-full max-w-3xl flex-col overflow-hidden rounded-[1.35rem] border border-white/10",
          "bg-[hsl(var(--card))] shadow-[0_32px_90px_-20px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.04)_inset]",
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <header className="relative shrink-0 overflow-hidden border-b border-[hsl(var(--border))]/80">
          <div
            className="absolute inset-0 bg-gradient-to-br from-teal-600/90 via-emerald-700/85 to-cyan-900/90"
            aria-hidden
          />
          <div
            className="absolute inset-0 opacity-[0.12] mix-blend-overlay"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
            aria-hidden
          />
          <div className="relative flex flex-col gap-4 px-5 pb-5 pt-5 sm:flex-row sm:items-start sm:justify-between sm:px-7 sm:pb-6 sm:pt-6">
            <div className="flex min-w-0 flex-1 gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 shadow-inner ring-1 ring-white/20 backdrop-blur-sm">
                <CalendarRange className="h-7 w-7 text-white" strokeWidth={1.75} aria-hidden />
              </div>
              <div className="min-w-0 pt-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id={titleId} className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                    Escala de Férias
                  </h2>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-white/95 ring-1 ring-white/25">
                    <Sparkles className="h-3 w-3 opacity-90" aria-hidden />
                    Detalhe de serviço
                  </span>
                </div>
                <p id={descId} className="mt-2 max-w-xl text-sm leading-relaxed text-white/88">
                  Defina até três períodos por motorista. Comece com um intervalo; use{" "}
                  <span className="font-semibold text-white">Adicionar período</span> para incluir mais. As datas
                  aplicam-se ao mês{" "}
                  <span className="whitespace-nowrap font-semibold text-white">{monthTitle}</span>.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-black/20 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/15">
                    <span className="opacity-80">Mês civil</span>
                    <span className="tabular-nums text-white">{monthYear}</span>
                  </span>
                  <span className="inline-flex items-center rounded-full bg-black/15 px-3 py-1 text-xs text-white/90 ring-1 ring-white/10">
                    Datas limitadas ao mês da grelha
                  </span>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="absolute right-3 top-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/90 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 sm:static sm:right-auto sm:top-auto"
              aria-label="Fechar"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>
        </header>

        {/* Lista */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[hsl(var(--muted)/0.2)] px-4 py-4 sm:px-6 sm:py-5">
          {motoristasCatalog.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
                <UserRound className="h-7 w-7" strokeWidth={1.5} aria-hidden />
              </div>
              <p className="max-w-sm text-sm text-[hsl(var(--muted-foreground))]">
                Não há motoristas no catálogo. Adicione nomes na aba <strong className="text-[hsl(var(--foreground))]">Motoristas</strong>{" "}
                para configurar férias aqui.
              </p>
            </div>
          ) : (
            <ul className="mx-auto flex max-w-2xl flex-col gap-4">
              {motoristasCatalog.map((nome) => {
                const k = normalizeMotoristaKey(nome);
                const triple = draft[k] ?? padThree(feriasForMonth[k]);
                const savedCount = (feriasForMonth[k] ?? []).length;
                const visible =
                  visibleSlotsByMotor[k] ?? Math.min(3, Math.max(1, savedCount));
                const slotsToShow = ([0, 1, 2] as const).slice(0, visible);
                const initials = initialsFromName(nome);

                return (
                  <li key={k}>
                    <article
                      className={cn(
                        "overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]",
                        "shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.04]",
                      )}
                    >
                      <div className="flex items-center gap-3 border-b border-[hsl(var(--border))]/70 bg-[hsl(var(--muted)/0.15)] px-4 py-3 sm:px-5">
                        <div
                          className={cn(
                            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold tabular-nums",
                            "bg-gradient-to-br from-teal-500/20 to-emerald-600/15 text-teal-900 dark:from-teal-400/20 dark:to-emerald-500/10 dark:text-teal-100",
                            "ring-1 ring-teal-600/15 dark:ring-teal-400/20",
                          )}
                          aria-hidden
                        >
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-semibold text-[hsl(var(--foreground))] sm:text-base">
                            {nome}
                          </h3>
                          <p className="text-[11px] text-[hsl(var(--muted-foreground))] sm:text-xs">
                            {visible} de 3 períodos visíveis · datas inclusivas
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3 p-4 sm:p-5">
                        {slotsToShow.map((slot) => (
                          <div
                            key={slot}
                            className={cn(
                              "rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))]/80 p-3 sm:p-4",
                              "ring-1 ring-black/[0.02] dark:ring-white/[0.03]",
                            )}
                          >
                            <div className="mb-3 flex items-center justify-between gap-2">
                              <span className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                                Período {slot + 1}
                              </span>
                              <span className="h-1 w-8 rounded-full bg-gradient-to-r from-teal-500/40 to-emerald-500/30" aria-hidden />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                              <div className="min-w-0 space-y-1.5">
                                <label
                                  htmlFor={`ferias-${k}-s${slot}-i`}
                                  className="block text-xs font-medium text-[hsl(var(--muted-foreground))]"
                                >
                                  Início
                                </label>
                                <input
                                  id={`ferias-${k}-s${slot}-i`}
                                  type="date"
                                  min={min}
                                  max={max}
                                  className={dateInputClass}
                                  value={triple[slot].inicio}
                                  onChange={(e) => updateSlot(k, slot, "inicio", e.target.value)}
                                />
                              </div>
                              <div className="min-w-0 space-y-1.5">
                                <label
                                  htmlFor={`ferias-${k}-s${slot}-f`}
                                  className="block text-xs font-medium text-[hsl(var(--muted-foreground))]"
                                >
                                  Fim
                                </label>
                                <input
                                  id={`ferias-${k}-s${slot}-f`}
                                  type="date"
                                  min={min}
                                  max={max}
                                  className={dateInputClass}
                                  value={triple[slot].fim}
                                  onChange={(e) => updateSlot(k, slot, "fim", e.target.value)}
                                />
                              </div>
                            </div>
                          </div>
                        ))}

                        {visible < 3 ? (
                          <button
                            type="button"
                            className={cn(
                              "flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[hsl(var(--border))]",
                              "bg-transparent py-3 text-sm font-medium text-[hsl(var(--muted-foreground))]",
                              "transition-colors hover:border-teal-500/40 hover:bg-teal-500/[0.06] hover:text-[hsl(var(--foreground))]",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/25",
                            )}
                            aria-label={`Adicionar período de férias para ${nome}`}
                            onClick={() => addVisibleSlot(k)}
                          >
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] ring-1 ring-[hsl(var(--border))]">
                              <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                            </span>
                            Adicionar período
                          </button>
                        ) : null}
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Rodapé */}
        <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-4 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-6">
          <Button type="button" variant="ghost" className="sm:min-w-[7rem]" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={motoristasCatalog.length === 0}
            className={cn(
              "sm:min-w-[9rem]",
              "bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md",
              "hover:from-teal-700 hover:to-emerald-700 hover:text-white",
              "focus-visible:ring-teal-500/40 disabled:opacity-50",
            )}
            onClick={handleSave}
          >
            Guardar alterações
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
