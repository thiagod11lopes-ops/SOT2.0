export function formatDateToPtBr(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
}

export function getCurrentDatePtBr() {
  return formatDateToPtBr(new Date());
}

export function normalizeDatePtBr(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;

  const day = Math.min(Math.max(Number(digits.slice(0, 2)), 1), 31);
  const month = Math.min(Math.max(Number(digits.slice(2, 4)), 1), 12);
  const year = digits.slice(4, 8);

  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

export function parsePtBrToDate(value: string): Date | undefined {
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return undefined;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

export function ptBrToIsoDate(value: string): string {
  const d = parsePtBrToDate(value.trim());
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDaysPtBr(value: string, delta: number): string {
  const d = parsePtBrToDate(value.trim());
  if (!d) return value;
  d.setDate(d.getDate() + delta);
  return formatDateToPtBr(d);
}
