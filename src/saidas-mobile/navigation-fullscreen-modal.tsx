/**
 * Modal de navegação em ecrã cheio.
 *
 * Após o motorista tocar em "Iniciar Saída" no SOT mobile, este componente abre por cima
 * da app e mostra:
 *  - Mapa Leaflet a todo o ecrã com a rota desenhada (OSRM).
 *  - Marcadores de origem (posição atual, azul) e destino (vermelho).
 *  - Barra superior com nome do destino, distância e tempo previsto.
 *  - Botão "Iniciar navegação" (canto sup. dir.) que aproxima a câmara à posição actual
 *    e a partir daí segue o motorista mantendo o ícone na parte inferior do ecrã,
 *    estilo Waze. Quando o motorista interage manualmente com o mapa, o botão muda
 *    para "Recentrar".
 *  - Botão vermelho "PARE" (base) com modal de confirmação.
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
  geocodeAddresses,
  maneuverToPortuguese,
} from "../lib/navigationRouting";

const OSM_TILE = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/**
 * `leaflet-rotate` não publica tipos. Aqui declaramos só o subconjunto que usamos.
 * — `rotate: true` activa a rotação.
 * — `setBearing(deg)` roda o mapa (0 = norte para cima).
 */
type RotatableMap = L.Map & {
  setBearing: (deg: number) => void;
};
type RotatableMapOptions = L.MapOptions & {
  rotate?: boolean;
  rotateControl?: boolean;
  touchRotate?: boolean;
  bearing?: number;
};

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
  /** True quando estamos no meio de uma animação programática (evita confundir com pan manual). */
  const animatingRef = useRef<boolean>(false);
  /** Última heading conhecida (graus, 0 = norte). Usada para rotar o ícone do motorista. */
  const headingRef = useRef<number | null>(null);
  /** True se o plugin `leaflet-rotate` carregou em runtime sem erros. */
  const rotateAvailableRef = useRef<boolean>(false);
  /** Timestamp do último toque na overlay preta — usado para detectar duplo-clique. */
  const lastLockTapRef = useRef<number>(0);
  /** Wake Lock activo (mantém ecrã aceso durante a navegação). */
  const wakeLockRef = useRef<unknown | null>(null);

  const [origin, setOrigin] = useState<Coord | null>(null);
  const [destination, setDestination] = useState<GeocodeResult | null>(null);
  /**
   * Candidatos devolvidos pelo geocoder quando o nome do destino é ambíguo
   * (ex.: vários "Hospital São José" pelo país). Sempre ordenados do mais próximo
   * para o mais distante em relação a `origin`. Quando há > 1 candidato e o motorista
   * ainda não escolheu, mostramos uma lista de selecção.
   */
  const [candidates, setCandidates] = useState<
    Array<GeocodeResult & { distanceMeters: number }>
  >([]);
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
  /** Modo "seguir motorista": câmara acompanha automaticamente a posição actual. */
  const [isFollowing, setIsFollowing] = useState(false);
  /** True quando o utilizador interagiu manualmente com o mapa após entrar em follow mode. */
  const [userInterrupted, setUserInterrupted] = useState(false);
  /** Mantém o último valor de `isFollowing` acessível sem re-criar callbacks. */
  const isFollowingRef = useRef(false);
  useEffect(() => {
    isFollowingRef.current = isFollowing;
  }, [isFollowing]);

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
  // não conseguimos ordenar os candidatos por distância. Se houver > 1 resultado,
  // a UI mostra uma lista para o motorista escolher; caso contrário, selecciona
  // automaticamente o único candidato.
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
      // Ordena por distância à posição actual (mais próximo primeiro).
      const withDistance = results
        .map((r) => ({ ...r, distanceMeters: haversineMeters(origin, { lat: r.lat, lng: r.lng }) }))
        .sort((a, b) => a.distanceMeters - b.distanceMeters);
      if (withDistance.length === 1) {
        setDestination(withDistance[0]);
      } else {
        setCandidates(withDistance);
      }
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
    let onDragStart: (() => void) | null = null;
    let rafId = 0;
    let tmo = 0;

    /**
     * Inicializa o mapa. Tenta carregar dinamicamente `leaflet-rotate`; se falhar
     * (por incompatibilidade com a versão de Leaflet, bug do plugin, etc.) cai
     * graciosamente para um mapa sem rotação — preserva toda a app de crashar.
     */
    async function init() {
      let rotateOk = false;
      try {
        await import("leaflet-rotate");
        rotateOk = true;
      } catch (err) {
        console.warn("[SOT] leaflet-rotate indisponível — mapa sem rotação:", err);
        rotateOk = false;
      }
      if (cancelled || !containerRef.current) return;
      rotateAvailableRef.current = rotateOk;

      const mapOptions: RotatableMapOptions = rotateOk
        ? {
            zoomControl: true,
            attributionControl: true,
            rotate: true,
            rotateControl: false,
            touchRotate: false,
            bearing: 0,
          }
        : {
            zoomControl: true,
            attributionControl: true,
          };

      try {
        map = L.map(el, mapOptions).setView([-22.9, -43.2], 6);
      } catch (err) {
        // Última proteção: se mesmo assim crashar (ex.: plugin partido), cria mapa
        // sem opções de rotação.
        console.warn("[SOT] L.map falhou com opções rotativas, a tentar sem:", err);
        rotateAvailableRef.current = false;
        map = L.map(el, { zoomControl: true, attributionControl: true }).setView(
          [-22.9, -43.2],
          6,
        );
      }

      L.tileLayer(OSM_TILE, { maxZoom: 19, attribution: OSM_ATTRIB }).addTo(map);
      mapRef.current = map;

      onDragStart = () => {
        if (animatingRef.current) return;
        if (isFollowingRef.current) {
          setIsFollowing(false);
          setUserInterrupted(true);
        }
      };
      map.on("dragstart", onDragStart);

      rafId = requestAnimationFrame(() => {
        map?.invalidateSize();
        requestAnimationFrame(() => map?.invalidateSize());
      });
      tmo = window.setTimeout(() => map?.invalidateSize(), 320);
    }

    void init();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      window.clearTimeout(tmo);
      if (map) {
        if (onDragStart) map.off("dragstart", onDragStart);
        map.remove();
      }
      mapRef.current = null;
      routeLayerRef.current = null;
      driverMarkerRef.current = null;
      destMarkerRef.current = null;
      rotateAvailableRef.current = false;
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

    // Aplica rotação ao DIV interno. Quando o **mapa** está a rodar (plugin activo
    // + modo follow) deixamos o ícone apontado para cima — o mapa já gira por baixo.
    // Caso contrário, o ícone gira para mostrar a direcção de marcha.
    const el = driverMarkerRef.current.getElement?.();
    const rot = el?.querySelector?.(".sot-nav-driver-rotate") as HTMLElement | null;
    if (rot) {
      const h = headingRef.current;
      const mapRotating = isFollowingRef.current && rotateAvailableRef.current;
      if (mapRotating) {
        rot.style.transform = "rotate(0deg)";
      } else if (h !== null && Number.isFinite(h)) {
        rot.style.transform = `rotate(${h}deg)`;
      } else {
        rot.style.transform = "rotate(0deg)";
      }
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
        // Heading só é fiável quando há velocidade — ignoramos abaixo de 0.5 m/s (~1.8 km/h).
        const speed = typeof pos.coords.speed === "number" ? pos.coords.speed : null;
        const rawHeading = typeof pos.coords.heading === "number" ? pos.coords.heading : null;
        if (rawHeading !== null && Number.isFinite(rawHeading) && (speed === null || speed > 0.5)) {
          headingRef.current = rawHeading;
        }
        setOrigin(here);
        if (driverMarkerRef.current) driverMarkerRef.current.setLatLng([here.lat, here.lng]);
        maybeSpeakNextManeuver(here);

        // Se estamos no modo seguir, faz pan suave da câmara para acompanhar o motorista
        // (mantendo-o na parte inferior do ecrã — câmara atrás, estilo Waze) e roda o
        // mapa para a direcção de marcha apontar para cima, caso o plugin esteja activo.
        const map = mapRef.current as RotatableMap | null;
        if (map && isFollowingRef.current) {
          animatingRef.current = true;
          try {
            if (rotateAvailableRef.current) {
              const h = headingRef.current;
              if (h !== null && Number.isFinite(h) && typeof map.setBearing === "function") {
                try {
                  map.setBearing(360 - h);
                } catch (err) {
                  console.warn("[SOT] setBearing falhou:", err);
                }
              }
            }
            panSoDriverSitsAtBottom(map, here, 0.6);
          } finally {
            window.setTimeout(() => {
              animatingRef.current = false;
            }, 700);
          }
        }
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
  // Acções dos botões.
  // ---------------------------------------------------------------------------

  /**
   * Coloca a posição actual na parte inferior do ecrã (~78 % da altura) para criar
   * a sensação de câmara "atrás" do veículo, como no Waze. Usa `panBy` em screen
   * pixels — assim funciona mesmo com o mapa rotado (leaflet-rotate ajusta).
   */
  function panSoDriverSitsAtBottom(map: L.Map, here: Coord, durationSec: number) {
    try {
      const sz = map.getSize();
      const desired = L.point(sz.x / 2, sz.y * 0.78);
      const current = map.latLngToContainerPoint([here.lat, here.lng]);
      const dx = current.x - desired.x;
      const dy = current.y - desired.y;
      // panBy([dx, dy]) move a vista por (dx, dy) — o ponto fixo move-se (-dx, -dy)
      // no ecrã, levando o motorista de `current` até `desired`.
      map.panBy([dx, dy], { animate: true, duration: durationSec });
    } catch {
      // Fallback: pan simples para o centro.
      map.panTo([here.lat, here.lng], { animate: true, duration: durationSec });
    }
  }

  /**
   * Activa o modo "seguir motorista": aproxima a câmara à posição actual com uma
   * animação suave (estilo Waze) e a partir daí faz pan automático a cada
   * actualização de `watchPosition`. A posição actual fica na parte inferior do ecrã.
   */
  function startFollowing() {
    const map = mapRef.current as RotatableMap | null;
    if (!map || !origin) return;
    setIsFollowing(true);
    setUserInterrupted(false);
    animatingRef.current = true;
    try {
      map.flyTo([origin.lat, origin.lng], 18, { animate: true, duration: 1.4 });
      if (rotateAvailableRef.current) {
        const h = headingRef.current;
        if (h !== null && Number.isFinite(h) && typeof map.setBearing === "function") {
          try {
            map.setBearing(360 - h);
          } catch (err) {
            console.warn("[SOT] setBearing falhou:", err);
          }
        }
      }
      // Depois da animação principal terminar, empurra a vista para o motorista
      // ficar visualmente na parte de baixo — simula câmara atrás do veículo.
      window.setTimeout(() => {
        if (!isFollowingRef.current || !mapRef.current || !origin) return;
        panSoDriverSitsAtBottom(mapRef.current, origin, 0.4);
      }, 1500);
    } finally {
      window.setTimeout(() => {
        animatingRef.current = false;
      }, 2100);
    }
  }

  /**
   * Sai do modo "seguir motorista" e afasta a câmara para a vista geral da rota
   * (a mesma que aparece inicialmente, com origem + destino visíveis).
   */
  function exitFollowing() {
    const map = mapRef.current as RotatableMap | null;
    setIsFollowing(false);
    setUserInterrupted(false);
    if (!map) return;
    animatingRef.current = true;
    try {
      const poly = routeLayerRef.current;
      if (poly) {
        // `flyToBounds` é uma animação suave (não brusca como fitBounds).
        map.flyToBounds(poly.getBounds(), { padding: [80, 80], duration: 1.2 });
      } else if (origin) {
        // Sem rota desenhada (caso raro): apenas afasta o zoom da posição actual.
        map.flyTo([origin.lat, origin.lng], 13, { animate: true, duration: 1.0 });
      }
    } finally {
      window.setTimeout(() => {
        animatingRef.current = false;
      }, 1300);
    }
  }

  // Quando sai-se do modo seguir, alinha o mapa com o norte para cima de novo (se houve rotação).
  useEffect(() => {
    if (isFollowing) return;
    const map = mapRef.current as RotatableMap | null;
    if (map && rotateAvailableRef.current && typeof map.setBearing === "function") {
      try {
        map.setBearing(0);
      } catch (err) {
        console.warn("[SOT] setBearing(0) falhou:", err);
      }
    }
    const el = driverMarkerRef.current?.getElement?.();
    const rot = el?.querySelector?.(".sot-nav-driver-rotate") as HTMLElement | null;
    if (rot) {
      const h = headingRef.current;
      rot.style.transform = h !== null && Number.isFinite(h) ? `rotate(${h}deg)` : "rotate(0deg)";
    }
  }, [isFollowing]);

  // Limpa o estado de geocoding/rota assim que o modal fecha — garantindo que a
  // próxima abertura recomeça do zero (e re-pergunta o destino se ambíguo).
  useEffect(() => {
    if (open) return;
    setDestination(null);
    setCandidates([]);
    setRoute(null);
    setError(null);
    setLoading("");
    setIsFollowing(false);
    setUserInterrupted(false);
    setScreenLocked(false);
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

      {/* Botão flutuante: trancar tela (canto superior esquerdo, alinhado em altura
          com o botão Iniciar navegação à direita). */}
      <button
        type="button"
        onClick={() => {
          lastLockTapRef.current = 0;
          setScreenLocked(true);
        }}
        className="pointer-events-auto absolute left-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-slate-900/85 text-white shadow-lg backdrop-blur active:bg-slate-900"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 8.25rem)" }}
        aria-label="Trancar a tela (poupa brilho/bateria — toque duas vezes para destravar)"
        title="Trancar tela"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          {/* Ícone de cadeado fechado. */}
          <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 1 1 6 0v3H9z" />
        </svg>
      </button>

      {/* Botão flutuante: três estados.
          - !isFollowing && !userInterrupted → verde "Iniciar navegação" (entra em follow)
          - isFollowing                       → vermelho "Sair" (afasta para a vista geral da rota)
          - !isFollowing && userInterrupted   → verde "Recentrar" (volta a entrar em follow)
       */}
      {origin ? (
        <button
          type="button"
          onClick={isFollowing ? exitFollowing : startFollowing}
          className={
            "pointer-events-auto absolute right-3 z-10 flex h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-bold uppercase tracking-[0.12em] text-white shadow-lg " +
            (isFollowing
              ? "bg-red-600 shadow-red-900/40 active:bg-red-700"
              : "bg-emerald-600 shadow-emerald-900/40 active:bg-emerald-700")
          }
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 8.25rem)" }}
          aria-label={
            isFollowing
              ? "Sair da navegação e ver toda a rota"
              : userInterrupted
                ? "Recentrar no motorista"
                : "Iniciar navegação"
          }
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
            {isFollowing ? (
              // Ícone "fechar/sair" — X
              <path d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z" />
            ) : userInterrupted ? (
              // Ícone alvo — recentrar
              <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 3h-2.07A7 7 0 0 0 13 5.07V3h-2v2.07A7 7 0 0 0 5.07 11H3v2h2.07A7 7 0 0 0 11 18.93V21h2v-2.07A7 7 0 0 0 18.93 13H21z" />
            ) : (
              // Ícone navegação — seta
              <path d="M12 2 5 21l7-4 7 4z" />
            )}
          </svg>
          {isFollowing ? "Sair" : userInterrupted ? "Recentrar" : "Iniciar navegação"}
        </button>
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

      {/* Lista de selecção de destino (quando o nome é ambíguo).
          Apresentada do mais próximo para o mais distante; o motorista escolhe. */}
      {!destination && candidates.length > 1 ? (
        <div
          className="absolute inset-0 z-20 flex items-end justify-center bg-black/55 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sot-nav-pick-title"
        >
          <div className="w-full max-w-md rounded-t-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:rounded-2xl">
            <h2 id="sot-nav-pick-title" className="mb-1 text-base font-bold text-slate-900">
              Escolher destino
            </h2>
            <p className="mb-3 text-xs text-slate-600">
              Existem várias localizações para
              <span className="font-semibold"> «{destinationQuery}»</span>. Toque na correcta —
              estão ordenadas da mais próxima para a mais distante.
            </p>
            <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
              {candidates.map((c, idx) => (
                <li key={`${c.lat}-${c.lng}-${idx}`}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 px-2 py-3 text-left hover:bg-slate-50 active:bg-slate-100"
                    onClick={() => {
                      const { distanceMeters: _ignored, ...picked } = c;
                      void _ignored;
                      setDestination(picked);
                      setCandidates([]);
                    }}
                  >
                    <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                      {idx + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-medium text-slate-900">
                        {c.displayName}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        em linha reta {formatDistance(c.distanceMeters)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex">
              <Button
                variant="outline"
                className="h-10 flex-1 rounded-xl"
                onClick={() => {
                  window.speechSynthesis?.cancel?.();
                  onClose();
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
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

