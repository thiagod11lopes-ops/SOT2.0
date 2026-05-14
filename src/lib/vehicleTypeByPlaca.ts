/**
 * Mapeamento global "placa → tipo de viatura" usado na renderização dos
 * marcadores no Google Maps de navegação. Persistido em Firestore
 * (`sot_state/vehicleTypeByPlaca`), espelho em IndexedDB para uso offline.
 *
 * Tipos disponíveis (3 silhuetas):
 *  - "car"       — carro cinzento (uso geral, viaturas administrativas)
 *  - "ambulance" — corpo branco com cruz vermelha (SAMU, UTI, USA, USB, …)
 *  - "truck"     — camião cinzento (viaturas de carga / utilitários grandes)
 *
 * Convenções:
 *  - Placa é guardada **normalizada** (uppercase, trim, sem espaços extra)
 *    para que o lookup seja idempotente.
 *  - O documento é um simples `Record<placaNormalizada, VehicleType>`.
 *  - Registos sem entrada explícita usam a heurística fallback
 *    (`heuristicVehicleTypeFromText`) ou ficam em "car" por defeito.
 */

export type VehicleType = "car" | "ambulance" | "truck";

export const VEHICLE_TYPES: readonly VehicleType[] = ["car", "ambulance", "truck"] as const;

/** Rótulo PT-BR para a UI. */
export const VEHICLE_TYPE_LABEL: Record<VehicleType, string> = {
  car: "Carro (cinza)",
  ambulance: "Ambulância (branca)",
  truck: "Caminhão (cinza)",
};

/** Documento Firestore — mapa placa→tipo. */
export type VehicleTypeByPlaca = Record<string, VehicleType>;

export const VEHICLE_TYPE_BY_PLACA_LS_KEY = "sot_vehicle_type_by_placa_v1";

/** Normaliza placa para chave do mapa (uppercase + trim). */
export function normalizePlacaKey(raw: string): string {
  return raw.trim().toUpperCase();
}

function isVehicleType(v: unknown): v is VehicleType {
  return v === "car" || v === "ambulance" || v === "truck";
}

/**
 * Sanitiza um payload Firestore/localStorage garantindo que só chaves
 * (placas) não vazias e valores válidos chegam ao estado.
 */
export function normalizeVehicleTypeByPlacaPayload(raw: unknown): VehicleTypeByPlaca {
  if (!raw || typeof raw !== "object") return {};
  const out: VehicleTypeByPlaca = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = normalizePlacaKey(k);
    if (!key) continue;
    if (!isVehicleType(v)) continue;
    out[key] = v;
  }
  return out;
}

export function loadVehicleTypeByPlacaFromLocalStorage(): VehicleTypeByPlaca {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(VEHICLE_TYPE_BY_PLACA_LS_KEY);
    if (!raw) return {};
    return normalizeVehicleTypeByPlacaPayload(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function persistVehicleTypeByPlacaToLocalStorage(p: VehicleTypeByPlaca): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      VEHICLE_TYPE_BY_PLACA_LS_KEY,
      JSON.stringify(normalizeVehicleTypeByPlacaPayload(p)),
    );
  } catch {
    /* ignore */
  }
}

/**
 * Heurística textual usada como fallback quando a placa não está configurada
 * no mapa. Detecta ambulância pelo nome ("ambul", "samu", "uti", "usa",
 * "usb"). Tudo o resto cai em "car". O caso "truck" só é seleccionado
 * explicitamente pelo administrador na aba GPS — não há detecção textual
 * fiável para distinguir camião de carro.
 */
export function heuristicVehicleTypeFromText(text: string | null | undefined): VehicleType {
  const s = (text ?? "").toLowerCase();
  if (
    s.includes("ambul") ||
    s.includes("samu") ||
    /\buti\b/.test(s) ||
    /\busa\b/.test(s) ||
    /\busb\b/.test(s)
  ) {
    return "ambulance";
  }
  return "car";
}

/**
 * Resolve o tipo de viatura para uma placa de saída. Estratégia:
 *  1. Lookup directo no mapa configurado (chave normalizada).
 *  2. Fallback para heurística textual sobre a placa + viaturas livre.
 *
 * @param placa Placa principal extraída do campo viaturas (já trimmed).
 * @param viaturasText Texto completo do campo `viaturas` (todas as placas
 *   ou nomes), usado como input adicional para a heurística.
 * @param map Estado actual do `vehicleTypeByPlaca`.
 */
export function resolveVehicleType(
  placa: string,
  viaturasText: string | null | undefined,
  map: VehicleTypeByPlaca,
): VehicleType {
  const key = normalizePlacaKey(placa);
  if (key && map[key]) return map[key];
  return heuristicVehicleTypeFromText(`${placa} ${viaturasText ?? ""}`);
}
