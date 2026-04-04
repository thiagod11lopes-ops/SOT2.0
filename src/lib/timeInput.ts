/**
 * Máscara HH:MM (24h) para digitação:
 * - só dígitos (máx. 4);
 * - se o primeiro dígito for 3–9, vira hora 03–09 com zero à esquerda (`9` → `09`);
 * - 1–2 dígitos: hora em digitação (sem ":" até o 3º dígito);
 * - 3 dígitos: insere ":" após os dois primeiros (`12:3`);
 * - 4 dígitos: aplica limite 23:59 e zeros (`09:05`).
 */
/** Interpreta HH:MM (24h) completo; inválido retorna `null`. */
export function parseHhMm(value: string): { h: number; m: number } | null {
  const t = value.trim();
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min) || h > 23 || min > 59) return null;
  return { h, m: min };
}

export function normalize24hTime(value: string) {
  let digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length === 1 && digits[0] >= "3" && digits[0] <= "9") {
    digits = `0${digits[0]}`;
  }
  if (digits.length === 0) return "";
  if (digits.length <= 2) return digits;
  if (digits.length === 3) {
    return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  }
  const h = Math.min(Number(digits.slice(0, 2)), 23);
  const m = Math.min(Number(digits.slice(2, 4)), 59);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

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
 * Normaliza HH:MM e devolve posição do cursor (evita salto para o fim em input controlado).
 */
export function normalize24hTimeWithCaret(rawInput: string, selectionStart: number): {
  value: string;
  caret: number;
} {
  const rawDigits = rawInput.replace(/\D/g, "").slice(0, 4);
  const expandedLeadingHour =
    rawDigits.length === 1 && rawDigits[0] >= "3" && rawDigits[0] <= "9";

  const normalized = normalize24hTime(rawInput);
  const start = Math.min(Math.max(0, selectionStart), rawInput.length);
  const digitsBefore = rawInput.slice(0, start).replace(/\D/g, "").length;

  let caret: number;
  if (expandedLeadingHour && digitsBefore >= 1) {
    // O dígito digitado passa a ser o 2º da hora (ex.: 9 → 09); cursor após esse dígito.
    caret = Math.min(2, normalized.length);
  } else {
    caret = caretAfterDigitCount(normalized, digitsBefore);
  }

  return { value: normalized, caret: Math.min(caret, normalized.length) };
}
