import { addDaysPtBr, getCurrentDatePtBr, normalizeLegacyDateToPtBr } from "./dateFormat";
import { parseHhMm } from "./timeInput";
import type { DepartureRecord } from "../types/departure";

export const BEST_ADMIN_DEPARTURE_DAY_QUESTION =
  "Qual o melhor dia para cadastro de uma saída administrativa?";

const WINDOW_DAYS = 7;
const HOUR_START = 6;
const HOUR_END = 12;

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
  const windowDates = Array.from({ length: WINDOW_DAYS }, (_, i) => addDaysPtBr(hoje, i));
  const counts = new Map<string, number>(windowDates.map((d) => [d, 0]));

  for (const row of departures) {
    if (row.cancelada || row.tipo !== "Administrativa") continue;
    const data = departureDatePtBr(row);
    if (!counts.has(data) || !isMorningDepartureTime(row.horaSaida)) continue;
    counts.set(data, (counts.get(data) ?? 0) + 1);
  }

  const lines = windowDates.map((date) => {
    const total = counts.get(date) ?? 0;
    const label = total === 1 ? "saída" : "saídas";
    return `• ${date}: ${total} ${label}`;
  });

  const minCount = Math.min(...windowDates.map((d) => counts.get(d) ?? 0));
  const bestDays = windowDates.filter((d) => (counts.get(d) ?? 0) === minCount);

  const bestLabel = minCount === 1 ? "saída" : "saídas";
  const recommendation =
    bestDays.length === 1
      ? `O melhor dia para cadastrar é ${bestDays[0]}, com ${minCount} ${bestLabel} agendada(s) entre 06h e 12h.`
      : `Os melhores dias são ${bestDays.join(" e ")}, cada um com ${minCount} ${bestLabel} no período (06h–12h).`;

  return [
    "Analisei as saídas administrativas nos próximos 7 dias (horário de saída entre 06h e 12h):",
    "",
    ...lines,
    "",
    recommendation,
  ].join("\n");
}
