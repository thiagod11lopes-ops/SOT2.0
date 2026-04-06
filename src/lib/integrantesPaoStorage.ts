import { idbGetJson, idbSetJson } from "./indexedDb";

const IDB_KEY = "sot-escala-pao-integrantes-v1";
const LEGACY_LS_KEY = "sot-escala-pao-integrantes-v1";

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

function readLegacyLocalStorage(): string[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(LEGACY_LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return dedupeIntegrantesOrder(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return [];
  }
}

function clearLegacyLocalStorage(): void {
  try {
    localStorage.removeItem(LEGACY_LS_KEY);
  } catch {
    /* ignore */
  }
}

export async function loadIntegrantesPaoFromIdb(): Promise<string[]> {
  const v = await idbGetJson<unknown>(IDB_KEY);
  if (Array.isArray(v)) {
    return dedupeIntegrantesOrder(v.filter((x): x is string => typeof x === "string"));
  }
  const leg = readLegacyLocalStorage();
  if (leg.length > 0) {
    await idbSetJson(IDB_KEY, leg);
    clearLegacyLocalStorage();
    return leg;
  }
  return [];
}

export async function saveIntegrantesPaoToIdb(list: string[]): Promise<void> {
  const next = dedupeIntegrantesOrder(list);
  await idbSetJson(IDB_KEY, next, { maxAttempts: 6 });
}
