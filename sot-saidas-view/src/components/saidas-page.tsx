import { useMemo, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useDepartures } from "../context/departures-provider";
import type { DepartureType } from "../types/departure";
import { addDaysPtBr, getCurrentDatePtBr, normalizeDatePtBr, ptBrToIsoDate } from "../lib/dateFormat";
import { parseHhMm } from "../lib/timeInput";
import { DepartureCard } from "./departure-card";
import { cn } from "../lib/utils";

function isCompleteDatePtBr(value: string) {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(value);
}

function sortKeyHoraSaida(horaSaida: string): number {
  const parsed = parseHhMm(horaSaida);
  if (!parsed) return Number.POSITIVE_INFINITY;
  return parsed.h * 60 + parsed.m;
}

const titles: Record<DepartureType, string> = {
  Administrativa: "Saídas administrativas",
  Ambulância: "Saídas de ambulância",
};

export function SaidasPage({ tipo }: { tipo: DepartureType }) {
  const { departures, updateDepartureKmFields } = useDepartures();
  const [filterDate, setFilterDate] = useState(() => getCurrentDatePtBr());

  const rows = useMemo(() => {
    let list = departures.filter((d) => d.tipo === tipo);
    if (isCompleteDatePtBr(filterDate)) {
      list = list.filter((d) => d.dataSaida === filterDate);
    }
    return [...list].sort((a, b) => {
      const ka = sortKeyHoraSaida(a.horaSaida);
      const kb = sortKeyHoraSaida(b.horaSaida);
      if (ka !== kb) return ka - kb;
      return a.id.localeCompare(b.id);
    });
  }, [departures, tipo, filterDate]);

  const emptyMessage = useMemo(() => {
    const ofTipo = departures.filter((d) => d.tipo === tipo);
    if (ofTipo.length === 0) return "Nenhuma saída deste tipo. Importe um backup ou cadastre no SOT principal.";
    if (isCompleteDatePtBr(filterDate) && rows.length === 0) {
      return "Nenhuma saída para esta data.";
    }
    return "Nenhum registo.";
  }, [departures, tipo, filterDate, rows.length]);

  const isoForPicker = ptBrToIsoDate(filterDate);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-[hsl(var(--foreground))]">{titles[tipo]}</h2>
        <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
          Os mesmos dados das abas do sistema principal (IndexedDB compatível na mesma origem).
        </p>
      </div>

      <div className="rounded-2xl border border-[hsl(var(--border))]/80 bg-[hsl(var(--card))]/50 p-3 shadow-inner">
        <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          Data da saída
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label="Dia anterior"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 text-[hsl(var(--foreground))] active:scale-[0.97]"
            onClick={() => setFilterDate((d) => addDaysPtBr(d, -1))}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <input
            type="text"
            inputMode="numeric"
            value={filterDate}
            onChange={(e) => setFilterDate(normalizeDatePtBr(e.target.value))}
            placeholder="dd/mm/aaaa"
            className="min-h-12 min-w-[9rem] flex-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))]/60 px-3 text-center text-base font-semibold tabular-nums outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/50"
            autoComplete="off"
            aria-label="Data de filtro"
          />
          <button
            type="button"
            aria-label="Dia seguinte"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 text-[hsl(var(--foreground))] active:scale-[0.97]"
            onClick={() => setFilterDate((d) => addDaysPtBr(d, 1))}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <label className="relative flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))]">
            <Calendar className="h-5 w-5" aria-hidden />
            <input
              type="date"
              className="absolute inset-0 cursor-pointer opacity-0"
              value={isoForPicker}
              onChange={(e) => {
                const iso = e.target.value;
                if (!iso || iso.length < 10) return;
                const [y, m, d] = iso.split("-");
                if (y && m && d) setFilterDate(`${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`);
              }}
              aria-label="Abrir calendário"
            />
          </label>
          <button
            type="button"
            className="min-h-12 rounded-xl border border-[hsl(var(--border))] px-4 text-sm font-semibold text-[hsl(var(--primary))] active:bg-[hsl(var(--muted))]/40"
            onClick={() => setFilterDate(getCurrentDatePtBr())}
          >
            Hoje
          </button>
        </div>
      </div>

      <p className="text-center text-sm text-[hsl(var(--muted-foreground))]">
        {isCompleteDatePtBr(filterDate) ? (
          <>
            <span className="font-semibold text-[hsl(var(--foreground))]">{rows.length}</span> saída
            {rows.length === 1 ? "" : "s"} neste dia
          </>
        ) : (
          "Complete a data (dd/mm/aaaa) para filtrar."
        )}
      </p>

      <ul className="flex flex-col gap-3">
        {rows.length === 0 ? (
          <li
            className={cn(
              "rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted))]/15 px-4 py-10 text-center text-sm text-[hsl(var(--muted-foreground))]",
            )}
          >
            {emptyMessage}
          </li>
        ) : (
          rows.map((r) => (
            <li key={r.id}>
              <DepartureCard
                record={r}
                onPatchKm={(patch) => updateDepartureKmFields(r.id, patch)}
              />
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
