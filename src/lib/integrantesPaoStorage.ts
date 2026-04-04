const STORAGE_KEY = "sot-escala-pao-integrantes-v1";

/** Preserva ordem; ignora vazios e duplicados (comparação sem distinção de maiúsculas). */
export function dedupeIntegrantesOrder(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

export function getIntegrantesPaoStored(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return dedupeIntegrantesOrder(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return [];
  }
}

export function setIntegrantesPaoStored(list: string[]): void {
  try {
    const next = dedupeIntegrantesOrder(list);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
