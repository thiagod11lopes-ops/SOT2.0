import type { DepartureRecord } from "../types/departure";

export const SETOR_RAMAL_MEMORY_STORAGE_KEY = "sot-setor-ramal-memory-v1";

export type SetorRamalMemoryEntry = {
  ramal: string;
  updatedAt: number;
};

/** Chave normalizada (setor em minúsculas) → último ramal usado. */
export type SetorRamalMemory = Record<string, SetorRamalMemoryEntry>;

export function normalizeSetorKey(setor: string): string {
  return setor.trim().toLowerCase();
}

export function normalizeSetorRamalMemory(raw: unknown): SetorRamalMemory {
  if (!raw || typeof raw !== "object") return {};
  const result: SetorRamalMemory = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const normalizedKey = normalizeSetorKey(key);
    if (!normalizedKey) continue;
    if (typeof value === "string") {
      const ramal = value.trim();
      if (!ramal) continue;
      result[normalizedKey] = { ramal, updatedAt: 0 };
      continue;
    }
    if (!value || typeof value !== "object") continue;
    const ramal = String((value as SetorRamalMemoryEntry).ramal ?? "").trim();
    if (!ramal) continue;
    const updatedAt = Number((value as SetorRamalMemoryEntry).updatedAt);
    result[normalizedKey] = {
      ramal,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
    };
  }
  return result;
}

export function getRamalForSetor(memory: SetorRamalMemory, setor: string): string | null {
  const key = normalizeSetorKey(setor);
  if (!key) return null;
  const ramal = memory[key]?.ramal?.trim();
  return ramal || null;
}

export function rememberSetorRamal(
  memory: SetorRamalMemory,
  setor: string,
  ramal: string,
  updatedAt = Date.now(),
): SetorRamalMemory {
  const key = normalizeSetorKey(setor);
  const ramalTrim = ramal.trim();
  if (!key || !ramalTrim) return memory;
  return {
    ...memory,
    [key]: { ramal: ramalTrim, updatedAt },
  };
}

/** Incorpora ramais das saídas já cadastradas quando são mais recentes que a memória local. */
export function mergeSetorRamalFromDepartures(
  memory: SetorRamalMemory,
  departures: DepartureRecord[],
): SetorRamalMemory {
  let result = memory;
  for (const d of departures) {
    const setor = d.setor.trim();
    const ramal = d.ramal.trim();
    if (!setor || !ramal) continue;
    const key = normalizeSetorKey(setor);
    const at = d.updatedAt ?? d.createdAt ?? 0;
    const prev = result[key];
    if (!prev || at >= prev.updatedAt) {
      result = rememberSetorRamal(result, setor, ramal, at);
    }
  }
  return result;
}

export function setorRamalMemoryEquals(a: SetorRamalMemory, b: SetorRamalMemory): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    const ea = a[key];
    const eb = b[key];
    if (!eb || ea.ramal !== eb.ramal || ea.updatedAt !== eb.updatedAt) return false;
  }
  return true;
}
