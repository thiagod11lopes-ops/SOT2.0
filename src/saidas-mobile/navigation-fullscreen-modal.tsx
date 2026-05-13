/**
 * Modal de navegação em ecrã cheio.
 *
 * Após o motorista tocar em "Iniciar Saída" no SOT mobile, este componente abre por cima
 * da app e mostra:
 *  - Mapa Leaflet a todo o ecrã com a rota desenhada (OSRM).
 *  - Marcadores de origem (posição atual, azul) e destino (vermelho).
 *  - Pinos laranjas das **outras viaturas com saída em curso** (tempo real,
 *    via `useDriverActiveLocations`). Mostra a placa de cada uma como tooltip
 *    permanente; toque abre popup com o timestamp da última posição.
 *  - Barra superior com nome do destino, distância e tempo previsto.
 *  - Botão vermelho "PARE" (base) com modal de confirmação.
 *  - Acompanhamento contínuo da posição via `watchPosition` (apenas actualiza
 *    o marcador do motorista — o motorista controla o mapa manualmente).
 *  - Anúncios de manobra por voz (Web Speech API) à medida que o motorista se aproxima
 *    de cada passo.
 *
 * Toda a stack é grátis: Nominatim + OSRM + Leaflet + tiles OSM. Sem chaves.
 */

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "../components/ui/button";
import { useDriverActiveLocations } from "../hooks/useDriverActiveLocations";
import { primaryPlacaFromViaturasField } from "../lib/viaturaPlaca";
import type { DepartureRecord } from "../types/departure";
import {
  type DrivingRoute,
  type GeocodeResult,
  fetchDrivingRoute,
  formatDistance,
  formatDuration,
  geocodeAddresses,
  haversineMeters,
  maneuverToPortuguese,
} from "../lib/navigationRouting";

const OSM_TILE = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** Escape HTML para popup do Leaflet — evita XSS via placa adulterada. */
function escapePopupHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Texto relativo curto: "agora mesmo", "há 3 min", "há 2 h", "há 1 dia". */
function formatRelativeTime(ms: number, now: number = Date.now()): string {
  const diffSec = Math.max(0, Math.floor((now - ms) / 1000));
  if (diffSec < 60) return "agora mesmo";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `há ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `há ${hr} h`;
  const days = Math.floor(hr / 24);
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}

/** Normaliza placa para comparação (trim + uppercase). */
function normalizePlaca(p: string): string {
  return p.trim().toUpperCase();
}

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
  /**
   * Quando true, o modal abre já em modo "tela trancada" (overlay preta + Wake Lock).
   * Útil para o modo "Segundo plano": o motorista escolheu não acompanhar o mapa
   * visualmente — a voz das manobras continua a guiar e o ecrã fica praticamente
   * apagado para poupar bateria.
   */
  initialScreenLocked?: boolean;
};

export function NavigationFullScreenModal({
  open,
  record,
  onClose,
  initialScreenLocked = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  /** Layer group dos pinos de **outras** viaturas com saída em curso (tempo real). */
  const othersLayerRef = useRef<L.LayerGroup | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const spokenStepIdxRef = useRef<number>(-1);
  /** Última heading conhecida (graus, 0 = norte). Usada para rotar o ícone do motorista. */
  const headingRef = useRef<number | null>(null);

  /** Placa **do motorista actual** (primeiro item do campo `viaturas`) — filtrada da lista de outras viaturas. */
  const currentPlacaNorm = useMemo(
    () => normalizePlaca(primaryPlacaFromViaturasField(record.viaturas)),
    [record.viaturas],
  );

  /**
   * Subscrição **em tempo real** (`onSnapshot`) à coleção `driver_active_locations`
   * do Firestore — devolve todas as viaturas com sessão de rastreamento activa.
   * Já degrada graciosamente se o Firebase não estiver configurado.
   */
  const { pins: activePins } = useDriverActiveLocations(open);
  /** Pinos das **outras** viaturas (exclui a própria). */
  const otherPins = useMemo(
    () => activePins.filter((p) => normalizePlaca(p.placa) !== currentPlacaNorm),
    [activePins, currentPlacaNorm],
  );
  /** Timestamp do último toque na overlay preta — usado para detectar duplo-clique. */
  const lastLockTapRef = useRef<number>(0);
  /** Wake Lock activo (mantém ecrã aceso durante a navegação). */
  const wakeLockRef = useRef<unknown | null>(null);

  const [origin, setOrigin] = useState<Coord | null>(null);
  const [destination, setDestination] = useState<GeocodeResult | null>(null);
  const [route, setRoute] = useState<DrivingRoute | null>(null);
  const [loading, setLoading] = useState<"" | "locating" | "geocoding" | "routing">("");
  const [error, setError] = useState<string | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [confirmStopOpen, setConfirmStopOpen] = useState(false);
  /**
   * Quando true, sobrepõe-se ao mapa um overlay 100 % preto que tapa toda a UI —
   * o motorista poupa bateria/brilho e continua a ser guiado pela voz das manobras.
   * Desbloqueia-se com **duplo toque** em qualquer parte do ecrã.
   */
  const [screenLocked, setScreenLocked] = useState(false);

  /**
   * Animação de transição "Adeus, vejo-te lá" quando o motorista escolhe iniciar
   * em "Segundo plano": uma mão acena no centro enquanto a tela escurece
   * gradualmente até preto absoluto (≈ 2,2 s). No fim, activa `screenLocked`.
   */
  const [farewellAnimating, setFarewellAnimating] = useState(false);

  // Quando o modal abre em modo "Segundo plano", arranca a animação de despedida.
  useEffect(() => {
    if (!open || !initialScreenLocked) return;
    setFarewellAnimating(true);
    const t = window.setTimeout(() => {
      setScreenLocked(true);
      setFarewellAnimating(false);
    }, 2200);
    return () => window.clearTimeout(t);
  }, [open, initialScreenLocked]);
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
  // 2) Geocodificar o destino. Espera por `origin` antes de pesquisar — sem origem,
  // não conseguimos ordenar os candidatos por distância. Auto-escolhe sempre o
  // candidato mais próximo: o motorista já escolheu o endereço durante a digitação
  // (autocomplete estilo Waze/Maps no campo «Destino»).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!open) return;
    if (!destinationQuery) {
      setError(
        "Esta saída não tem destino preenchido (hospital/bairro/cidade). Preencha antes de navegar.",
      );
      return;
    }
    if (!origin) return;
    if (destination) return; // já temos destino escolhido
    let cancelled = false;
    setLoading("geocoding");
    geocodeAddresses(destinationQuery, 6).then((results) => {
      if (cancelled) return;
      if (results.length === 0) {
        setError(`Não foi possível localizar "${destinationQuery}" no mapa.`);
        setLoading("");
        return;
      }
      const withDistance = results
        .map((r) => ({ ...r, distanceMeters: haversineMeters(origin, { lat: r.lat, lng: r.lng }) }))
        .sort((a, b) => a.distanceMeters - b.distanceMeters);
      const { distanceMeters: _ignored, ...picked } = withDistance[0];
      void _ignored;
      setDestination(picked);
      setLoading("");
    });
    return () => {
      cancelled = true;
    };
  }, [open, destinationQuery, origin, destination]);

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

    let cancelled = false;
    let map: L.Map | null = null;
    let rafId = 0;
    let tmo = 0;

    function init() {
      if (cancelled || !containerRef.current) return;
      map = L.map(el, { zoomControl: true, attributionControl: true }).setView(
        [-22.9, -43.2],
        6,
      );

      L.tileLayer(OSM_TILE, { maxZoom: 19, attribution: OSM_ATTRIB }).addTo(map);
      mapRef.current = map;

      // Layer group das outras viaturas (criado antes dos marcadores do
      // motorista/destino para ficar visualmente por baixo destes).
      othersLayerRef.current = L.layerGroup().addTo(map);

      rafId = requestAnimationFrame(() => {
        map?.invalidateSize();
        requestAnimationFrame(() => map?.invalidateSize());
      });
      tmo = window.setTimeout(() => map?.invalidateSize(), 320);
    }

    init();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      window.clearTimeout(tmo);
      if (map) {
        map.remove();
      }
      mapRef.current = null;
      routeLayerRef.current = null;
      driverMarkerRef.current = null;
      destMarkerRef.current = null;
      othersLayerRef.current = null;
    };
  }, [open]);

  // ---------------------------------------------------------------------------
  // 5) Desenhar marcadores / rota quando os dados chegam.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !origin) return;

    // Marcador do motorista: chevron azul (estilo Google Maps/Waze). O DIV interno
    // rotaciona em função da `headingRef` para indicar a direcção de marcha.
    if (!driverMarkerRef.current) {
      const driverIcon = L.divIcon({
        className: "sot-nav-driver-icon",
        html:
          '<div class="sot-nav-driver-rotate" style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;transform:rotate(0deg);transition:transform 200ms linear;">' +
          '<svg viewBox="0 0 24 24" width="36" height="36" style="filter:drop-shadow(0 1px 3px rgba(0,0,0,0.45));">' +
          // Círculo de fundo branco
          '<circle cx="12" cy="12" r="10" fill="#fff"/>' +
          // Seta azul interna (apontando para cima — norte)
          '<path d="M12 4 L18 18 L12 15 L6 18 Z" fill="#2563eb" stroke="#1d4ed8" stroke-width="0.6" stroke-linejoin="round"/>' +
          "</svg></div>",
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      driverMarkerRef.current = L.marker([origin.lat, origin.lng], {
        icon: driverIcon,
        interactive: false,
        keyboard: false,
      }).addTo(map);
    } else {
      driverMarkerRef.current.setLatLng([origin.lat, origin.lng]);
    }

    // Aplica rotação ao DIV interno para indicar a direcção de marcha.
    const el = driverMarkerRef.current.getElement?.();
    const rot = el?.querySelector?.(".sot-nav-driver-rotate") as HTMLElement | null;
    if (rot) {
      const h = headingRef.current;
      rot.style.transform =
        h !== null && Number.isFinite(h) ? `rotate(${h}deg)` : "rotate(0deg)";
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
  // 5b) Renderizar pinos das **outras viaturas em curso** (real-time Firestore).
  //    Marcador laranja com tooltip permanente mostrando a placa. Clique abre
  //    popup com timestamp da última posição. O motorista actual não aparece
  //    aqui — já é representado pelo chevron azul.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    const group = othersLayerRef.current;
    if (!map || !group) return;

    group.clearLayers();

    const markerOpts: L.CircleMarkerOptions = {
      radius: 9,
      color: "#c2410c",
      weight: 2,
      fillColor: "#fb923c",
      fillOpacity: 0.9,
    };

    for (const p of otherPins) {
      const m = L.circleMarker([p.lat, p.lng], markerOpts);
      const placaLabel = escapePopupHtml(p.placa);
      const popupHtml =
        p.lastUpdateAtMs !== null
          ? `<strong>${placaLabel}</strong><br /><span style="font-size:11px;color:#555">Última posição: ${escapePopupHtml(
              formatRelativeTime(p.lastUpdateAtMs),
            )}</span>`
          : `<strong>${placaLabel}</strong><br /><span style="font-size:11px;color:#888">Hora da última posição desconhecida.</span>`;
      m.bindPopup(popupHtml, { className: "sot-driver-map-popup" });
      m.bindTooltip(p.placa, {
        permanent: true,
        direction: "top",
        offset: [0, -10],
        className: "sot-driver-map-placa-tooltip",
      });
      m.addTo(group);
    }
  }, [otherPins]);

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
        // Heading só é fiável quando há velocidade — ignoramos abaixo de 0.5 m/s (~1.8 km/h).
        const speed = typeof pos.coords.speed === "number" ? pos.coords.speed : null;
        const rawHeading = typeof pos.coords.heading === "number" ? pos.coords.heading : null;
        if (rawHeading !== null && Number.isFinite(rawHeading) && (speed === null || speed > 0.5)) {
          headingRef.current = rawHeading;
        }
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

  // Limpa o estado de geocoding/rota assim que o modal fecha — garantindo que a
  // próxima abertura recomeça do zero.
  useEffect(() => {
    if (open) return;
    setDestination(null);
    setRoute(null);
    setError(null);
    setLoading("");
    setScreenLocked(false);
    setFarewellAnimating(false);
    spokenStepIdxRef.current = -1;
  }, [open]);

  // ---------------------------------------------------------------------------
  // Wake Lock: pede ao sistema operativo para NÃO apagar o ecrã enquanto a
  // navegação está aberta. Sem isto, iOS apaga ao fim de ~30 s e o GPS pausa.
  // A API (`navigator.wakeLock`) está em todos os browsers modernos (Safari 16.4+).
  // Re-adquirimos o lock se a página volta a ficar visível (após mudança de aba).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!open) return;

    async function acquire() {
      try {
        const nav = navigator as unknown as {
          wakeLock?: { request: (type: "screen") => Promise<unknown> };
        };
        if (nav.wakeLock && typeof nav.wakeLock.request === "function") {
          wakeLockRef.current = await nav.wakeLock.request("screen");
        }
      } catch (e) {
        console.warn("[SOT] Wake Lock indisponível:", e);
      }
    }

    void acquire();

    function onVisibility() {
      if (document.visibilityState === "visible") void acquire();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      const lock = wakeLockRef.current as { release?: () => Promise<void> } | null;
      if (lock && typeof lock.release === "function") {
        lock.release().catch(() => {
          /* ignore */
        });
      }
      wakeLockRef.current = null;
    };
  }, [open]);

  /**
   * Quando a tela está trancada, aplica várias técnicas para escurecer o máximo
   * possível do dispositivo, inclusive a status bar (hora/wifi/bateria):
   *
   *  1. `filter: brightness(0)` no `<html>` — qualquer pixel fora da overlay vai a preto.
   *  2. Altera `<meta name="theme-color">` para `#000000` — pinta a status bar no
   *     Chrome Android e em alguns Safaris (PWA standalone).
   *  3. Pede Fullscreen API (`requestFullscreen`) — em Chrome Android esconde
   *     totalmente a status bar + barra de URL. (Safari mobile não suporta
   *     fullscreen em browser normal, só funciona em PWA standalone.)
   */
  useEffect(() => {
    if (!screenLocked) return;

    const html = document.documentElement;
    const prevFilter = html.style.filter;
    html.style.filter = "brightness(0)";

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    const prevThemeContent = metaThemeColor?.getAttribute("content") ?? null;
    if (metaThemeColor) metaThemeColor.setAttribute("content", "#000000");

    let wentFullscreen = false;
    try {
      if (!document.fullscreenElement && html.requestFullscreen) {
        void html
          .requestFullscreen({ navigationUI: "hide" } as FullscreenOptions)
          .then(() => {
            wentFullscreen = true;
          })
          .catch(() => {
            /* iOS Safari recusa fora de PWA — ok */
          });
      }
    } catch {
      /* ignore */
    }

    return () => {
      html.style.filter = prevFilter;
      if (metaThemeColor) {
        if (prevThemeContent !== null) {
          metaThemeColor.setAttribute("content", prevThemeContent);
        } else {
          metaThemeColor.removeAttribute("content");
        }
      }
      if (wentFullscreen && document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {
          /* ignore */
        });
      }
    };
  }, [screenLocked]);

  /**
   * Handler do duplo-clique para destrancar a tela. Se o segundo toque vier num
   * intervalo curto (< 380 ms), considera-se duplo-tap e desbloqueia.
   */
  function handleLockOverlayTap() {
    const now = Date.now();
    if (now - lastLockTapRef.current < 380) {
      setScreenLocked(false);
      lastLockTapRef.current = 0;
    } else {
      lastLockTapRef.current = now;
    }
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

      {/* Botão flutuante: trancar tela (canto superior esquerdo). */}
      <button
        type="button"
        onClick={() => {
          lastLockTapRef.current = 0;
          setScreenLocked(true);
        }}
        className="pointer-events-auto absolute left-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-slate-900/85 text-white shadow-lg backdrop-blur active:bg-slate-900"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 8.25rem)" }}
        aria-label="Desligar a tela (poupa brilho/bateria — toque duas vezes para voltar)"
        title="Desligar tela"
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {/* Símbolo universal de "power" — arco aberto no topo + traço vertical. */}
          <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
          <line x1="12" y1="2" x2="12" y2="12" />
        </svg>
      </button>

      {/* Chip flutuante: contagem de outras viaturas com saída em curso (tempo real).
          Surge no canto superior direito quando há ≥ 1 outra viatura activa.
          Cor laranja igual aos pinos no mapa para o motorista identificar
          visualmente. */}
      {otherPins.length > 0 ? (
        <div
          className="pointer-events-none absolute right-3 z-10 flex h-11 items-center gap-2 rounded-full bg-orange-500/95 px-3 text-white shadow-lg shadow-orange-900/40 backdrop-blur"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 8.25rem)" }}
          role="status"
          aria-label={`${otherPins.length} ${
            otherPins.length === 1 ? "outra viatura" : "outras viaturas"
          } com saída em curso`}
          title={`${otherPins.length} ${
            otherPins.length === 1 ? "outra viatura" : "outras viaturas"
          } com saída em curso`}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
            <path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11h.5a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 19.5 19H19v1.25A.75.75 0 0 1 18.25 21h-1.5a.75.75 0 0 1-.75-.75V19H8v1.25A.75.75 0 0 1 7.25 21h-1.5A.75.75 0 0 1 5 20.25V19h-.5A1.5 1.5 0 0 1 3 17.5v-5A1.5 1.5 0 0 1 4.5 11H5zm2.16-.5h9.68l-1-3.3a.5.5 0 0 0-.48-.37H8.64a.5.5 0 0 0-.48.37l-1 3.3zM7 16a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm10 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />
          </svg>
          <span className="text-sm font-bold uppercase tracking-wider leading-none">
            {otherPins.length}
          </span>
          <span className="text-[0.7rem] font-semibold leading-none">
            {otherPins.length === 1 ? "viatura" : "viaturas"}
          </span>
        </div>
      ) : null}

      {/* Barra inferior: botão PARE em destaque. */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center gap-2 bg-gradient-to-t from-black/55 to-transparent px-3 pt-6"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={() => setConfirmStopOpen(true)}
          className="pointer-events-auto flex h-14 w-full max-w-md items-center justify-center gap-2 rounded-2xl bg-red-600 text-lg font-extrabold uppercase tracking-[0.18em] text-white shadow-lg shadow-red-900/40 active:bg-red-700"
          aria-label="Parar navegação"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
            <path d="M6 6h12v12H6z" />
          </svg>
          Pare
        </button>
      </div>

      {/* Seletor de destino ambíguo removido: o motorista já escolhe o endereço
          canónico durante a digitação no campo «Destino» (autocomplete estilo
          Waze/Maps). Aqui apenas seleccionamos automaticamente o candidato mais
          próximo. */}

      {/* Animação de despedida: escurece gradualmente até preto enquanto uma mão
          acena no centro. Visível só durante ~2,2 s quando o motorista escolheu
          "Segundo plano". No fim, dá lugar à `screenLocked` overlay (que é mantida
          totalmente preta). */}
      {farewellAnimating && !screenLocked ? (
        <div
          className="sot-farewell-overlay pointer-events-auto absolute inset-0 z-[60] flex flex-col items-center justify-center gap-4"
          aria-hidden="true"
        >
          <span className="sot-farewell-hand text-7xl">👋</span>
          <span className="sot-farewell-text text-base font-semibold uppercase tracking-[0.18em] text-white">
            Até já — boa viagem
          </span>
        </div>
      ) : null}

      {/* Overlay 100 % preta para poupar brilho/bateria.
          Tapa todo o ecrã — incluindo barras e botões — para minimizar emissão de luz
          (ideal em painéis OLED). Desbloqueia com duplo toque em qualquer parte.
          A navegação por voz continua a anunciar manobras normalmente. */}
      {screenLocked ? (
        <div
          className="absolute inset-0 z-[50] cursor-pointer select-none"
          style={{ background: "#000" }}
          onClick={handleLockOverlayTap}
          role="button"
          aria-label="Tela trancada. Toque duas vezes para destravar."
          tabIndex={0}
        />
      ) : null}

      {/* Modal de confirmação para parar a navegação. */}
      {confirmStopOpen ? (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sot-nav-stop-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfirmStopOpen(false);
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id="sot-nav-stop-title" className="mb-1 text-lg font-bold text-slate-900">
              Parar navegação?
            </h2>
            <p className="mb-4 text-sm text-slate-600">
              O mapa irá fechar-se. O rastreamento de localização da viatura continuará
              ativo até finalizar a saída.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="h-11 flex-1 rounded-xl"
                onClick={() => setConfirmStopOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                className="h-11 flex-1 rounded-xl bg-red-600 font-bold uppercase tracking-wider text-white hover:bg-red-700"
                onClick={() => {
                  window.speechSynthesis?.cancel?.();
                  setConfirmStopOpen(false);
                  onClose();
                }}
              >
                Parar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
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

