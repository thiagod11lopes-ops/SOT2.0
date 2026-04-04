/** Limite de dígitos no campo de quilometragem. */
export const KM_INPUT_MAX_DIGITS = 12;

/**
 * Só dígitos, com `.` como separador de milhar (ex.: 1234567 → 1.234.567).
 * Cola e digitação mista: remove não-dígitos e reformata.
 */
export function formatKmThousandsPtBr(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, KM_INPUT_MAX_DIGITS);
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
