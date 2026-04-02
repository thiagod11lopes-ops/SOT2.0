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

/** Interpreta yyyy-mm-dd como data local. */
export function parseIsoDateToDate(value: string): Date | undefined {
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
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
