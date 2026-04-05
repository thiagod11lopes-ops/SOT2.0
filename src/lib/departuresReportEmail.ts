/** Validação simples para evitar mailto inválido. */
export function isPlausibleEmail(value: string): boolean {
  const t = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}
