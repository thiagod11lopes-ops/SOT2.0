import {
  normalizeRastreamentoMotoristasPayload,
  intervaloRastreamentoMilliseconds,
  type RastreamentoMotoristasPayload,
  DEFAULT_INTERVALO_RASTREAMENTO_MINUTOS,
} from "./driverTrackingConfig";
import { postDriverLocation } from "./driverLocationPost";
import { isFirebaseConfigured } from "./firebase/config";
import { SOT_STATE_DOC, subscribeSotStateDoc } from "./firebase/sotStateFirestore";

let cachedRastreamento: RastreamentoMotoristasPayload = {
  intervaloRastreamentoMinutos: DEFAULT_INTERVALO_RASTREAMENTO_MINUTOS,
};

let configUnsubscribe: (() => void) | undefined;

/** Subscreve o intervalo configurado pelo desktop (Firestore). Chamar ao montar o shell mobile. */
export function subscribeMobileDriverTrackingConfig(): () => void {
  configUnsubscribe?.();
  configUnsubscribe = undefined;
  if (!isFirebaseConfigured()) {
    return () => {};
  }

  configUnsubscribe = subscribeSotStateDoc(
    SOT_STATE_DOC.rastreamentoMotoristas,
    (payload) => {
      if (payload == null) return;
      cachedRastreamento = normalizeRastreamentoMotoristasPayload(payload);
    },
    (err) => console.error("[SOT mobile] subscription rastreamentoMotoristas:", err),
  );

  return () => {
    configUnsubscribe?.();
    configUnsubscribe = undefined;
  };
}

export function getCachedRastreamentoMotoristasPayload(): RastreamentoMotoristasPayload {
  return cachedRastreamento;
}

type ActiveSession = {
  recordId: string;
  watchId: number;
  intervalId: ReturnType<typeof setInterval>;
};

let active: ActiveSession | null = null;
let lastPos: { lat: number; lng: number } | null = null;

function clearSessionLocks() {
  if (active) {
    navigator.geolocation.clearWatch(active.watchId);
    window.clearInterval(active.intervalId);
    active = null;
  }
}

/** Encerra só se esta saída for a que iniciou o rastreamento. */
export function stopMobileDriverTrackingSessionIfMatches(recordId: string): void {
  if (active?.recordId === recordId) {
    clearSessionLocks();
    lastPos = null;
  }
}

export function geolocationUnavailableMessage(): string {
  return "Geolocalização não está disponível neste navegador.";
}

/** Primeira leitura para pedir permissão e falhar cedo se o motorista bloquear o GPS. */
export function ensureGeolocationPermission(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.reject(new Error(geolocationUnavailableMessage()));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve(),
      (err) => reject(err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  });
}

function isGeolocationPositionError(e: unknown): e is GeolocationPositionError {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    typeof (e as GeolocationPositionError).code === "number"
  );
}

export function formatGeolocationBlockMessage(err: unknown): string {
  if (isGeolocationPositionError(err) && err.code === err.PERMISSION_DENIED) {
    return "Não é possível iniciar a viagem sem localização. Ative o GPS e permita o acesso à localização neste site (definições do navegador).";
  }
  if (isGeolocationPositionError(err) && err.code === err.POSITION_UNAVAILABLE) {
    return "Não foi possível obter a posição. Verifique se o GPS está ligado e tente novamente.";
  }
  if (isGeolocationPositionError(err) && err.code === err.TIMEOUT) {
    return "Tempo esgotado ao obter a localização. Tente novamente em local com melhor sinal de GPS.";
  }
  return "Não foi possível usar a geolocalização. Tente novamente.";
}

/**
 * Inicia `watchPosition` e envia coordenadas por POST no intervalo (minutos) da configuração.
 * Substitui qualquer sessão anterior.
 */
export async function startMobileDriverTrackingSession(args: { recordId: string; placa: string }): Promise<void> {
  clearSessionLocks();
  lastPos = null;

  await ensureGeolocationPermission();

  const intervalMs = intervaloRastreamentoMilliseconds(getCachedRastreamentoMotoristasPayload());

  const tick = () => {
    if (!lastPos) return;
    void postDriverLocation({
      placa: args.placa,
      latitude: lastPos.lat,
      longitude: lastPos.lng,
      departureId: args.recordId,
    }).catch((e) => {
      console.warn("[SOT mobile] postDriverLocation:", e);
    });
  };

  /** O primeiro `tick()` síncrono corria com `lastPos` ainda null (GPS só chega no callback). Enviamos na primeira posição real. */
  let sentOnceFromWatch = false;

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      lastPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (!sentOnceFromWatch) {
        sentOnceFromWatch = true;
        tick();
      }
    },
    (err) => {
      console.warn("[SOT mobile] watchPosition:", err.code, err.message);
    },
    { enableHighAccuracy: true, maximumAge: 25_000, timeout: 30_000 },
  );

  const intervalId = window.setInterval(tick, intervalMs);
  tick();

  active = { recordId: args.recordId, watchId, intervalId };
}
