/**
 * Modal de navegação em ecrã cheio.
 *
 * Após o motorista tocar em "Iniciar Saída" no SOT mobile, este componente abre por cima
 * da app e mostra:
 *  - Mapa Leaflet a todo o ecrã com a rota desenhada (OSRM).
 *  - Marcadores de origem (posição atual, azul) e destino (vermelho).
 *  - Barra superior com nome do destino, distância e tempo previsto.
 *  - Barra inferior com botões: fechar, abrir Waze/Google Maps, ligar/desligar voz.
 *  - Acompanhamento contínuo da posição via `watchPosition`.
 *  - Anúncios de manobra por voz (Web Speech API) à medida que o motorista se aproxima
 *    de cada passo.
 *
 * Toda a stack é grátis: Nominatim + OSRM + Leaflet + tiles OSM. Sem chaves.
 */

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "../components/ui/button";
import type { DepartureRecord } from "../types/departure";
import {
  type DrivingRoute,
  type GeocodeResult,
  fetchDrivingRoute,
  formatDistance,
  formatDuration,
  geocodeAddress,
  maneuverToPortuguese,
} from "../lib/navigationRouting";

const OSM_TILE = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/**
 * Constrói a query de geocoding a partir dos campos do registo.
 * Combina hospital, bairro e cidade — qualquer que esteja preenchido.
 */
function buildDestinationQuery(record: DepartureRecord): string {
  const partes = [record.hospitalDestino, record.bairro, record.cidade]
    .map((s) => (s || "").trim())
    .filter((s) => s.length > 0 && s !== "—");
  return partes.join(", ");
}

type Coord = { lat: number; lng: number };

type Props = {
  open: boolean;
  record: DepartureRecord;
  onClose: () => void;
};

export function NavigationFullScreenModal({ open, record, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const spokenStepIdxRef = useRef<number>(-1);

  const [origin, setOrigin] = useState<Coord | null>(null);
  const [destination, setDestination] = useState<GeocodeResult | null>(null);
  const [route, setRoute] = useState<DrivingRoute | null>(null);
  const [loading, setLoading] = useState<"" | "locating" | "geocoding" | "routing">("");
  const [error, setError] = useState<string | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  const destinationQuery = useMemo(() => buildDestinationQuery(record), [record]);

  // ---------------------------------------------------------------------------
  // 1) Obter posição inicial (uma vez).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!open) return;
    setError(null);
    setLoading("locating");
    if (!("geolocation" in navigator)) {
      setError("Este dispositivo não suporta geolocalização.");
      setLoading("");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLoading("");
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Permissão de localização negada. Active nas definições do telemóvel."
            : "Não foi possível obter a sua localização atual.",
        );
        setLoading("");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  }, [open]);

  // ---------------------------------------------------------------------------
  // 2) Geocodificar o destino.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!open) return;
    if (!destinationQuery) {
      setError(
        "Esta saída não tem destino preenchido (hospital/bairro/cidade). Preencha antes de navegar.",
      );
      return;
    }
    let cancelled = false;
    setLoading("geocoding");
    geocodeAddress(destinationQuery).then((res) => {
      if (cancelled) return;
      if (!res) {
        setError(`Não foi possível localizar "${destinationQuery}" no mapa.`);
        setLoading("");
        return;
      }
      setDestination(res);
      setLoading("");
    });
    return () => {
      cancelled = true;
    };
  }, [open, destinationQuery]);

  // ---------------------------------------------------------------------------
  // 3) Calcular rota assim que origem + destino existirem.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!open || !origin || !destination) return;
    let cancelled = false;
    setLoading("routing");
    fetchDrivingRoute(origin, destination).then((r) => {
      if (cancelled) return;
      if (!r) {
        setError("Não foi possível calcular a rota até ao destino.");
        setLoading("");
        return;
      }
      setRoute(r);
      setLoading("");
      spokenStepIdxRef.current = -1;
    });
    return () => {
      cancelled = true;
    };
  }, [open, origin, destination]);

  // ---------------------------------------------------------------------------
  // 4) Inicializar mapa Leaflet quando o modal abre.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!open || !containerRef.current) return;
    const el = containerRef.current;
    const map = L.map(el, { zoomControl: true, attributionControl: true }).setView(
      [-22.9, -43.2],
      6,
    );
    L.tileLayer(OSM_TILE, { maxZoom: 19, attribution: OSM_ATTRIB }).addTo(map);
    mapRef.current = map;

    // Compensa flicker durante a animação de abertura do modal.
    const rafId = requestAnimationFrame(() => {
      map.invalidateSize();
      requestAnimationFrame(() => map.invalidateSize());
    });
    const tmo = window.setTimeout(() => map.invalidateSize(), 320);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(tmo);
      map.remove();
      mapRef.current = null;
      routeLayerRef.current = null;
      driverMarkerRef.current = null;
      destMarkerRef.current = null;
    };
  }, [open]);

  // ---------------------------------------------------------------------------
  // 5) Desenhar marcadores / rota quando os dados chegam.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !origin) return;

    // Marcador do motorista (origem actual).
    const driverIcon = L.divIcon({
      className: "sot-nav-driver-icon",
      html: '<div style="width:18px;height:18px;background:#2563eb;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 2px rgba(37,99,235,0.45);"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
    if (driverMarkerRef.current) {
      driverMarkerRef.current.setLatLng([origin.lat, origin.lng]);
    } else {
      driverMarkerRef.current = L.marker([origin.lat, origin.lng], { icon: driverIcon }).addTo(map);
    }
  }, [origin]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !destination) return;

    const destIcon = L.divIcon({
      className: "sot-nav-dest-icon",
      html: '<div style="width:20px;height:20px;background:#dc2626;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 2px rgba(220,38,38,0.45);"></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
    if (destMarkerRef.current) {
      destMarkerRef.current.setLatLng([destination.lat, destination.lng]);
    } else {
      destMarkerRef.current = L.marker([destination.lat, destination.lng], {
        icon: destIcon,
        title: destination.displayName,
      }).addTo(map);
    }
  }, [destination]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !route) return;

    if (routeLayerRef.current) {
      routeLayerRef.current.remove();
      routeLayerRef.current = null;
    }
    const latlngs: [number, number][] = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    const poly = L.polyline(latlngs, {
      color: "#2563eb",
      weight: 6,
      opacity: 0.85,
      lineJoin: "round",
      lineCap: "round",
    }).addTo(map);
    routeLayerRef.current = poly;

    // Ajustar visualização a toda a rota.
    const bounds = poly.getBounds();
    map.fitBounds(bounds, { padding: [80, 80] });
  }, [route]);

  // ---------------------------------------------------------------------------
  // 6) Acompanhar a posição com `watchPosition` enquanto o modal está aberto.
  //    Actualiza o marcador do motorista e anuncia manobras por voz.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!open) return;
    if (!("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const here: Coord = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setOrigin(here);
        if (driverMarkerRef.current) driverMarkerRef.current.setLatLng([here.lat, here.lng]);
        maybeSpeakNextManeuver(here);
      },
      undefined,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
    );
    watchIdRef.current = id;
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ---------------------------------------------------------------------------
  // Voz: anuncia a próxima manobra quando o motorista está a < ~100 m do início dela.
  // ---------------------------------------------------------------------------
  const speak = useCallback(
    (text: string) => {
      if (!voiceEnabled) return;
      if (!("speechSynthesis" in window)) return;
      try {
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = "pt-BR";
        utter.rate = 1.0;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utter);
      } catch {
        // ignore
      }
    },
    [voiceEnabled],
  );

  const maybeSpeakNextManeuver = useCallback(
    (here: Coord) => {
      const r = route;
      if (!r) return;
      const next = spokenStepIdxRef.current + 1;
      if (next >= r.steps.length) return;
      const step = r.steps[next];
      const coords = step.geometry?.coordinates;
      if (!coords || coords.length === 0) return;
      const [lng, lat] = coords[0];
      const distM = haversineMeters(here, { lat, lng });
      if (distM < 120) {
        const phrase = maneuverToPortuguese(step);
        if (phrase) speak(phrase);
        spokenStepIdxRef.current = next;
      }
    },
    [route, speak],
  );

  // ---------------------------------------------------------------------------
  // Acções dos botões inferiores.
  // ---------------------------------------------------------------------------
  function openInWaze() {
    if (!destination) return;
    const url = `https://waze.com/ul?ll=${destination.lat},${destination.lng}&navigate=yes`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function openInGoogleMaps() {
    if (!destination) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}&travelmode=driving`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col bg-[hsl(var(--background))]">
      {/* Mapa em fundo, ocupa o resto do ecrã. */}
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ zIndex: 0 }}
        aria-label="Mapa de navegação"
      />

      {/* Barra superior: destino + distância/tempo. */}
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex flex-col gap-1 bg-gradient-to-b from-black/55 to-transparent p-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="pointer-events-auto flex items-start gap-2">
          <button
            type="button"
            onClick={() => {
              window.speechSynthesis?.cancel?.();
              onClose();
            }}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow"
            aria-label="Fechar navegação"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
              <path d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs uppercase tracking-wider text-white/80">Destino</p>
            <p className="truncate text-sm font-semibold leading-tight">
              {destination?.displayName ?? destinationQuery ?? "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setVoiceEnabled((v) => !v)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow"
            aria-label={voiceEnabled ? "Desligar voz" : "Ligar voz"}
            title={voiceEnabled ? "Desligar voz" : "Ligar voz"}
          >
            {voiceEnabled ? (
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                <path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2A4.5 4.5 0 0 0 14 7.97v8.05A4.5 4.5 0 0 0 16.5 12zM14 3.23v2.06A7 7 0 0 1 14 18.7v2.07a9 9 0 0 0 0-17.54z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                <path d="M3 10v4h4l5 5V5L7 10H3zm13.59 2L19 9.41 17.59 8 15 10.59 12.41 8 11 9.41 13.59 12 11 14.59 12.41 16 15 13.41 17.59 16 19 14.59z" />
              </svg>
            )}
          </button>
        </div>

        {/* Cartão de distância / tempo. */}
        <div className="pointer-events-auto mt-1 flex items-center gap-3 rounded-xl bg-white/95 px-3 py-2 text-slate-900 shadow-md">
          {loading || !route ? (
            <p className="text-sm font-medium">
              {loading === "locating" && "A localizar-se…"}
              {loading === "geocoding" && "A procurar destino…"}
              {loading === "routing" && "A calcular rota…"}
              {!loading && !route && (error ?? "A preparar navegação…")}
            </p>
          ) : (
            <>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-slate-500">
                  Distância
                </span>
                <span className="text-base font-bold leading-tight">
                  {formatDistance(route.distance)}
                </span>
              </div>
              <div className="h-8 w-px bg-slate-200" />
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-slate-500">
                  Tempo previsto
                </span>
                <span className="text-base font-bold leading-tight">
                  {formatDuration(route.duration)}
                </span>
              </div>
              <div className="h-8 w-px bg-slate-200" />
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-slate-500">Chegada</span>
                <span className="text-base font-bold leading-tight">
                  {formatEta(route.duration)}
                </span>
              </div>
            </>
          )}
        </div>

        {error && route && (
          <p className="pointer-events-auto mt-1 rounded-md bg-red-600/90 px-3 py-2 text-xs text-white shadow">
            {error}
          </p>
        )}
      </div>

      {/* Barra inferior: acções rápidas. */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 flex justify-center gap-2 bg-gradient-to-t from-black/55 to-transparent px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-6"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="pointer-events-auto flex w-full max-w-md gap-2">
          <Button
            variant="outline"
            className="h-11 flex-1 rounded-xl bg-white/95 text-slate-900 hover:bg-white"
            onClick={openInGoogleMaps}
            disabled={!destination}
            title="Abrir esta rota no Google Maps"
          >
            Google Maps
          </Button>
          <Button
            variant="outline"
            className="h-11 flex-1 rounded-xl bg-white/95 text-slate-900 hover:bg-white"
            onClick={openInWaze}
            disabled={!destination}
            title="Abrir esta rota no Waze"
          >
            Waze
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Calcula a hora estimada de chegada como `HH:MM` no fuso local. */
function formatEta(durationSeconds: number): string {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return "—";
  const eta = new Date(Date.now() + durationSeconds * 1000);
  const hh = String(eta.getHours()).padStart(2, "0");
  const mm = String(eta.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Distância haversine entre dois pontos, em metros. */
function haversineMeters(a: Coord, b: Coord): number {
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

