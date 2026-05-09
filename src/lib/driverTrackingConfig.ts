/**
 * Configuração global de rastreamento de motoristas (intervalo entre envios de GPS).
 * Persistida em Firestore `sot_state/rastreamentoMotoristas` e espelho em localStorage.
 */

export type RastreamentoMotoristasPayload = {
  /** Intervalo entre envios de coordenadas; apenas minutos (UI e mobile). */
  intervaloRastreamentoMinutos: number;
};

export const DEFAULT_INTERVALO_RASTREAMENTO_MINUTOS = 5;
export const INTERVALO_RASTREAMENTO_MIN_MINUTOS = 1;
export const INTERVALO_RASTREAMENTO_MAX_MINUTOS = 720;

export const RASTREAMENTO_MOTORISTAS_LS_KEY = "sot_rastreamento_motoristas_v1";

export function clampIntervaloRastreamentoMinutos(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_INTERVALO_RASTREAMENTO_MINUTOS;
  return Math.min(
    INTERVALO_RASTREAMENTO_MAX_MINUTOS,
    Math.max(INTERVALO_RASTREAMENTO_MIN_MINUTOS, Math.floor(n)),
  );
}

export function normalizeRastreamentoMotoristasPayload(raw: unknown): RastreamentoMotoristasPayload {
  if (!raw || typeof raw !== "object") {
    return { intervaloRastreamentoMinutos: DEFAULT_INTERVALO_RASTREAMENTO_MINUTOS };
  }
  const o = raw as Record<string, unknown>;
  return {
    intervaloRastreamentoMinutos: clampIntervaloRastreamentoMinutos(o.intervaloRastreamentoMinutos),
  };
}

export function loadRastreamentoMotoristasFromLocalStorage(): RastreamentoMotoristasPayload {
  if (typeof localStorage === "undefined") {
    return { intervaloRastreamentoMinutos: DEFAULT_INTERVALO_RASTREAMENTO_MINUTOS };
  }
  try {
    const raw = localStorage.getItem(RASTREAMENTO_MOTORISTAS_LS_KEY);
    if (!raw) return { intervaloRastreamentoMinutos: DEFAULT_INTERVALO_RASTREAMENTO_MINUTOS };
    return normalizeRastreamentoMotoristasPayload(JSON.parse(raw));
  } catch {
    return { intervaloRastreamentoMinutos: DEFAULT_INTERVALO_RASTREAMENTO_MINUTOS };
  }
}

export function persistRastreamentoMotoristasToLocalStorage(p: RastreamentoMotoristasPayload): void {
  if (typeof localStorage === "undefined") return;
  try {
    const next = normalizeRastreamentoMotoristasPayload(p);
    localStorage.setItem(RASTREAMENTO_MOTORISTAS_LS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/** Útil no mobile para `setInterval` / espaçamento de envios. */
export function intervaloRastreamentoMilliseconds(p: RastreamentoMotoristasPayload): number {
  const min = clampIntervaloRastreamentoMinutos(p.intervaloRastreamentoMinutos);
  return min * 60_000;
}
