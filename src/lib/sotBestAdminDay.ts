import { addDaysPtBr, getCurrentDatePtBr, normalizeLegacyDateToPtBr, parsePtBrToDate } from "./dateFormat";
import { parseHhMm } from "./timeInput";
import type { DepartureRecord } from "../types/departure";

export const BEST_ADMIN_DEPARTURE_DAY_QUESTION =
  "Qual o melhor dia para cadastro de uma saída administrativa?";

const WINDOW_WEEKDAYS = 7;
const HOUR_START = 6;
const HOUR_END = 12;

const WEEKDAY_NAMES_PT = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
] as const;

function formatDateWithWeekday(datePtBr: string): string {
  const d = parsePtBrToDate(datePtBr);
  if (!d) return datePtBr;
  return `${WEEKDAY_NAMES_PT[d.getDay()]} ${datePtBr}`;
}

function isWeekday(datePtBr: string): boolean {
  const d = parsePtBrToDate(datePtBr);
  if (!d) return false;
  const day = d.getDay();
  return day !== 0 && day !== 6;
}

/** Próximos N dias úteis a partir de `startPtBr` (inclui hoje se for dia útil). */
function getNextWeekdays(startPtBr: string, count: number): string[] {
  const out: string[] = [];
  let cursor = startPtBr;
  let guard = 0;
  while (out.length < count && guard < 90) {
    if (isWeekday(cursor)) out.push(cursor);
    cursor = addDaysPtBr(cursor, 1);
    guard += 1;
  }
  return out;
}

function normalizeQuestion(text: string): string {
  return text.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

export function isBestAdminDepartureDayQuestion(query: string): boolean {
  return normalizeQuestion(query) === normalizeQuestion(BEST_ADMIN_DEPARTURE_DAY_QUESTION);
}

function departureDatePtBr(row: DepartureRecord): string {
  return normalizeLegacyDateToPtBr(row.dataSaida?.trim() || "");
}

function isMorningDepartureTime(horaSaida: string): boolean {
  const time = parseHhMm(horaSaida.trim());
  if (!time) return false;
  const minutes = time.h * 60 + time.m;
  return minutes >= HOUR_START * 60 && minutes <= HOUR_END * 60;
}

export function buildBestAdminDepartureDayAnswer(
  departures: DepartureRecord[],
  hoje = getCurrentDatePtBr(),
): string {
  const windowDates = getNextWeekdays(hoje, WINDOW_WEEKDAYS);
  const counts = new Map<string, number>(windowDates.map((d) => [d, 0]));

  for (const row of departures) {
    if (row.cancelada || row.tipo !== "Administrativa") continue;
    const data = departureDatePtBr(row);
    if (!counts.has(data) || !isMorningDepartureTime(row.horaSaida)) continue;
    counts.set(data, (counts.get(data) ?? 0) + 1);
  }

  const minCount = Math.min(...windowDates.map((d) => counts.get(d) ?? 0));
  const bestDays = new Set(windowDates.filter((d) => (counts.get(d) ?? 0) === minCount));

  const lines = windowDates.map((date) => {
    const total = counts.get(date) ?? 0;
    const label = total === 1 ? "saída" : "saídas";
    const formatted = formatDateWithWeekday(date);
    const dateLabel = bestDays.has(date) ? `**${formatted}**` : formatted;
    return `• ${dateLabel}: ${total} ${label}`;
  });

  const bestLabel = minCount === 1 ? "saída" : "saídas";
  const bestDaysList = [...bestDays];
  const recommendation =
    bestDaysList.length === 1
      ? `Ô de mulher, o melhor dia pra cadastrar é **${formatDateWithWeekday(bestDaysList[0])}** — só ${minCount} ${bestLabel} entre 06h e 12h. Tá safo!`
      : `Os melhores dias são ${bestDaysList.map((d) => `**${formatDateWithWeekday(d)}**`).join(" e ")}, cada um com ${minCount} ${bestLabel} no período (06h–12h). Na mar!`;

  return [
    "Suave, Zé! Olhei as administrativas dos próximos 7 dias úteis (segunda a sexta, saída entre 06h e 12h):",
    "",
    ...lines,
    "",
    recommendation,
  ].join("\n");
}
