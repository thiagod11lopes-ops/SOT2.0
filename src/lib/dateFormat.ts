import type { DepartureRecord } from "../types/departure";

/** Formata uma `Date` local como dd/mm/aaaa. */
export function formatDateToPtBr(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
}

/** Data atual no formato dd/mm/aaaa (mesmo padrão do campo Data da Saída no cadastro). */
export function getCurrentDatePtBr() {
  return formatDateToPtBr(new Date());
}

/** Todas as datas locais de segunda a sexta no mês (`monthIndex` 0–11). */
export function getWeekdayDatesInMonth(year: number, monthIndex: number): Date[] {
  const out: Date[] = [];
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(year, monthIndex, day);
    const wd = d.getDay();
    if (wd >= 1 && wd <= 5) out.push(d);
  }
  return out;
}

/** Segunda a sexta no mês civil corrente (do dia 1 ao último dia). */
export function getWeekdayDatesInCurrentMonth(): Date[] {
  const n = new Date();
  return getWeekdayDatesInMonth(n.getFullYear(), n.getMonth());
}

/** Dias úteis (segunda a sexta) entre o dia atual e o fim do mês corrente (inclusive). */
export function getWeekdayDatesFromTodayThroughEndOfCurrentMonth(): Date[] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const startDay = now.getDate();
  const lastDay = new Date(y, m + 1, 0).getDate();
  const out: Date[] = [];
  for (let day = startDay; day <= lastDay; day++) {
    const d = new Date(y, m, day);
    const wd = d.getDay();
    if (wd >= 1 && wd <= 5) out.push(d);
  }
  return out;
}

/** `dd/mm/aaaa` completo (10 caracteres), para filtros e validações. */
export function isCompleteDatePtBr(value: string) {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(value.trim());
}

/**
 * Converte o texto de "data da saída" do formulário para `dd/mm/aaaa` usado no filtro da lista.
 * Aceita valor já mascarado ou só com 8 dígitos.
 */
export function dataSaidaToListFilterPtBr(raw: string): string | null {
  const t = raw.trim();
  if (isCompleteDatePtBr(t)) return t;
  const digits = t.replace(/\D/g, "").slice(0, 8);
  if (digits.length === 8) {
    const n = normalizeDatePtBr(digits);
    if (isCompleteDatePtBr(n)) return n;
  }
  return null;
}

/** Máscara numérica para dd/mm/aaaa durante a digitação. */
export function normalizeDatePtBr(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;

  const day = Math.min(Math.max(Number(digits.slice(0, 2)), 1), 31);
  const month = Math.min(Math.max(Number(digits.slice(2, 4)), 1), 12);
  const year = digits.slice(4, 8);

  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

/** Posição do cursor após `digitsCount` dígitos em `formatted` (dd/mm/aaaa). */
function caretAfterDigitCount(formatted: string, digitsCount: number): number {
  if (digitsCount <= 0) return 0;
  let n = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) {
      n += 1;
      if (n === digitsCount) return i + 1;
    }
  }
  return formatted.length;
}

/**
 * Normaliza data dd/mm/aaaa e calcula onde manter o cursor (evita salto para o fim em inputs controlados).
 */
export function normalizeDatePtBrWithCaret(rawInput: string, selectionStart: number): {
  value: string;
  caret: number;
} {
  const normalized = normalizeDatePtBr(rawInput);
  const start = Math.min(Math.max(0, selectionStart), rawInput.length);
  const digitsBefore = rawInput.slice(0, start).replace(/\D/g, "").length;
  const caret = caretAfterDigitCount(normalized, digitsBefore);
  return { value: normalized, caret: Math.min(caret, normalized.length) };
}

/** Converte yyyy-mm-dd (input type=date) para dd/mm/aaaa para comparar com o cadastro. */
export function isoDateToPtBr(iso: string) {
  if (!iso || iso.length < 10) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
}

/** Interpreta dd/mm/aaaa completo como data local; inválido retorna `undefined`. */
export function parsePtBrToDate(value: string): Date | undefined {
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return undefined;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

/** Ordena datas `dd/mm/aaaa` do mais antigo ao mais recente; ignora entradas incompletas. */
export function sortDatasPtBr(dates: string[]): string[] {
  return [...dates]
    .filter((d) => isCompleteDatePtBr(d))
    .sort((a, b) => {
      const ta = parsePtBrToDate(a)?.getTime() ?? 0;
      const tb = parsePtBrToDate(b)?.getTime() ?? 0;
      return ta - tb;
    });
}

/** dd/mm/aaaa válido → yyyy-mm-dd; inválido retorna string vazia. */
export function ptBrToIsoDate(value: string): string {
  const d = parsePtBrToDate(value.trim());
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Adiciona dias a uma data dd/mm/aaaa completa; inválido devolve o valor original. */
export function addDaysPtBr(value: string, delta: number): string {
  const d = parsePtBrToDate(value.trim());
  if (!d) return value;
  d.setDate(d.getDate() + delta);
  return formatDateToPtBr(d);
}

/** Interpreta yyyy-mm-dd como data local. */
export function parseIsoDateToDate(value: string): Date | undefined {
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

/**
 * `dataSaida` no cadastro (dd/mm/aaaa ou yyyy-mm-dd) representa o mesmo dia civil que `hojePtBr` (dd/mm/aaaa).
 */
export function isDepartureDateSameLocalDay(dataSaida: string, hojePtBr: string): boolean {
  const hoje = parsePtBrToDate(hojePtBr.trim());
  if (!hoje) return false;
  const raw = dataSaida?.trim() ?? "";
  if (!raw) return false;
  const d = parsePtBrToDate(raw) ?? parseIsoDateToDate(raw);
  if (!d) return false;
  return (
    d.getFullYear() === hoje.getFullYear() &&
    d.getMonth() === hoje.getMonth() &&
    d.getDate() === hoje.getDate()
  );
}

/**
 * Data usada para filtrar exportações: **data da saída**; se vazia, **data do pedido**.
 * Aceita dd/mm/aaaa ou yyyy-mm-dd nos campos.
 */
export function getDepartureReferenceDate(record: DepartureRecord): Date | undefined {
  const raw = record.dataSaida?.trim() || record.dataPedido?.trim();
  if (!raw) return undefined;
  return parsePtBrToDate(raw) ?? parseIsoDateToDate(raw);
}
