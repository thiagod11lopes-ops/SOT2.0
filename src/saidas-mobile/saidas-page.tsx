import { useEffect, useMemo, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useDepartures } from "../context/departures-context";
import type { DepartureRecord, DepartureType } from "../types/departure";
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

function nowHhMm() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/** Registo inicial para nova saída de ambulância (mesmos campos que o cadastro principal). */
function newAmbulanciaPayload(dataSaida: string): Omit<DepartureRecord, "id" | "createdAt"> {
  const t = nowHhMm();
  return {
    tipo: "Ambulância",
    dataPedido: dataSaida,
    horaPedido: t,
    dataSaida: dataSaida,
    horaSaida: "",
    setor: "",
    ramal: "",
    objetivoSaida: "",
    numeroPassageiros: "",
    responsavelPedido: "",
    om: "",
    viaturas: "",
    motoristas: "",
    hospitalDestino: "",
    kmSaida: "",
    kmChegada: "",
    chegada: "",
    cidade: "",
    bairro: "",
    rubrica: "",
  };
}

export function SaidasPage({ tipo }: { tipo: DepartureType }) {
  const { departures, updateDepartureKmFields, updateDeparture, addDeparture, removeDeparture } =
    useDepartures();
  const [filterDate, setFilterDate] = useState(() => getCurrentDatePtBr());
  /** Ambulância: saída marcada ao tocar no cartão; só essa pode ser excluída pelo botão. */
  const [selectedAmbulanciaId, setSelectedAmbulanciaId] = useState<string | null>(null);

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
    if (ofTipo.length === 0) {
      return "Nenhuma saída deste tipo. Cadastre no SOT ou importe um backup.";
    }
    if (isCompleteDatePtBr(filterDate) && rows.length === 0) {
      return "Nenhuma saída para esta data.";
    }
    return "Nenhum registo.";
  }, [departures, tipo, filterDate, rows.length]);

  useEffect(() => {
    if (!selectedAmbulanciaId) return;
    if (!rows.some((r) => r.id === selectedAmbulanciaId)) {
      setSelectedAmbulanciaId(null);
    }
  }, [rows, selectedAmbulanciaId]);

  const isoForPicker = ptBrToIsoDate(filterDate);
  const hoje = getCurrentDatePtBr();
  const filtroEhHojeCompleto = isCompleteDatePtBr(filterDate) && filterDate === hoje;
  const podeNovaAmbulancia = filtroEhHojeCompleto;

  function handleNovaAmbulancia() {
    if (!filtroEhHojeCompleto) return;
    addDeparture(newAmbulanciaPayload(filterDate));
  }

  function handleExcluirSaidaAmbulanciaSelecionada() {
    if (!selectedAmbulanciaId) return;
    const target = rows.find((r) => r.id === selectedAmbulanciaId);
    if (!target || target.dataSaida !== hoje) return;
    if (
      !window.confirm(
        "Excluir esta saída de ambulância? Esta ação não pode ser desfeita.",
      )
    ) {
      return;
    }
    removeDeparture(target.id);
    setSelectedAmbulanciaId(null);
  }

  const selectedAmbulanciaRow = selectedAmbulanciaId
    ? rows.find((r) => r.id === selectedAmbulanciaId)
    : undefined;
  const podeExcluirAmbulancia =
    Boolean(selectedAmbulanciaRow) && selectedAmbulanciaRow!.dataSaida === hoje;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold tracking-tight text-[hsl(var(--foreground))]">{titles[tipo]}</h2>

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

      {tipo === "Ambulância" ? (
        <div className="flex w-full flex-row gap-2">
          <button
            type="button"
            disabled={!podeNovaAmbulancia}
            className="flex min-h-12 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-[hsl(var(--primary))]/40 bg-[hsl(var(--primary))]/15 px-2 text-xs font-semibold text-[hsl(var(--primary))] shadow-sm active:scale-[0.99] active:bg-[hsl(var(--primary))]/25 disabled:pointer-events-none disabled:opacity-40 sm:gap-2 sm:px-3 sm:text-sm"
            onClick={handleNovaAmbulancia}
            title={
              podeNovaAmbulancia
                ? undefined
                : "Defina o filtro para o dia de hoje para criar uma nova saída neste separador."
            }
          >
            <Plus className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" aria-hidden />
            <span className="text-center leading-tight">Nova saída de ambulância</span>
          </button>
          <button
            type="button"
            disabled={!podeExcluirAmbulancia}
            className="flex min-h-12 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-red-600/35 bg-red-600/10 px-2 text-xs font-semibold text-red-700 shadow-sm active:scale-[0.99] active:bg-red-600/20 dark:text-red-400 sm:gap-2 sm:px-3 sm:text-sm disabled:pointer-events-none disabled:opacity-40"
            onClick={handleExcluirSaidaAmbulanciaSelecionada}
            title={
              podeExcluirAmbulancia
                ? undefined
                : selectedAmbulanciaRow && selectedAmbulanciaRow.dataSaida !== hoje
                  ? "Só é possível excluir saídas do dia de hoje neste separador."
                  : "Toque numa saída de hoje na lista para a selecionar antes de excluir."
            }
            aria-label="Excluir a saída de ambulância selecionada na lista"
          >
            <Trash2 className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" aria-hidden />
            <span className="text-center leading-tight">Excluir Saída</span>
          </button>
        </div>
      ) : null}

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
          rows.map((r) => {
            const editavelMobile = r.dataSaida === hoje;
            return (
              <li key={r.id}>
                <DepartureCard
                  record={r}
                  allowMobileEdit={editavelMobile}
                  onPatchKm={(patch) => {
                    if (!editavelMobile) return;
                    updateDepartureKmFields(r.id, patch);
                  }}
                  updateDeparture={editavelMobile ? updateDeparture : undefined}
                  isSelectedForExcluir={tipo === "Ambulância" && selectedAmbulanciaId === r.id}
                  onSelectForExcluir={
                    tipo === "Ambulância" && editavelMobile
                      ? () => setSelectedAmbulanciaId(r.id)
                      : undefined
                  }
                />
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
