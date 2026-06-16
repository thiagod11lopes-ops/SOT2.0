import { isCompleteDatePtBr, parsePtBrToDate } from "./dateFormat";
import { parseHhMm } from "./timeInput";
import type { DepartureRecord } from "../types/departure";

export type SiadStatsRankEntry = { label: string; total: number };

export type SiadStatsFilterMode = "all" | "year" | "month" | "date" | "range";

export type SiadStatsFilters = {
  mode: SiadStatsFilterMode;
  year: string;
  month: string;
  date: string;
  dateStart: string;
  dateEnd: string;
};

export type SiadStatisticsSnapshot = {
  totalSaidas: number;
  totalPassageiros: number;
  mediaPassageirosPorSaida: number;
  saidasCanceladas: number;
  bairrosUnicos: number;
  topPassageiros: SiadStatsRankEntry[];
  topBairros: SiadStatsRankEntry[];
  topCidades: SiadStatsRankEntry[];
  topHorarios: SiadStatsRankEntry[];
  porDiaSemana: SiadStatsRankEntry[];
  evolucaoMensal: SiadStatsRankEntry[];
};

export const SIAD_STATS_MONTH_OPTIONS = [
  { value: "1", label: "Janeiro" },
  { value: "2", label: "Fevereiro" },
  { value: "3", label: "Março" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Maio" },
  { value: "6", label: "Junho" },
  { value: "7", label: "Julho" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
] as const;

const WEEKDAY_LABELS_PT = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
] as const;

function normalizeSectorKey(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/~/g, "")
    .toLowerCase();
}

function parseDepartureDate(value: string): Date | undefined {
  const raw = value.trim();
  if (!raw) return undefined;
  return parsePtBrToDate(raw);
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function isSiadDeparture(row: DepartureRecord): boolean {
  return normalizeSectorKey(row.setor) === "siad" && row.tipo === "Administrativa";
}

/** Extrai nomes/postos a partir de «Atendimento domiciliar — Passageiros: …». */
export function parsePassageirosFromObjetivo(objetivo: string): string[] {
  const match = objetivo.match(/Passageiros:\s*(.+)$/i);
  if (!match) return [];
  const listPart = match[1].trim();
  if (!listPart) return [];
  return listPart
    .split(/,\s*|\s+e\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

const NAO_INFORMADOS_LABEL = "Não informados";

function hasAsdPlaceholder(value: string): boolean {
  return value.trim().toUpperCase().includes("ASD");
}

function normalizeSiadStatsPlaceLabel(raw: string): string {
  const t = raw.trim();
  if (!t || hasAsdPlaceholder(t)) return NAO_INFORMADOS_LABEL;
  return t;
}

function foldBairroKey(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeBairroLabel(raw: string): string {
  const t = raw.trim();
  if (!t || hasAsdPlaceholder(t)) return NAO_INFORMADOS_LABEL;
  const f = foldBairroKey(t);
  if (/\bdicamp\w*\b/i.test(f) || /di\s*-?\s*camp\b/i.test(f)) return "Campo Grande";
  if (/\bcemeru\w*\b/i.test(f) || /ce\s*-?\s*meru\b/i.test(f)) return "Santa Cruz";
  if (f === "campo grande" || f.startsWith("campo grande ")) return "Campo Grande";
  if (f === "santa cruz" || f.startsWith("santa cruz ")) return "Santa Cruz";
  return t;
}

function normalizeCidadeLabel(raw: string): string {
  return normalizeSiadStatsPlaceLabel(raw);
}

function toRanking(map: Map<string, number>, limit = 10): SiadStatsRankEntry[] {
  return [...map.entries()]
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => (b.total !== a.total ? b.total - a.total : a.label.localeCompare(b.label, "pt-BR")))
    .slice(0, limit);
}

function parsePassengerCount(row: DepartureRecord): number {
  const fromField = Number.parseInt(row.numeroPassageiros.trim(), 10);
  if (Number.isFinite(fromField) && fromField > 0) return fromField;
  const parsed = parsePassageirosFromObjetivo(row.objetivoSaida);
  return parsed.length > 0 ? parsed.length : 0;
}

export function collectSiadDepartures(departures: DepartureRecord[]): DepartureRecord[] {
  return departures.filter(isSiadDeparture);
}

export function getSiadAvailableYears(departures: DepartureRecord[]): number[] {
  const years = new Set<number>();
  for (const row of collectSiadDepartures(departures)) {
    const d = parseDepartureDate(row.dataSaida);
    if (d) years.add(d.getFullYear());
  }
  const current = new Date().getFullYear();
  years.add(current);
  return [...years].sort((a, b) => b - a);
}

export function matchesSiadStatsFilters(row: DepartureRecord, filters: SiadStatsFilters): boolean {
  const departureDate = parseDepartureDate(row.dataSaida);
  if (!departureDate) return filters.mode === "all";

  const ts = startOfDay(departureDate);

  switch (filters.mode) {
    case "all":
      return true;
    case "year": {
      const year = Number.parseInt(filters.year, 10);
      if (!Number.isFinite(year)) return true;
      return departureDate.getFullYear() === year;
    }
    case "month": {
      const year = Number.parseInt(filters.year, 10);
      const month = Number.parseInt(filters.month, 10);
      if (!Number.isFinite(year) || !Number.isFinite(month)) return true;
      return departureDate.getFullYear() === year && departureDate.getMonth() + 1 === month;
    }
    case "date": {
      const exact = parsePtBrToDate(filters.date.trim());
      if (!exact) return false;
      return ts === startOfDay(exact);
    }
    case "range": {
      const start = parsePtBrToDate(filters.dateStart.trim());
      const end = parsePtBrToDate(filters.dateEnd.trim());
      if (!start || !end) return false;
      const startTs = startOfDay(start);
      const endTs = startOfDay(end);
      const min = Math.min(startTs, endTs);
      const max = Math.max(startTs, endTs);
      return ts >= min && ts <= max;
    }
    default:
      return true;
  }
}

export function filterSiadDepartures(
  departures: DepartureRecord[],
  filters: SiadStatsFilters,
): DepartureRecord[] {
  return collectSiadDepartures(departures).filter((row) => matchesSiadStatsFilters(row, filters));
}

export function computeSiadStatistics(
  departures: DepartureRecord[],
  filters: SiadStatsFilters,
): SiadStatisticsSnapshot {
  const rows = filterSiadDepartures(departures, filters);

  const passageiroCounts = new Map<string, number>();
  const bairroCounts = new Map<string, number>();
  const cidadeCounts = new Map<string, number>();
  const horarioCounts = new Map<string, number>();
  const weekdayCounts = new Map<string, number>();
  const monthlyCounts = new Map<string, number>();

  let totalPassageiros = 0;
  let saidasCanceladas = 0;

  for (const row of rows) {
    if (row.cancelada) saidasCanceladas += 1;

    const count = parsePassengerCount(row);
    totalPassageiros += count;

    for (const passageiro of parsePassageirosFromObjetivo(row.objetivoSaida)) {
      const key = passageiro.trim();
      if (!key) continue;
      passageiroCounts.set(key, (passageiroCounts.get(key) ?? 0) + 1);
    }

    const bairro = normalizeBairroLabel(row.bairro);
    bairroCounts.set(bairro, (bairroCounts.get(bairro) ?? 0) + 1);

    const cidade = normalizeCidadeLabel(row.cidade);
    cidadeCounts.set(cidade, (cidadeCounts.get(cidade) ?? 0) + 1);

    const hora = parseHhMm(row.horaSaida.trim());
    if (hora) {
      const label = `${String(hora.h).padStart(2, "0")}:${String(hora.m).padStart(2, "0")}`;
      horarioCounts.set(label, (horarioCounts.get(label) ?? 0) + 1);
    }

    const d = parseDepartureDate(row.dataSaida);
    if (d) {
      const weekday = WEEKDAY_LABELS_PT[d.getDay()] ?? "—";
      weekdayCounts.set(weekday, (weekdayCounts.get(weekday) ?? 0) + 1);
      const monthKey = `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
      monthlyCounts.set(monthKey, (monthlyCounts.get(monthKey) ?? 0) + 1);
    }
  }

  const totalSaidas = rows.length;
  const mediaPassageirosPorSaida =
    totalSaidas > 0 ? Math.round((totalPassageiros / totalSaidas) * 10) / 10 : 0;

  const porDiaSemana = [...weekdayCounts.entries()]
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => {
      const order = [...WEEKDAY_LABELS_PT];
      return order.indexOf(a.label as (typeof WEEKDAY_LABELS_PT)[number]) -
        order.indexOf(b.label as (typeof WEEKDAY_LABELS_PT)[number]);
    });

  const evolucaoMensal = [...monthlyCounts.entries()]
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => {
      const [ma, ya] = a.label.split("/");
      const [mb, yb] = b.label.split("/");
      const ka = `${ya}-${ma}`;
      const kb = `${yb}-${mb}`;
      return ka.localeCompare(kb);
    });

  return {
    totalSaidas,
    totalPassageiros,
    mediaPassageirosPorSaida,
    saidasCanceladas,
    bairrosUnicos: bairroCounts.size,
    topPassageiros: toRanking(passageiroCounts, 12),
    topBairros: toRanking(bairroCounts, 12),
    topCidades: toRanking(cidadeCounts, 8),
    topHorarios: toRanking(horarioCounts, 6),
    porDiaSemana,
    evolucaoMensal,
  };
}

export function describeSiadStatsFilter(filters: SiadStatsFilters): string {
  switch (filters.mode) {
    case "all":
      return "Todo o período";
    case "year":
      return filters.year ? `Ano ${filters.year}` : "Ano";
    case "month": {
      const monthLabel =
        SIAD_STATS_MONTH_OPTIONS.find((m) => m.value === filters.month)?.label ?? filters.month;
      return filters.year && filters.month ? `${monthLabel} de ${filters.year}` : "Mês";
    }
    case "date":
      return isCompleteDatePtBr(filters.date) ? `Dia ${filters.date}` : "Data";
    case "range":
      if (isCompleteDatePtBr(filters.dateStart) && isCompleteDatePtBr(filters.dateEnd)) {
        return `${filters.dateStart} — ${filters.dateEnd}`;
      }
      return "Período";
    default:
      return "Filtro";
  }
}

export function isSiadStatsFilterValid(filters: SiadStatsFilters): boolean {
  switch (filters.mode) {
    case "all":
    case "year":
      return true;
    case "month":
      return Boolean(filters.year && filters.month);
    case "date":
      return isCompleteDatePtBr(filters.date);
    case "range":
      return isCompleteDatePtBr(filters.dateStart) && isCompleteDatePtBr(filters.dateEnd);
    default:
      return true;
  }
}
