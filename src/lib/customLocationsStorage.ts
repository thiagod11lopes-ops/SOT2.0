/** Dados locais de cidades/bairros extras no formulário Cadastrar Nova Saída. */
export const CUSTOM_LOCATIONS_STORAGE_KEY = "sot-register-custom-locations-v1";

export type CustomLocationsState = {
  /** Cidades adicionadas pelo usuário (além da lista fixa da região). */
  extraCities: string[];
  /** Bairros adicionados pelo usuário, por nome da cidade (mesma grafia selecionada no formulário). */
  extraNeighborhoodsByCity: Record<string, string[]>;
};

export const emptyCustomLocations = (): CustomLocationsState => ({
  extraCities: [],
  extraNeighborhoodsByCity: {},
});

export function normalizeCustomLocations(raw: unknown): CustomLocationsState {
  const base = emptyCustomLocations();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Partial<CustomLocationsState>;
  const extraCities = Array.isArray(o.extraCities)
    ? o.extraCities.filter((x): x is string => typeof x === "string")
    : [];
  const extraNeighborhoodsByCity: Record<string, string[]> = {};
  if (o.extraNeighborhoodsByCity && typeof o.extraNeighborhoodsByCity === "object") {
    for (const [k, v] of Object.entries(o.extraNeighborhoodsByCity)) {
      if (typeof k !== "string" || !k.trim()) continue;
      if (!Array.isArray(v)) continue;
      extraNeighborhoodsByCity[k.trim()] = v.filter((x): x is string => typeof x === "string");
    }
  }
  return { extraCities, extraNeighborhoodsByCity };
}

export function mergeUniqueSorted(a: string[], b: string[]): string[] {
  const map = new Map<string, string>();
  for (const x of [...a, ...b]) {
    const t = x.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (!map.has(key)) map.set(key, t);
  }
  return Array.from(map.values()).sort((x, y) => x.localeCompare(y, "pt-BR"));
}

/** Encontra item já existente na lista com mesmo texto (ignorando maiúsculas). */
export function findCanonicalString(name: string, list: string[]): string | null {
  const t = name.trim();
  if (!t) return null;
  const low = t.toLowerCase();
  for (const x of list) {
    if (x.toLowerCase() === low) return x;
  }
  return null;
}

export function findCanonicalCity(name: string, cities: string[]): string | null {
  return findCanonicalString(name, cities);
}
