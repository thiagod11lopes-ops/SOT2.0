import {
  BarChart3,
  CalendarRange,
  Clock3,
  FileDown,
  MapPin,
  Scale,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDepartures } from "../context/departures-context";
import { getCurrentDatePtBr } from "../lib/dateFormat";
import {
  computeSiadStatistics,
  describeSiadStatsFilter,
  getSiadAvailableYears,
  isSiadStatsFilterValid,
  SIAD_STATS_MONTH_OPTIONS,
  type SiadStatsFilterMode,
  type SiadStatsFilters,
  type SiadStatsRankEntry,
} from "../lib/siadStatistics";
import { downloadSiadStatisticsPdf } from "../lib/siadStatisticsPdf";
import { sotFormInputCompactClass } from "../lib/sotFormFieldClasses";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

const FILTER_MODES: { value: SiadStatsFilterMode; label: string }[] = [
  { value: "all", label: "Geral" },
  { value: "year", label: "Ano" },
  { value: "month", label: "Mês" },
  { value: "date", label: "Data" },
  { value: "range", label: "Período" },
];

function defaultFilters(): SiadStatsFilters {
  const now = new Date();
  return {
    mode: "all",
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1),
    date: getCurrentDatePtBr(),
    dateStart: getCurrentDatePtBr(),
    dateEnd: getCurrentDatePtBr(),
  };
}

function RankedList({
  title,
  icon,
  entries,
  emptyLabel,
  accentClass,
}: {
  title: string;
  icon: ReactNode;
  entries: SiadStatsRankEntry[];
  emptyLabel: string;
  accentClass: string;
}) {
  const max = entries[0]?.total ?? 1;

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-inner">
      <div className="mb-3 flex items-center gap-2">
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-xl", accentClass)}>{icon}</span>
        <h3 className="text-sm font-semibold tracking-tight text-white">{title}</h3>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-slate-400">{emptyLabel}</p>
      ) : (
        <ol className="space-y-2.5">
          {entries.map((entry, index) => {
            const pct = Math.max(8, Math.round((entry.total / max) * 100));
            return (
              <li key={`${entry.label}-${index}`} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/10 text-[10px] font-bold text-white/90">
                      {index + 1}
                    </span>
                    <span className="truncate font-medium text-slate-100">{entry.label}</span>
                  </span>
                  <span className="shrink-0 tabular-nums font-semibold text-white">{entry.total}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={cn("h-full rounded-full transition-all duration-700 ease-out", accentClass)}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function MetricCard({
  label,
  value,
  hint,
  gradient,
}: {
  label: string;
  value: string | number;
  hint?: string;
  gradient: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/15 p-4 shadow-lg",
        "bg-gradient-to-br",
        gradient,
      )}
    >
      <div className="pointer-events-none absolute -right-4 -top-4 h-16 w-16 rounded-full bg-white/15 blur-xl" />
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/75">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-white/70">{hint}</p> : null}
    </div>
  );
}

export function SiadStatisticsPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { departures } = useDepartures();
  const [filters, setFilters] = useState<SiadStatsFilters>(defaultFilters);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const availableYears = useMemo(() => getSiadAvailableYears(departures), [departures]);
  const filterValid = isSiadStatsFilterValid(filters);
  const stats = useMemo(
    () => (filterValid ? computeSiadStatistics(departures, filters) : null),
    [departures, filters, filterValid],
  );

  const handleGeneratePdf = useCallback(async () => {
    if (!filterValid || !stats || pdfLoading) return;
    setPdfLoading(true);
    try {
      const now = new Date();
      const generatedAtLabel = `Gerado em ${now.toLocaleDateString("pt-BR")} às ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
      await downloadSiadStatisticsPdf({
        filterLabel: describeSiadStatsFilter(filters),
        generatedAtLabel,
        stats,
      });
    } finally {
      setPdfLoading(false);
    }
  }, [filterValid, filters, pdfLoading, stats]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[280] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="siad-stats-title"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-md touch-manipulation"
        aria-label="Fechar estatísticas"
        onClick={onClose}
      />
      <div className="siad-stats-sheet relative flex w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl border border-white/15 bg-gradient-to-br from-slate-950 via-slate-900 to-[hsl(var(--primary)/0.35)] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.85)] sm:max-h-[94dvh] sm:rounded-3xl">
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-white/25 sm:hidden" aria-hidden />
        <div className="pointer-events-none absolute -left-16 top-0 h-48 w-48 rounded-full bg-[hsl(var(--primary)/0.25)] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -right-10 h-56 w-56 rounded-full bg-cyan-400/15 blur-3xl" />

        <header className="relative flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))] sm:px-6 sm:py-4">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 text-cyan-300/90">
              <Scale className="h-4 w-4" aria-hidden />
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em]">Painel SIAD</span>
            </div>
            <h2 id="siad-stats-title" className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              Estatísticas de saídas
            </h2>
            <p className="text-sm text-slate-300">
              {filterValid && stats ? describeSiadStatsFilter(filters) : "Ajuste os filtros para visualizar os dados"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="siad-pwa-touch-target h-11 gap-2 rounded-xl border-white/20 bg-white/10 px-3 text-white hover:bg-white/20 touch-manipulation sm:h-9 sm:px-3"
              disabled={!filterValid || !stats || pdfLoading}
              aria-label="Gerar PDF do balanço"
              onClick={() => void handleGeneratePdf()}
            >
              <FileDown className="h-4 w-4 shrink-0" aria-hidden />
              <span className="text-xs font-semibold sm:text-sm">{pdfLoading ? "Gerando…" : "Gerar PDF"}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="siad-pwa-touch-target h-11 w-11 shrink-0 rounded-xl border-white/20 bg-white/10 text-white hover:bg-white/20 touch-manipulation sm:h-9 sm:w-9"
              aria-label="Fechar painel de estatísticas"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="relative flex-1 space-y-5 overflow-y-auto overscroll-y-contain px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:px-6 sm:py-5">
          <section className="rounded-2xl border border-white/10 bg-black/20 p-3 backdrop-blur-sm sm:p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Filtros</p>
            <div className="siad-stats-filters-scroll">
              {FILTER_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  className={cn(
                    "rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors touch-manipulation",
                    filters.mode === mode.value
                      ? "bg-white text-slate-900 shadow-md"
                      : "bg-white/10 text-slate-200 hover:bg-white/15",
                  )}
                  onClick={() => setFilters((prev) => ({ ...prev, mode: mode.value }))}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(filters.mode === "year" || filters.mode === "month") && (
                <label className="space-y-1.5 text-xs text-slate-300">
                  Ano
                  <select
                    value={filters.year}
                    onChange={(e) => setFilters((prev) => ({ ...prev, year: e.target.value }))}
                    className={cn(sotFormInputCompactClass, "h-11 w-full border-white/15 bg-slate-900/80 text-base text-white sm:h-10 sm:text-sm")}
                  >
                    {availableYears.map((year) => (
                      <option key={year} value={String(year)}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {filters.mode === "month" && (
                <label className="space-y-1.5 text-xs text-slate-300">
                  Mês
                  <select
                    value={filters.month}
                    onChange={(e) => setFilters((prev) => ({ ...prev, month: e.target.value }))}
                    className={cn(sotFormInputCompactClass, "h-11 w-full border-white/15 bg-slate-900/80 text-base text-white sm:h-10 sm:text-sm")}
                  >
                    {SIAD_STATS_MONTH_OPTIONS.map((month) => (
                      <option key={month.value} value={month.value}>
                        {month.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {filters.mode === "date" && (
                <label className="space-y-1.5 text-xs text-slate-300 sm:col-span-2">
                  Data
                  <input
                    type="date"
                    value={
                      filters.date.includes("/")
                        ? `${filters.date.slice(6, 10)}-${filters.date.slice(3, 5)}-${filters.date.slice(0, 2)}`
                        : ""
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      const [y, m, d] = v.split("-");
                      setFilters((prev) => ({ ...prev, date: `${d}/${m}/${y}` }));
                    }}
                    className={cn(sotFormInputCompactClass, "h-11 w-full border-white/15 bg-slate-900/80 text-base text-white sm:h-10 sm:text-sm")}
                  />
                </label>
              )}

              {filters.mode === "range" && (
                <>
                  <label className="space-y-1.5 text-xs text-slate-300">
                    Data início
                    <input
                      type="date"
                      value={
                        filters.dateStart.includes("/")
                          ? `${filters.dateStart.slice(6, 10)}-${filters.dateStart.slice(3, 5)}-${filters.dateStart.slice(0, 2)}`
                          : ""
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return;
                        const [y, m, d] = v.split("-");
                        setFilters((prev) => ({ ...prev, dateStart: `${d}/${m}/${y}` }));
                      }}
                      className={cn(sotFormInputCompactClass, "h-11 w-full border-white/15 bg-slate-900/80 text-base text-white sm:h-10 sm:text-sm")}
                    />
                  </label>
                  <label className="space-y-1.5 text-xs text-slate-300">
                    Data fim
                    <input
                      type="date"
                      value={
                        filters.dateEnd.includes("/")
                          ? `${filters.dateEnd.slice(6, 10)}-${filters.dateEnd.slice(3, 5)}-${filters.dateEnd.slice(0, 2)}`
                          : ""
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return;
                        const [y, m, d] = v.split("-");
                        setFilters((prev) => ({ ...prev, dateEnd: `${d}/${m}/${y}` }));
                      }}
                      className={cn(sotFormInputCompactClass, "h-11 w-full border-white/15 bg-slate-900/80 text-base text-white sm:h-10 sm:text-sm")}
                    />
                  </label>
                </>
              )}
            </div>

            {!filterValid ? (
              <p className="mt-3 text-xs text-amber-300">Preencha os campos do filtro selecionado.</p>
            ) : null}
          </section>

          {stats ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  label="Saídas totais"
                  value={stats.totalSaidas}
                  hint="Registros SIAD no período"
                  gradient="from-[hsl(var(--primary)/0.85)] to-indigo-700/90"
                />
                <MetricCard
                  label="Passageiros"
                  value={stats.totalPassageiros}
                  hint={`Média ${stats.mediaPassageirosPorSaida} por saída`}
                  gradient="from-cyan-600/90 to-blue-800/90"
                />
                <MetricCard
                  label="Bairros distintos"
                  value={stats.bairrosUnicos}
                  hint="Destinos únicos visitados"
                  gradient="from-violet-600/90 to-fuchsia-800/90"
                />
                <MetricCard
                  label="Canceladas"
                  value={stats.saidasCanceladas}
                  hint={stats.saidasCanceladas === 0 ? "Nenhuma no período" : "Saídas marcadas canceladas"}
                  gradient="from-slate-700/95 to-slate-900/95"
                />
              </div>

              <RankedList
                title="Bairros mais visitados"
                icon={<MapPin className="h-4 w-4 text-white" />}
                entries={stats.topBairros}
                emptyLabel="Nenhum bairro registrado no período."
                accentClass="bg-gradient-to-r from-violet-400 to-fuchsia-500"
              />

              <div className="grid gap-4 lg:grid-cols-3">
                <RankedList
                  title="Horários mais usados"
                  icon={<Clock3 className="h-4 w-4 text-white" />}
                  entries={stats.topHorarios}
                  emptyLabel="Sem horários válidos."
                  accentClass="bg-gradient-to-r from-amber-400 to-orange-500"
                />
                <RankedList
                  title="Cidades"
                  icon={<BarChart3 className="h-4 w-4 text-white" />}
                  entries={stats.topCidades}
                  emptyLabel="Sem cidade cadastrada."
                  accentClass="bg-gradient-to-r from-emerald-400 to-teal-500"
                />
                <RankedList
                  title="Saídas por dia da semana"
                  icon={<CalendarRange className="h-4 w-4 text-white" />}
                  entries={stats.porDiaSemana}
                  emptyLabel="Sem dados por dia."
                  accentClass="bg-gradient-to-r from-sky-400 to-indigo-500"
                />
              </div>

              {stats.evolucaoMensal.length > 1 ? (
                <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-r from-[hsl(var(--primary))] to-indigo-500">
                      <TrendingUp className="h-4 w-4 text-white" />
                    </span>
                    <h3 className="text-sm font-semibold text-white">Evolução mensal no período</h3>
                  </div>
                  <div className="flex items-end gap-2 overflow-x-auto pb-1">
                    {stats.evolucaoMensal.map((entry) => {
                      const max = stats.evolucaoMensal.reduce((m, e) => Math.max(m, e.total), 1);
                      const h = Math.max(12, Math.round((entry.total / max) * 96));
                      return (
                        <div key={entry.label} className="flex min-w-[3.25rem] flex-col items-center gap-1">
                          <span className="text-[10px] font-semibold tabular-nums text-white">{entry.total}</span>
                          <div
                            className="w-8 rounded-t-lg bg-gradient-to-t from-[hsl(var(--primary))] to-cyan-400/80"
                            style={{ height: `${h}px` }}
                          />
                          <span className="text-[9px] text-slate-400">{entry.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              <RankedList
                title="Ranque de Profissionais"
                icon={<Users className="h-4 w-4 text-white" />}
                entries={stats.topPassageiros}
                emptyLabel="Nenhum profissional nomeado no período."
                accentClass="bg-gradient-to-r from-cyan-400 to-blue-500"
              />
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
