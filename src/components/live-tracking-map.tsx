/**
 * `LiveTrackingMap` — componente "tudo-junto" pronto a usar numa página/rota:
 *
 *  • Mapa Google interactivo (via `GoogleMapComponent`).
 *  • Rastreamento contínuo do utilizador com `watchPosition`
 *    (`enableHighAccuracy: true`, `maximumAge: 0`, `timeout: 5000`).
 *  • Marcador azul "estás aqui" + círculo de precisão (estilo Google Maps),
 *    a mover-se conforme a posição actualiza.
 *  • Screen Wake Lock — mantém o ecrã ligado enquanto o mapa estiver aberto.
 *  • Persistência: a cada nova posição válida, escreve `lat`/`lng` (e
 *    accuracy/heading/speed) no Firestore em `user_locations/{auth.uid}`.
 *    Throttle por defeito: 3 s **e** 5 m de deslocação mínima — evita inundar
 *    o Firestore (e a tua quota gratuita) com escritas redundantes quando o
 *    utilizador está parado ou o GPS oscila.
 *  • Indicadores de estado (badges em overlay):
 *      ◉ Estado da localização (a localizar / activo / erro).
 *      ◉ Estado da Wake Lock (ecrã trancado / livre / sem suporte).
 *      ◉ Estado da última escrita ao Firestore (a sincronizar / OK / erro).
 *  • Cleanup integral garantido pelos hooks reutilizáveis:
 *      ◉ `useWatchUserLocation` chama `clearWatch` no unmount.
 *      ◉ `useScreenWakeLock` liberta a `WakeLockSentinel` no unmount.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleMapComponent, type GoogleMapComponentProps } from "./google-map";
import { setUserLocation } from "../lib/firebase/userLocationFirestore";
import { isFirebaseConfigured } from "../lib/firebase/config";
import type { WatchedPosition } from "../hooks/useWatchUserLocation";

export type LiveTrackingMapProps = Omit<
  GoogleMapComponentProps,
  "trackUserLocation" | "onUserLocationChange" | "onUserLocationError" | "onWakeLockChange"
> & {
  /**
   * Liga a persistência das coordenadas no Firestore (`user_locations/{uid}`).
   * Default: `true`. Quando `false`, o mapa funciona em modo "só visual"
   * (rastreia e mostra mas não escreve nada na nuvem).
   */
  persistToFirebase?: boolean;
  /**
   * Intervalo mínimo entre escritas ao Firestore, em milisegundos.
   * Default: `3000` (3 s).
   */
  minWriteIntervalMs?: number;
  /**
   * Distância mínima (metros) que o utilizador tem de percorrer desde a
   * última escrita para que uma nova seja feita. Default: `5` m.
   */
  minMoveMeters?: number;
  /** Mostrar a barra de status sobreposta no canto superior direito. */
  showStatusOverlay?: boolean;
};

/** Distância haversine em metros entre dois pontos lat/lng. */
function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

type WriteStatus = "idle" | "writing" | "ok" | "error";
type LocationStatus = "locating" | "active" | "error";

export function LiveTrackingMap({
  persistToFirebase = true,
  minWriteIntervalMs = 3000,
  minMoveMeters = 5,
  showStatusOverlay = true,
  ...mapProps
}: LiveTrackingMapProps) {
  // ─── Estados de status ───────────────────────────────────────────────────
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("locating");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [wakeLockState, setWakeLockState] = useState<{
    isActive: boolean;
    isSupported: boolean;
    error: Error | null;
  }>({ isActive: false, isSupported: false, error: null });
  const [writeStatus, setWriteStatus] = useState<WriteStatus>("idle");
  const [writeError, setWriteError] = useState<string | null>(null);
  const [lastWriteAt, setLastWriteAt] = useState<number | null>(null);

  // ─── Refs de throttle (não disparam re-render) ───────────────────────────
  const lastWrittenAtRef = useRef<number>(0);
  const lastWrittenPosRef = useRef<{ lat: number; lng: number } | null>(null);
  /**
   * Flag de "componente desmontou" — usada para descartar resoluções
   * tardias de `setDoc` que chegam depois do utilizador sair do ecrã.
   * Sem isto, ocasionais avisos "Can't perform a React state update on an
   * unmounted component" apareciam em dev.
   */
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ─── Callback de cada actualização do GPS ────────────────────────────────
  const handleUserLocationChange = useCallback(
    (pos: WatchedPosition) => {
      setLocationStatus("active");
      setLocationError(null);

      if (!persistToFirebase) return;
      if (!isFirebaseConfigured()) return;

      const now = Date.now();
      const elapsed = now - lastWrittenAtRef.current;
      const moved = lastWrittenPosRef.current
        ? haversineMeters(lastWrittenPosRef.current, { lat: pos.lat, lng: pos.lng })
        : Number.POSITIVE_INFINITY;

      // Throttle combinado tempo + distância — escreve só se BAMBOS forem
      // satisfeitos (excepto na primeira escrita, onde a distância é Infinity).
      if (elapsed < minWriteIntervalMs) return;
      if (moved < minMoveMeters) return;

      lastWrittenAtRef.current = now;
      lastWrittenPosRef.current = { lat: pos.lat, lng: pos.lng };

      setWriteStatus("writing");
      void setUserLocation({
        lat: pos.lat,
        lng: pos.lng,
        accuracy: pos.accuracy,
        heading: pos.heading,
        speed: pos.speed,
        altitude: pos.altitude,
      })
        .then(() => {
          if (!isMountedRef.current) return;
          setWriteStatus("ok");
          setWriteError(null);
          setLastWriteAt(Date.now());
        })
        .catch((err: unknown) => {
          if (!isMountedRef.current) return;
          setWriteStatus("error");
          setWriteError(err instanceof Error ? err.message : String(err));
        });
    },
    [persistToFirebase, minWriteIntervalMs, minMoveMeters],
  );

  const handleUserLocationError = useCallback((err: GeolocationPositionError) => {
    setLocationStatus("error");
    setLocationError(
      err.code === err.PERMISSION_DENIED
        ? "Permissão de localização negada."
        : err.code === err.POSITION_UNAVAILABLE
          ? "Localização indisponível (GPS sem sinal)."
          : err.code === err.TIMEOUT
            ? "Timeout ao obter localização."
            : err.message || "Erro desconhecido.",
    );
  }, []);

  const handleWakeLockChange = useCallback(
    (state: { isActive: boolean; isSupported: boolean; error: Error | null }) => {
      setWakeLockState(state);
    },
    [],
  );

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={{ position: "relative", width: "100%", height: mapProps.containerStyle?.height ?? "400px" }}>
      <GoogleMapComponent
        {...mapProps}
        trackUserLocation
        keepScreenAwake
        onUserLocationChange={handleUserLocationChange}
        onUserLocationError={handleUserLocationError}
        onWakeLockChange={handleWakeLockChange}
      />
      {showStatusOverlay ? (
        <StatusOverlay
          locationStatus={locationStatus}
          locationError={locationError}
          wakeLock={wakeLockState}
          writeStatus={persistToFirebase ? writeStatus : "idle"}
          writeError={writeError}
          lastWriteAt={lastWriteAt}
          persistEnabled={persistToFirebase}
        />
      ) : null}
    </div>
  );
}

type StatusOverlayProps = {
  locationStatus: LocationStatus;
  locationError: string | null;
  wakeLock: { isActive: boolean; isSupported: boolean; error: Error | null };
  writeStatus: WriteStatus;
  writeError: string | null;
  lastWriteAt: number | null;
  persistEnabled: boolean;
};

/**
 * Devolve uma etiqueta humana ("agora mesmo", "há 12s", "há 3 min", …) para a
 * última escrita ao Firestore. **Não memoizamos** propositadamente: o cálculo
 * usa `Date.now()` (impuro) que mudaria o resultado a cada render mesmo com
 * dependências iguais. Recalcular em cada render é trivial e mantém o eslint
 * `react-hooks/purity` (v7) feliz.
 */
function formatLastWriteLabel(lastWriteAt: number | null): string | null {
  if (!lastWriteAt) return null;
  const diffSec = Math.round((Date.now() - lastWriteAt) / 1000);
  if (diffSec < 5) return "agora mesmo";
  if (diffSec < 60) return `há ${diffSec}s`;
  if (diffSec < 3600) return `há ${Math.round(diffSec / 60)} min`;
  return `há ${Math.round(diffSec / 3600)} h`;
}

function StatusOverlay({
  locationStatus,
  locationError,
  wakeLock,
  writeStatus,
  writeError,
  lastWriteAt,
  persistEnabled,
}: StatusOverlayProps) {
  const lastWriteLabel = formatLastWriteLabel(lastWriteAt);

  return (
    <div
      style={{
        position: "absolute",
        top: "0.5rem",
        right: "0.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.35rem",
        pointerEvents: "none",
        zIndex: 1000,
      }}
    >
      <StatusBadge
        label="Localização"
        tone={
          locationStatus === "active" ? "ok" : locationStatus === "error" ? "error" : "loading"
        }
      >
        {locationStatus === "locating" && "a localizar…"}
        {locationStatus === "active" && "activa"}
        {locationStatus === "error" && (locationError ?? "erro")}
      </StatusBadge>

      <StatusBadge
        label="Ecrã"
        tone={
          !wakeLock.isSupported
            ? "warn"
            : wakeLock.error
              ? "error"
              : wakeLock.isActive
                ? "ok"
                : "warn"
        }
      >
        {!wakeLock.isSupported
          ? "sem suporte"
          : wakeLock.error
            ? "erro"
            : wakeLock.isActive
              ? "trancado"
              : "livre"}
      </StatusBadge>

      {persistEnabled ? (
        <StatusBadge
          label="Firestore"
          tone={
            writeStatus === "ok" ? "ok" : writeStatus === "error" ? "error" : writeStatus === "writing" ? "loading" : "warn"
          }
        >
          {writeStatus === "idle" && "à espera"}
          {writeStatus === "writing" && "a sincronizar…"}
          {writeStatus === "ok" && (lastWriteLabel ? `OK · ${lastWriteLabel}` : "OK")}
          {writeStatus === "error" && (writeError ?? "erro")}
        </StatusBadge>
      ) : null}
    </div>
  );
}

type StatusBadgeProps = {
  label: string;
  tone: "ok" | "error" | "warn" | "loading";
  children: React.ReactNode;
};

function StatusBadge({ label, tone, children }: StatusBadgeProps) {
  const palette: Record<StatusBadgeProps["tone"], { bg: string; fg: string }> = {
    ok: { bg: "rgba(16, 185, 129, 0.95)", fg: "#fff" },
    error: { bg: "rgba(220, 38, 38, 0.95)", fg: "#fff" },
    warn: { bg: "rgba(245, 158, 11, 0.95)", fg: "#fff" },
    loading: { bg: "rgba(100, 116, 139, 0.95)", fg: "#fff" },
  };
  const { bg, fg } = palette[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        padding: "0.2rem 0.5rem",
        borderRadius: "0.5rem",
        background: bg,
        color: fg,
        fontSize: "0.7rem",
        fontWeight: 600,
        lineHeight: 1.2,
        boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ opacity: 0.85, fontWeight: 500 }}>{label}:</span>
      <span>{children}</span>
    </span>
  );
}

export default LiveTrackingMap;
