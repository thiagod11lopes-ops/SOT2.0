const STORAGE_KEY = "sot_departures_report_email";

export function getDeparturesReportEmail(): string {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return typeof v === "string" ? v : "";
  } catch {
    return "";
  }
}

export function setDeparturesReportEmail(value: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, value.trim());
  } catch {
    /* ignore */
  }
}

/** Validação simples para evitar mailto inválido. */
export function isPlausibleEmail(value: string): boolean {
  const t = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}
