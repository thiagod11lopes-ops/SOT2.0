import { Capacitor, registerPlugin } from "@capacitor/core";
import type {
  BackgroundGeolocationPlugin,
  Location as CapLocation,
  CallbackError as CapCallbackError,
} from "@capacitor-community/background-geolocation";
import {
  normalizeRastreamentoMotoristasPayload,
  intervaloRastreamentoMilliseconds,
  type RastreamentoMotoristasPayload,
  DEFAULT_INTERVALO_RASTREAMENTO_MINUTOS,
} from "./driverTrackingConfig";
import { getFirebaseIdTokenForFunctions, postDriverLocation, resolveDriverLocationPostUrl } from "./driverLocationPost";
import { isFirebaseConfigured } from "./firebase/config";
import { SOT_STATE_DOC, subscribeSotStateDoc } from "./firebase/sotStateFirestore";
import { NativeScheduledLocationPost } from "./nativeScheduledLocationPost";
import { loadActiveMobileMotorista } from "./mobileMotoristaCredentials";
import { writeMotoristaActiveAssignment } from "./motoristaActiveAssignment";

/**
 * Plugin nativo Capacitor para localização em background (foreground service Android, modo
 * `location` em background no iOS). Em web normal `Capacitor.isNativePlatform()` retorna
 * `false` e o objecto fica unused — não há custo.
 */
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");

function runningInsideCapacitorNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

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

/** Sentinela de WakeLock; tipado de forma permissiva para tolerar diferenças entre browsers. */
type WakeLockHandle = { release: () => Promise<void> } | null;

type ActiveSession = {
  recordId: string;
  placa: string;
  /** `number` quando vem de `navigator.geolocation.watchPosition`. */
  watchId: number | null;
  /** `string` quando vem do plugin nativo Capacitor (`addWatcher`). */
  nativeWatcherId: string | null;
  worker: Worker | null;
  workerObjectUrl: string | null;
  /** No browser `window.setInterval` devolve um `number` (timer id). */
  fallbackIntervalId: number | null;
  intervalMs: number;
  /** Última tentativa de envio ao servidor (respeita `intervaloRastreamento`). */
  lastPostedAt: number;
  silentAudio: HTMLAudioElement | null;
  wakeLock: WakeLockHandle;
  visibilityHandler: (() => void) | null;
  online: boolean;
};

let active: ActiveSession | null = null;

/**
 * Quando `true`, o envio periódico em Android fica a cargo do `AlarmManager` nativo
 * (evita duplicar com `fetch` no WebView). Até lá mantém-se envio via JS (primeira fix).
 */
let androidNativeLocationAlarmActive = false;
let lastPos: { lat: number; lng: number; capturedAt: number } | null = null;

const TRACKING_EVENT_NAME = "sot-mobile-tracking-changed";

function notifyTrackingChanged(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(TRACKING_EVENT_NAME));
  } catch {
    /* ignore */
  }
}

export type ActiveTrackingInfo = {
  recordId: string;
  placa: string;
  startedAt: number;
} | null;

let activeInfo: ActiveTrackingInfo = null;

export function getActiveTrackingInfo(): ActiveTrackingInfo {
  return activeInfo;
}

export function subscribeActiveTrackingChange(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(TRACKING_EVENT_NAME, listener);
  return () => window.removeEventListener(TRACKING_EVENT_NAME, listener);
}

function safeReleaseWakeLock(handle: WakeLockHandle): void {
  if (!handle) return;
  try {
    void handle.release().catch(() => {});
  } catch {
    /* ignore */
  }
}

function clearSessionLocks() {
  if (!active) return;
  androidNativeLocationAlarmActive = false;
  try {
    if (runningInsideCapacitorNative() && Capacitor.getPlatform() === "android") {
      void NativeScheduledLocationPost.stop().catch(() => {});
    }
  } catch {
    /* ignore: plugin só existe no APK Android */
  }
  if (active.watchId !== null) {
    try {
      navigator.geolocation.clearWatch(active.watchId);
    } catch {
      /* ignore */
    }
  }
  if (active.nativeWatcherId !== null) {
    const id = active.nativeWatcherId;
    void BackgroundGeolocation.removeWatcher({ id }).catch((e) => {
      console.warn("[SOT mobile] removeWatcher native:", e);
    });
  }
  if (active.worker) {
    try {
      active.worker.postMessage({ type: "stop" });
    } catch {
      /* ignore */
    }
    try {
      active.worker.terminate();
    } catch {
      /* ignore */
    }
  }
  if (active.workerObjectUrl) {
    try {
      URL.revokeObjectURL(active.workerObjectUrl);
    } catch {
      /* ignore */
    }
  }
  if (active.fallbackIntervalId !== null) {
    clearInterval(active.fallbackIntervalId);
  }
  if (active.silentAudio) {
    try {
      active.silentAudio.pause();
      active.silentAudio.src = "";
      active.silentAudio.removeAttribute("src");
      active.silentAudio.load();
    } catch {
      /* ignore */
    }
  }
  safeReleaseWakeLock(active.wakeLock);
  if (active.visibilityHandler && typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", active.visibilityHandler);
  }
  active = null;
  activeInfo = null;
  notifyTrackingChanged();
}

/**
 * Encerra só se esta saída for a que iniciou o rastreamento.
 *
 * Nota: **NÃO** limpamos a `motorista_active_assignments` aqui automaticamente. Há duas razões:
 *  1. O OwnTracks pode estar a executar em paralelo (iPhone bloqueado) e queremos que continue a
 *     registar até o user explicitamente terminar o turno (mudando OwnTracks para Quiet).
 *  2. Esta função pode ser chamada por engano durante remount/visibility changes; limpá-la aqui
 *     causaria perda da atribuição sem ter sido pedido pelo motorista.
 *
 * A atribuição é sobrescrita naturalmente no próximo "Iniciar Saída" (com placa nova) ou pode ser
 * apagada manualmente por um admin no painel.
 */
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
 * Tiny Worker que dispara `tick` no intervalo desejado. Workers tendem a ser muito menos
 * estrangulados que `setInterval` da main thread quando o tab fica em segundo plano.
 */
const TRACKING_WORKER_SOURCE = `
let intervalId = null;
self.onmessage = (event) => {
  const data = (event && event.data) || {};
  if (data.type === "start" && typeof data.intervalMs === "number" && data.intervalMs > 0) {
    if (intervalId !== null) { clearInterval(intervalId); }
    intervalId = setInterval(function () { self.postMessage({ type: "tick" }); }, data.intervalMs);
  } else if (data.type === "stop") {
    if (intervalId !== null) { clearInterval(intervalId); }
    intervalId = null;
  }
};
`;

function createTrackingWorker(): { worker: Worker; objectUrl: string } | null {
  if (typeof Worker === "undefined") return null;
  try {
    const blob = new Blob([TRACKING_WORKER_SOURCE], { type: "application/javascript" });
    const objectUrl = URL.createObjectURL(blob);
    const worker = new Worker(objectUrl);
    return { worker, objectUrl };
  } catch (e) {
    console.warn("[SOT mobile] Falha ao criar Worker de rastreamento:", e);
    return null;
  }
}

/**
 * Áudio silencioso em loop: chrome/android e safari/ios tipicamente NÃO suspendem
 * o tab enquanto há reprodução de mídia, mantendo timers e fetch a funcionar.
 */
function createSilentAudio(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  try {
    const audio = new Audio(
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
    );
    audio.loop = true;
    audio.volume = 0;
    audio.muted = true;
    void audio.play().catch((e) => {
      console.warn("[SOT mobile] silent audio play:", e);
    });
    return audio;
  } catch (e) {
    console.warn("[SOT mobile] silent audio create:", e);
    return null;
  }
}

async function requestScreenWakeLock(): Promise<WakeLockHandle> {
  const nav = navigator as Navigator & {
    wakeLock?: { request: (type: "screen") => Promise<WakeLockHandle> };
  };
  if (!nav.wakeLock) return null;
  try {
    return await nav.wakeLock.request("screen");
  } catch (e) {
    console.warn("[SOT mobile] wakeLock.request:", e);
    return null;
  }
}

function readCurrentPositionOnce(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 25_000 },
    );
  });
}

/**
 * Envia `lastPos` ao servidor no máximo de X em X ms (`session.intervalMs`).
 * No Android nativo o callback do plugin continua em segundo plano; o `setInterval` do WebView não.
 */
function tryPostThrottled(session: ActiveSession): void {
  if (
    runningInsideCapacitorNative() &&
    Capacitor.getPlatform() === "android" &&
    androidNativeLocationAlarmActive &&
    session.nativeWatcherId !== null
  ) {
    return;
  }
  if (active?.recordId !== session.recordId) return;
  if (!lastPos) return;
  const now = Date.now();
  if (now - session.lastPostedAt < session.intervalMs) return;
  session.lastPostedAt = now;
  void postDriverLocation({
    placa: session.placa,
    latitude: lastPos.lat,
    longitude: lastPos.lng,
    departureId: session.recordId,
  }).catch((e) => {
    console.warn("[SOT mobile] postDriverLocation:", e);
  });
}

/**
 * Cada disparo:
 *  - **Browser:** `getCurrentPosition` no intervalo + envio.
 *  - **Capacitor nativo:** não usar `getCurrentPosition` no tick (WebView em segundo plano falha
 *    ou bloqueia); `lastPos` vem do `addWatcher` nativo e o envio também é feito lá com throttle.
 *    O intervalo aqui serve só de cópia de segurança quando o SO voltar a despachar JS.
 */
async function performTick(session: ActiveSession): Promise<void> {
  if (active?.recordId !== session.recordId) return;
  const nativeActive = session.nativeWatcherId !== null;
  if (!nativeActive) {
    try {
      const pos = await readCurrentPositionOnce();
      lastPos = { ...pos, capturedAt: Date.now() };
    } catch (e) {
      console.warn("[SOT mobile] getCurrentPosition tick:", e);
    }
  }
  if (active?.recordId !== session.recordId) return;
  tryPostThrottled(session);
}

/**
 * Inicia `watchPosition` no browser (ou watcher nativo no app), dispara ticks no intervalo
 * configurado (Worker no browser; `setInterval` no Capacitor nativo) e mantém o tab activo
 * via WakeLock + áudio silencioso no browser. Substitui qualquer sessão anterior.
 */
export async function startMobileDriverTrackingSession(args: { recordId: string; placa: string }): Promise<void> {
  clearSessionLocks();
  lastPos = null;

  const intervalMs = intervaloRastreamentoMilliseconds(getCachedRastreamentoMotoristasPayload());
  const insideNative = runningInsideCapacitorNative();

  let watchId: number | null = null;
  let nativeWatcherId: string | null = null;
  let silentAudio: HTMLAudioElement | null = null;
  let wakeLock: WakeLockHandle = null;

  if (insideNative) {
    /**
     * Native: o plugin Capacitor pede permissões, abre foreground service (Android) ou
     * activa background mode (iOS). A notificação fixa é obrigatória no Android para o
     * service não ser morto pelo SO.
     */
    try {
      nativeWatcherId = await BackgroundGeolocation.addWatcher(
        {
          backgroundTitle: "SOT — Rastreamento de viagem",
          backgroundMessage: `Localização ativa para ${args.placa}. Não feche o app.`,
          requestPermissions: true,
          /** Permite última posição conhecida enquanto o GPS re-fixa — ajuda em segundo plano. */
          stale: true,
          distanceFilter: 0,
        },
        (position: CapLocation | undefined, error: CapCallbackError | undefined) => {
          if (error) {
            console.warn("[SOT mobile] native addWatcher:", error.code, error.message);
            return;
          }
          if (!position) return;
          lastPos = {
            lat: position.latitude,
            lng: position.longitude,
            capturedAt: typeof position.time === "number" ? position.time : Date.now(),
          };
          const current = active;
          if (!current || current.recordId !== args.recordId) return;
          tryPostThrottled(current);
        },
      );
    } catch (e) {
      console.error("[SOT mobile] addWatcher native falhou:", e);
      throw e;
    }
  } else {
    await ensureGeolocationPermission();

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        lastPos = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          capturedAt: Date.now(),
        };
      },
      (err) => {
        console.warn("[SOT mobile] watchPosition:", err.code, err.message);
      },
      { enableHighAccuracy: true, maximumAge: 25_000, timeout: 30_000 },
    );

    silentAudio = createSilentAudio();
    wakeLock = await requestScreenWakeLock();
  }

  /**
   * No WebView Android, Workers com `Blob` URL são menos fiáveis para timers longos; o
   * `setInterval` na main thread serve de cópia de segurança — o envio em segundo plano
   * depende do callback nativo `addWatcher` (ver `tryPostThrottled`).
   */
  const workerEntry = insideNative ? null : createTrackingWorker();

  const session: ActiveSession = {
    recordId: args.recordId,
    placa: args.placa,
    watchId,
    nativeWatcherId,
    worker: workerEntry?.worker ?? null,
    workerObjectUrl: workerEntry?.objectUrl ?? null,
    fallbackIntervalId: null,
    intervalMs,
    lastPostedAt: 0,
    silentAudio,
    wakeLock,
    visibilityHandler: null,
    online: typeof navigator === "undefined" ? true : navigator.onLine,
  };
  active = session;
  activeInfo = { recordId: session.recordId, placa: session.placa, startedAt: Date.now() };
  notifyTrackingChanged();

  /**
   * Atribuição activa motorista→placa no Firestore — usada pela Cloud Function `postOwntracksLocation`
   * (iPhone via OwnTracks) para descobrir para que placa escrever quando o motorista envia.
   * A operação é "best effort": se falhar, o rastreamento próprio do app continua a funcionar.
   */
  const activeMotorista = loadActiveMobileMotorista();
  if (activeMotorista) {
    void writeMotoristaActiveAssignment({
      motorista: activeMotorista,
      placa: session.placa,
      departureId: session.recordId,
    });
  }

  void performTick(session);

  if (workerEntry) {
    workerEntry.worker.onmessage = (event: MessageEvent) => {
      const data = event.data as { type?: string } | null;
      if (data?.type !== "tick") return;
      const current = active;
      if (!current || current.recordId !== session.recordId) return;
      void performTick(current);
    };
    workerEntry.worker.onerror = (e: ErrorEvent) => {
      console.warn("[SOT mobile] tracking worker error:", e.message);
    };
    try {
      workerEntry.worker.postMessage({ type: "start", intervalMs });
    } catch (e) {
      console.warn("[SOT mobile] worker postMessage start:", e);
    }
  } else {
    session.fallbackIntervalId = window.setInterval(() => {
      const current = active;
      if (!current || current.recordId !== session.recordId) return;
      void performTick(current);
    }, intervalMs);
  }

  if (insideNative && Capacitor.getPlatform() === "android") {
    void (async () => {
      const url = resolveDriverLocationPostUrl();
      if (!url) {
        console.warn("[SOT mobile] Sem URL para envio nativo de localização (VITE_FIREBASE_* / VITE_DRIVER_LOCATION_POST_URL).");
        return;
      }
      try {
        const token = await getFirebaseIdTokenForFunctions();
        await NativeScheduledLocationPost.start({
          url,
          token,
          placa: args.placa,
          departureId: args.recordId,
          intervalMs,
        });
        androidNativeLocationAlarmActive = true;
      } catch (e) {
        androidNativeLocationAlarmActive = false;
        console.error("[SOT mobile] NativeScheduledLocationPost.start:", e);
      }
    })();
  }

  /**
   * No browser, ao voltar a foreground, reactivamos wake lock + áudio silencioso (foram
   * libertados pelo SO) e disparamos um tick imediato. No app nativo o envio periódico
   * em segundo plano vem do callback do plugin; este tick ajuda ao voltar ao primeiro plano.
   */
  if (!insideNative) {
    const visibilityHandler = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;
      const current = active;
      if (!current || current.recordId !== session.recordId) return;
      if (!current.wakeLock) {
        void requestScreenWakeLock().then((wl) => {
          if (active && active.recordId === session.recordId) {
            active.wakeLock = wl;
          } else {
            safeReleaseWakeLock(wl);
          }
        });
      }
      if (current.silentAudio && current.silentAudio.paused) {
        void current.silentAudio.play().catch(() => {});
      }
      void performTick(current);
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", visibilityHandler);
    }
    session.visibilityHandler = visibilityHandler;
  } else if (insideNative && Capacitor.getPlatform() === "android") {
    const refreshNativeToken = () => {
      if (typeof document === "undefined" || document.visibilityState !== "visible") return;
      const current = active;
      if (!current || current.recordId !== args.recordId) return;
      void (async () => {
        try {
          const t = await getFirebaseIdTokenForFunctions();
          await NativeScheduledLocationPost.updateToken({ token: t });
        } catch (e) {
          console.warn("[SOT mobile] NativeScheduledLocationPost.updateToken:", e);
        }
      })();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", refreshNativeToken);
    }
    session.visibilityHandler = refreshNativeToken;
  }
}
