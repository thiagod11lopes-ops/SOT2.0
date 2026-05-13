/**
 * Modal de navegação em ecrã cheio.
 *
 * Após o motorista tocar em "Iniciar Saída" no SOT mobile, este componente abre
 * por cima da app e mostra:
 *  - Mapa **Google Maps** a todo o ecrã com a rota desenhada (OSRM).
 *  - Marcadores de origem (chevron azul rotativo) e destino (pino vermelho).
 *  - Pinos laranjas das **outras viaturas com saída em curso** (tempo real,
 *    via `useDriverActiveLocations`). A placa aparece como label permanente;
 *    o toque abre uma `InfoWindow` com o timestamp da última posição.
 *  - Barra superior com nome do destino, distância e tempo previsto.
 *  - Botão "Voltar" discreto (canto inferior esquerdo) — fecha o modal e
 *    devolve o motorista ao quadro de saídas. **Não** cancela o
 *    rastreamento de localização da viatura.
 *  - Acompanhamento contínuo da posição via `useWatchUserLocation` (apenas
 *    actualiza o marcador do motorista — o motorista controla o mapa
 *    manualmente após o primeiro `fitBounds`).
 *  - Anúncios de manobra por voz (Web Speech API) à medida que o motorista
 *    se aproxima de cada passo.
 *  - Wake Lock (`useScreenWakeLock`) para o ecrã não apagar em viagem.
 *
 * Stack: Maps JavaScript API (Google) para renderização + OSRM (gratuito)
 * para rotas + Nominatim (gratuito) para geocoding. A chave Google é lida
 * do secret `VITE_GOOGLE_MAPS_API_KEY` (sem chave, mostra placeholder).
 */

import {
  GoogleMap,
  InfoWindow,
  Marker,
  Polyline,
  useJsApiLoader,
  type Libraries,
} from "@react-google-maps/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useDriverActiveLocations } from "../hooks/useDriverActiveLocations";
import { useScreenWakeLock } from "../hooks/useScreenWakeLock";
import { useWatchUserLocation } from "../hooks/useWatchUserLocation";
import { primaryPlacaFromViaturasField } from "../lib/viaturaPlaca";
import { setMobileNavigationActive } from "./mobile-navigation-mode";
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

/**
 * Bibliotecas adicionais carregadas com o Maps JS. Mantido fora do componente
 * (referência estável) — caso contrário o `useJsApiLoader` re-injecta o script
 * a cada render, gerando o aviso "LoadScript has been reloaded unintentionally".
 */
const GMAPS_LIBRARIES: Libraries = ["geometry"];

/**
 * Mesmo `id` que o `GoogleMapComponent` reutilizável — `useJsApiLoader`
 * partilha o script entre todas as instâncias com o mesmo id.
 */
const GMAPS_LOADER_ID = "google-maps-script";

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

/** Estilo CSS do contentor do `<GoogleMap>` — ocupa todo o `<div>` pai. */
const MAP_CONTAINER_STYLE: React.CSSProperties = {
  width: "100%",
  height: "100%",
};

/** Centro inicial enquanto o GPS ainda não fixou — Rio de Janeiro, BR. */
const DEFAULT_CENTER: Coord = { lat: -22.9, lng: -43.2 };

/** Opções do `<GoogleMap>` — UI minimalista, sem botões que distraem. */
const MAP_OPTIONS: google.maps.MapOptions = {
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: false,
  rotateControl: false,
  scaleControl: false,
  zoomControl: true,
  clickableIcons: false,
  gestureHandling: "greedy",
  disableDefaultUI: false,
  keyboardShortcuts: false,
};

/** Estilo da polilinha da rota — azul sólido, espessura confortável em mobile. */
const ROUTE_POLYLINE_OPTIONS: google.maps.PolylineOptions = {
  strokeColor: "#2563eb",
  strokeOpacity: 0.9,
  strokeWeight: 6,
  geodesic: false,
  clickable: false,
  zIndex: 5,
};

/**
 * Estilo da linha recta de fallback (quando o servidor OSRM não responde).
 * Cor cinzenta + linha tracejada para o motorista perceber visualmente que
 * **não é** uma rota calculada — é só uma indicação da direcção do destino.
 */
const FALLBACK_LINE_OPTIONS: google.maps.PolylineOptions = {
  strokeColor: "#94a3b8",
  strokeOpacity: 0,
  strokeWeight: 0,
  geodesic: true,
  clickable: false,
  zIndex: 4,
  icons: [
    {
      icon: { path: "M 0,-1 0,1", strokeOpacity: 0.85, scale: 3 },
      offset: "0",
      repeat: "12px",
    },
  ],
};

export function NavigationFullScreenModal({
  open,
  record,
  onClose,
  initialScreenLocked = false,
}: Props) {
  // ─── Loader do Google Maps script ────────────────────────────────────────
  // Lê a chave da variável Vite (substituída no build pelo workflow GitHub).
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";
  const { isLoaded: gmapsLoaded, loadError: gmapsLoadError } = useJsApiLoader({
    id: GMAPS_LOADER_ID,
    googleMapsApiKey: apiKey,
    libraries: GMAPS_LIBRARIES,
    language: "pt-BR",
    region: "BR",
  });

  // ─── Estado / refs ───────────────────────────────────────────────────────
  /** Instância do mapa Google (definida no `onLoad`). Usada para `fitBounds`. */
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const spokenStepIdxRef = useRef<number>(-1);
  /**
   * Última heading válida (graus, 0 = norte). Mantida em state para forçar
   * re-render do ícone do motorista a cada actualização da bússola.
   */
  const [heading, setHeading] = useState<number | null>(null);
  /**
   * `true` enquanto a rota desta sessão estiver a ser pedida ou já foi recebida —
   * evita refetch a cada actualização do GPS (que sobrescrevia o `route` e
   * disparava `fitBounds`, perdendo o zoom/pan que o motorista tinha aplicado).
   */
  const routingStartedRef = useRef(false);
  /** `true` depois da primeira vez que enquadramos a vista para a rota. */
  const routeFittedRef = useRef(false);
  /** `true` após a primeira centragem na posição do motorista (antes da rota). */
  const centeredOnFirstFixRef = useRef(false);

  /**
   * Centro "congelado" que passamos ao prop `center` do `<GoogleMap>`. O
   * `react-google-maps/api` re-chama `map.setCenter()` sempre que este prop
   * muda — se ligássemos directamente ao `origin`, o mapa ficaria a saltar
   * a cada tick do GPS, sobrescrevendo o `fitBounds` da rota e o pan/zoom
   * do motorista. Por isso só actualizamos uma vez (na primeira posição) e
   * depois deixamos o controlo programático/manual tomar conta.
   */
  const [staticCenter, setStaticCenter] = useState<Coord>(DEFAULT_CENTER);
  const [staticZoom, setStaticZoom] = useState<number>(6);

  /** Placa **do motorista actual** — filtrada da lista de outras viaturas. */
  const currentPlacaNorm = useMemo(
    () => normalizePlaca(primaryPlacaFromViaturasField(record.viaturas)),
    [record.viaturas],
  );

  /** Subscrição realtime à coleção `driver_active_locations` (outras viaturas). */
  const { pins: activePins } = useDriverActiveLocations(open);
  const otherPins = useMemo(
    () => activePins.filter((p) => normalizePlaca(p.placa) !== currentPlacaNorm),
    [activePins, currentPlacaNorm],
  );
  /** Pin actualmente seleccionado (mostra `InfoWindow` com a placa + timestamp). */
  const [selectedOtherPin, setSelectedOtherPin] = useState<string | null>(null);

  /** Timestamp do último toque na overlay preta — usado para detectar duplo-clique. */
  const lastLockTapRef = useRef<number>(0);

  const [origin, setOrigin] = useState<Coord | null>(null);
  const [destination, setDestination] = useState<GeocodeResult | null>(null);
  const [route, setRoute] = useState<DrivingRoute | null>(null);
  const [loading, setLoading] = useState<"" | "locating" | "geocoding" | "routing">("");
  const [error, setError] = useState<string | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  /** Overlay 100 % preta que cobre tudo enquanto activa. Desbloqueia com duplo toque. */
  const [screenLocked, setScreenLocked] = useState(false);
  /** Animação "Até já — boa viagem" antes de bloquear a tela (modo segundo plano). */
  const [farewellAnimating, setFarewellAnimating] = useState(false);

  // ─── Rastreamento GPS contínuo via hook reutilizável ─────────────────────
  // Activo enquanto o modal estiver aberto. Cleanup automático no unmount.
  const { position: gpsPosition, error: gpsError } = useWatchUserLocation({
    enabled: open,
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 30000,
  });

  // ─── Wake Lock via hook reutilizável ─────────────────────────────────────
  // Mantém o ecrã ligado enquanto o modal está aberto, prevenindo throttling
  // de GPS pelo iOS/Android. Liberta no unmount automaticamente.
  useScreenWakeLock({ enabled: open });

  /**
   * Publica o estado "modo navegação activo" para o `SaidasLayout` esconder a
   * barra superior (Detalhe de Serviço, Vistoria, Escala do Pão…) e a barra
   * inferior (Administrativas/Ambulância) enquanto este modal está visível.
   */
  useEffect(() => {
    setMobileNavigationActive(open);
    return () => {
      setMobileNavigationActive(false);
    };
  }, [open]);

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
  // 1) Sincronizar `origin` + `heading` a partir do hook GPS.
  //    A primeira emissão serve como "initial fix"; emissões seguintes
  //    actualizam o marcador do motorista. A heading só é considerada
  //    quando há velocidade ≥ 0,5 m/s (≈ 1,8 km/h) — abaixo disso o valor
  //    do sensor é ruído puro.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!open) return;
    if (gpsPosition) {
      const next: Coord = { lat: gpsPosition.lat, lng: gpsPosition.lng };
      setOrigin(next);
      const rawHeading = gpsPosition.heading;
      const speed = gpsPosition.speed;
      if (
        rawHeading !== null &&
        Number.isFinite(rawHeading) &&
        (speed === null || speed > 0.5)
      ) {
        setHeading(rawHeading);
      }
      if (loading === "locating") setLoading("");
    }
  }, [open, gpsPosition, loading]);

  // ---------------------------------------------------------------------------
  // 1b) Mostrar mensagem de erro de GPS (permissão negada, etc.).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!open) return;
    if (!gpsError) return;
    setError(
      gpsError.code === gpsError.PERMISSION_DENIED
        ? "Permissão de localização negada. Active nas definições do telemóvel."
        : "Não foi possível obter a sua localização atual.",
    );
    setLoading("");
  }, [open, gpsError]);

  // ---------------------------------------------------------------------------
  // 1c) Iniciar status "locating" assim que abre o modal (até o GPS responder).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!open) return;
    if (!("geolocation" in navigator)) {
      setError("Este dispositivo não suporta geolocalização.");
      return;
    }
    setError(null);
    if (!gpsPosition) {
      setLoading("locating");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ---------------------------------------------------------------------------
  // Refs sempre actualizados com `origin` e `destination` — usados pelos
  // efeitos de geocoding/routing para evitar re-execuções (e cancelamentos)
  // a cada tick do GPS. Sem isto, `setOrigin({ lat, lng })` cria um novo
  // objecto a cada update; o efeito vê `origin` mudar, faz cleanup com
  // `cancelled = true`, e a promise OSRM já em curso descarta o resultado.
  // É exactamente isto que fazia o log "OSRM devolveu rota: ..." aparecer
  // mas `setRoute()` nunca ser chamado.
  // ---------------------------------------------------------------------------
  const originRef = useRef<Coord | null>(null);
  const destinationRef = useRef<GeocodeResult | null>(null);
  useEffect(() => {
    originRef.current = origin;
  }, [origin]);
  useEffect(() => {
    destinationRef.current = destination;
  }, [destination]);

  /** Booleano estável: só muda quando origin/destination transitam null↔valor. */
  const hasOrigin = origin !== null;
  const hasDestination = destination !== null;

  // ---------------------------------------------------------------------------
  // 2) Geocodificar o destino. Espera por `origin` antes de pesquisar — sem
  //    origem, não conseguimos ordenar os candidatos por distância. Auto-escolhe
  //    sempre o candidato mais próximo (o motorista já escolheu o endereço
  //    durante a digitação no campo «Destino» com autocomplete).
  //
  //    Importante: depende de `hasOrigin` (boolean) e NÃO de `origin` (objecto).
  //    Assim os ticks do GPS não cancelam o geocoding em curso.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!open) return;
    if (!destinationQuery) {
      setError(
        "Esta saída não tem destino preenchido (hospital/bairro/cidade). Preencha antes de navegar.",
      );
      return;
    }
    if (!hasOrigin) return;
    if (hasDestination) return;
    let cancelled = false;
    setLoading("geocoding");
    geocodeAddresses(destinationQuery, 6).then((results) => {
      if (cancelled) return;
      if (results.length === 0) {
        setError(`Não foi possível localizar "${destinationQuery}" no mapa.`);
        setLoading("");
        return;
      }
      const refOrigin = originRef.current;
      const withDistance = results
        .map((r) => ({
          ...r,
          distanceMeters: refOrigin
            ? haversineMeters(refOrigin, { lat: r.lat, lng: r.lng })
            : 0,
        }))
        .sort((a, b) => a.distanceMeters - b.distanceMeters);
      const { distanceMeters: _ignored, ...picked } = withDistance[0];
      void _ignored;
      setDestination(picked);
      setLoading("");
    });
    return () => {
      cancelled = true;
    };
  }, [open, destinationQuery, hasOrigin, hasDestination]);

  // ---------------------------------------------------------------------------
  // 3) Calcular rota assim que origem + destino existirem.
  //    A função `fetchDrivingRoute` já trata timeout (10 s/endpoint) + failover
  //    automático entre dois servidores OSRM; se ambos falharem, mostramos um
  //    erro + botão "Tentar novamente".
  //
  //    Importante: depende de `hasOrigin`/`hasDestination` (booleans) e NÃO
  //    de `origin`/`destination` (objectos). Os valores reais são lidos via
  //    refs no momento do fetch. Assim ticks do GPS não disparam re-execuções
  //    do efeito (e cancelamentos da promise OSRM em curso).
  // ---------------------------------------------------------------------------
  /** Contador de tentativas (cada incremento dispara nova chamada OSRM). */
  const [routeAttempt, setRouteAttempt] = useState(0);
  useEffect(() => {
    if (!open || !hasOrigin || !hasDestination) return;
    if (routingStartedRef.current && routeAttempt === 0) return;
    const usedOrigin = originRef.current;
    const usedDest = destinationRef.current;
    if (!usedOrigin || !usedDest) return;
    routingStartedRef.current = true;
    let cancelled = false;
    setError(null);
    setLoading("routing");
    console.info(
      `[SOT] a pedir rota: ${usedOrigin.lat.toFixed(5)},${usedOrigin.lng.toFixed(5)} → ${usedDest.lat.toFixed(5)},${usedDest.lng.toFixed(5)}`,
    );
    fetchDrivingRoute(usedOrigin, usedDest).then((r) => {
      if (cancelled) return;
      if (!r) {
        routingStartedRef.current = false;
        setError(
          "Sem rota detalhada (servidor de routing indisponível). A linha tracejada mostra a direcção em linha recta.",
        );
        setLoading("");
        return;
      }
      console.info(
        `[SOT] rota armazenada em estado: ${r.geometry.coordinates.length} pontos`,
      );
      setRoute(r);
      setLoading("");
      spokenStepIdxRef.current = -1;
    });
    return () => {
      cancelled = true;
    };
  }, [open, hasOrigin, hasDestination, routeAttempt]);

  // ---------------------------------------------------------------------------
  // 3b) Centra o mapa na primeira posição GPS conhecida — só uma vez, antes
  //     do `fitBounds` da rota tomar conta. Sem isto, com `defaultCenter`
  //     uncontrolled, o mapa ficaria fixo no Rio de Janeiro até a rota chegar.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!origin) return;
    if (centeredOnFirstFixRef.current) return;
    setStaticCenter({ lat: origin.lat, lng: origin.lng });
    setStaticZoom(14);
    centeredOnFirstFixRef.current = true;
  }, [origin]);

  // ---------------------------------------------------------------------------
  // 4) `fitBounds` à rota — uma única vez por sessão.
  //    Depois disso o motorista controla o pan/zoom livremente.
  //
  //    Padding desigual para compensar o cartão branco superior (~230px de
  //    altura com Destino + Distância/Tempo/Chegada) e o botão "Voltar" no
  //    canto inferior. Sem este ajuste, com rotas longas (> 20 km) parte
  //    da polilinha ficava escondida atrás do cartão.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!route || !mapInstance) return;
    if (routeFittedRef.current) return;
    const bounds = new google.maps.LatLngBounds();
    for (const [lng, lat] of route.geometry.coordinates) {
      bounds.extend({ lat, lng });
    }
    if (!bounds.isEmpty()) {
      mapInstance.fitBounds(bounds, { top: 240, right: 60, bottom: 110, left: 60 });
      console.info("[SOT] fitBounds aplicado à rota");
      routeFittedRef.current = true;
    }
  }, [route, mapInstance]);

  // ---------------------------------------------------------------------------
  // 5) Coordenadas da polilinha — memoizadas para evitar recriar o array
  //    a cada render (o `<Polyline>` re-render é caro com rotas longas).
  // ---------------------------------------------------------------------------
  const routePath = useMemo<Coord[]>(() => {
    if (!route) return [];
    return route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
  }, [route]);

  // ---------------------------------------------------------------------------
  // 6) Ícones dos marcadores. Construídos apenas quando o script Google
  //    estiver carregado (precisam de `google.maps.SymbolPath`).
  // ---------------------------------------------------------------------------
  const driverIcon = useMemo<google.maps.Symbol | null>(() => {
    if (!gmapsLoaded) return null;
    return {
      // Chevron apontando para cima (norte). A rotação é aplicada por `rotation`.
      path: "M 0,-12 L 8,8 L 0,4 L -8,8 Z",
      fillColor: "#2563eb",
      fillOpacity: 1,
      strokeColor: "#1d4ed8",
      strokeWeight: 1.5,
      strokeOpacity: 1,
      scale: 1.4,
      rotation: heading ?? 0,
      anchor: new google.maps.Point(0, 0),
    };
  }, [gmapsLoaded, heading]);

  const destinationIcon = useMemo<google.maps.Symbol | null>(() => {
    if (!gmapsLoaded) return null;
    return {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: "#dc2626",
      fillOpacity: 1,
      strokeColor: "#FFFFFF",
      strokeWeight: 3,
      scale: 9,
    };
  }, [gmapsLoaded]);

  const otherVehicleIcon = useMemo<google.maps.Symbol | null>(() => {
    if (!gmapsLoaded) return null;
    return {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: "#fb923c",
      fillOpacity: 0.9,
      strokeColor: "#c2410c",
      strokeWeight: 2,
      scale: 8,
    };
  }, [gmapsLoaded]);

  // ---------------------------------------------------------------------------
  // 7) Voz: anuncia a próxima manobra quando o motorista está a < 120 m do
  //    início dela. Usa Web Speech API.
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
        /* ignore */
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

  // Dispara o `maybeSpeakNextManeuver` a cada nova posição GPS.
  useEffect(() => {
    if (!gpsPosition) return;
    maybeSpeakNextManeuver({ lat: gpsPosition.lat, lng: gpsPosition.lng });
  }, [gpsPosition, maybeSpeakNextManeuver]);

  // ---------------------------------------------------------------------------
  // 8) Reset ao fechar — garante que a próxima abertura recomeça do zero.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (open) return;
    setDestination(null);
    setRoute(null);
    setError(null);
    setLoading("");
    setScreenLocked(false);
    setFarewellAnimating(false);
    setSelectedOtherPin(null);
    spokenStepIdxRef.current = -1;
    routingStartedRef.current = false;
    routeFittedRef.current = false;
    centeredOnFirstFixRef.current = false;
    setStaticCenter(DEFAULT_CENTER);
    setStaticZoom(6);
  }, [open]);

  /**
   * Quando a tela está trancada, escurece o máximo possível do dispositivo,
   * inclusive a status bar (hora/wifi/bateria):
   *  1. `filter: brightness(0)` no `<html>` — qualquer pixel fora da overlay vai a preto.
   *  2. Altera `<meta name="theme-color">` para `#000000` (status bar Android).
   *  3. Pede Fullscreen API — em Chrome Android esconde a status bar + URL.
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
   * Duplo-clique para destrancar — se o segundo toque vier num intervalo
   * curto (< 380 ms), desbloqueia.
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

  /** Handler do `onLoad` do `<GoogleMap>` — guarda a instância para `fitBounds`. */
  const handleMapLoad = useCallback((map: google.maps.Map) => {
    setMapInstance(map);
  }, []);

  /** Cleanup quando o `<GoogleMap>` é desmontado. */
  const handleMapUnmount = useCallback(() => {
    setMapInstance(null);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col bg-[hsl(var(--background))]">
      {/* Mapa em fundo, ocupa o resto do ecrã. */}
      <div
        className="absolute inset-0"
        style={{ zIndex: 0 }}
        aria-label="Mapa de navegação"
      >
        {!apiKey ? (
          <MapPlaceholder tone="empty">
            <strong>Chave Google Maps em falta</strong>
            <span className="mt-1 text-xs">
              Define <code>VITE_GOOGLE_MAPS_API_KEY</code> nos secrets do GitHub.
            </span>
          </MapPlaceholder>
        ) : gmapsLoadError ? (
          <MapPlaceholder tone="error">
            Falha ao carregar Google Maps: {gmapsLoadError.message}
          </MapPlaceholder>
        ) : !gmapsLoaded ? (
          <MapPlaceholder tone="loading">A carregar mapa…</MapPlaceholder>
        ) : (
          <GoogleMap
            mapContainerStyle={MAP_CONTAINER_STYLE}
            // `staticCenter`/`staticZoom` só mudam UMA VEZ (quando o GPS dá
            // a primeira posição). Sem este lock, cada tick do GPS chamaria
            // `map.setCenter()` por baixo, anulando o `fitBounds` da rota
            // e o pan/zoom manual do motorista.
            center={staticCenter}
            zoom={staticZoom}
            options={MAP_OPTIONS}
            onLoad={handleMapLoad}
            onUnmount={handleMapUnmount}
          >
            {/* Polilinha da rota (azul) — só renderiza após OSRM responder. */}
            {routePath.length > 0 ? (
              <Polyline path={routePath} options={ROUTE_POLYLINE_OPTIONS} />
            ) : origin && destination ? (
              // Fallback: linha recta tracejada cinzenta quando ainda não há
              // rota calculada (a calcular, ou OSRM falhou). Dá ao motorista
              // pelo menos uma indicação visual da direcção do destino.
              <Polyline
                path={[origin, { lat: destination.lat, lng: destination.lng }]}
                options={FALLBACK_LINE_OPTIONS}
              />
            ) : null}

            {/* Marcador do destino (círculo vermelho). */}
            {destination && destinationIcon ? (
              <Marker
                position={{ lat: destination.lat, lng: destination.lng }}
                icon={destinationIcon}
                title={destination.displayName}
                zIndex={20}
              />
            ) : null}

            {/* Marcador do motorista (chevron azul rotativo). */}
            {origin && driverIcon ? (
              <Marker
                position={origin}
                icon={driverIcon}
                clickable={false}
                zIndex={30}
              />
            ) : null}

            {/* Pinos das outras viaturas em curso (laranja). Clique abre InfoWindow. */}
            {otherVehicleIcon
              ? otherPins.map((p) => {
                  const key = `${p.placa}|${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
                  return (
                    <Marker
                      key={key}
                      position={{ lat: p.lat, lng: p.lng }}
                      icon={otherVehicleIcon}
                      label={{
                        text: p.placa,
                        fontSize: "11px",
                        fontWeight: "700",
                        color: "#7c2d12",
                        className: "sot-driver-map-placa-tooltip",
                      }}
                      onClick={() => setSelectedOtherPin(key)}
                      zIndex={15}
                    >
                      {selectedOtherPin === key ? (
                        <InfoWindow
                          position={{ lat: p.lat, lng: p.lng }}
                          onCloseClick={() => setSelectedOtherPin(null)}
                        >
                          <div style={{ fontSize: 12, lineHeight: 1.3 }}>
                            <strong style={{ display: "block", marginBottom: 2 }}>
                              {p.placa}
                            </strong>
                            <span style={{ color: "#555" }}>
                              {p.lastUpdateAtMs !== null
                                ? `Última posição: ${formatRelativeTime(p.lastUpdateAtMs)}`
                                : "Hora da última posição desconhecida."}
                            </span>
                          </div>
                        </InfoWindow>
                      ) : null}
                    </Marker>
                  );
                })
              : null}
          </GoogleMap>
        )}
      </div>

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

        {/* Cartão de distância / tempo / chegada — SEMPRE visível.
            Quando a rota ainda não foi calculada (ou falhou), mostramos uma
            estimativa em linha recta para a "Distância" e «—» nos restantes. */}
        <div className="pointer-events-auto mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-white px-3 py-2 text-slate-900 shadow-md">
          <div className="flex min-w-0 flex-col">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">
              Distância
            </span>
            <span className="whitespace-nowrap text-base font-bold leading-tight">
              {route
                ? formatDistance(route.distance)
                : origin && destination
                  ? `${formatDistance(haversineMeters(origin, { lat: destination.lat, lng: destination.lng }))} *`
                  : "—"}
            </span>
          </div>
          <div className="h-8 w-px bg-slate-200" />
          <div className="flex min-w-0 flex-col">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">
              Tempo previsto
            </span>
            <span className="whitespace-nowrap text-base font-bold leading-tight">
              {route ? formatDuration(route.duration) : "—"}
            </span>
          </div>
          <div className="h-8 w-px bg-slate-200" />
          <div className="flex min-w-0 flex-col">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Chegada</span>
            <span className="whitespace-nowrap text-base font-bold leading-tight">
              {route ? formatEta(route.duration) : "—"}
            </span>
          </div>
        </div>

        {/* Status pequeno (a carregar / erro) — não esconde o cartão. */}
        {!route ? (
          <div className="pointer-events-auto mt-1 flex flex-wrap items-center gap-2 self-start">
            <p className="inline-block rounded-md bg-black/55 px-2 py-1 text-[0.7rem] font-medium text-white shadow-sm">
              {loading === "locating" && "A localizar-se…"}
              {loading === "geocoding" && "A procurar destino…"}
              {loading === "routing" && "A calcular rota…"}
              {!loading && (error ?? "A preparar navegação…")}
              {origin && destination ? " · * distância em linha recta" : null}
            </p>
            {error && !loading && origin && destination ? (
              <button
                type="button"
                onClick={() => {
                  routingStartedRef.current = false;
                  setRouteAttempt((n) => n + 1);
                }}
                className="rounded-md bg-blue-600 px-3 py-1 text-[0.7rem] font-bold uppercase tracking-wider text-white shadow-sm active:bg-blue-700"
              >
                Tentar novamente
              </button>
            ) : null}
          </div>
        ) : null}

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

      {/* Chip flutuante: contagem de outras viaturas com saída em curso. */}
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

      {/* Botão "Voltar" discreto no canto inferior esquerdo. */}
      <button
        type="button"
        onClick={() => {
          window.speechSynthesis?.cancel?.();
          onClose();
        }}
        className="pointer-events-auto absolute left-3 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-slate-900/85 text-white shadow-lg backdrop-blur active:bg-slate-900"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
        aria-label="Voltar para o quadro de saídas (mantém o rastreamento activo)"
        title="Voltar"
      >
        <svg
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
      </button>

      {/* Animação de despedida: escurece gradualmente até preto enquanto uma mão
          acena no centro. Visível só durante ~2,2 s quando o motorista escolheu
          "Segundo plano". No fim, dá lugar à `screenLocked` overlay. */}
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
          Tapa todo o ecrã para minimizar emissão de luz (ideal em OLED).
          Desbloqueia com duplo toque. A voz continua a anunciar manobras. */}
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
    </div>
  );
}

/**
 * Painel mostrado dentro do contentor do mapa enquanto o script Google ainda
 * não carregou (ou falhou, ou a chave não foi configurada).
 */
type MapPlaceholderProps = {
  children: React.ReactNode;
  tone: "loading" | "error" | "empty";
};

function MapPlaceholder({ children, tone }: MapPlaceholderProps) {
  const color =
    tone === "error" ? "rgb(185 28 28)" : tone === "empty" ? "rgb(71 85 105)" : "rgb(100 116 139)";
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live="polite"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "1rem",
        gap: "0.35rem",
        color,
        background: "rgba(241, 245, 249, 0.6)",
        fontSize: "0.875rem",
      }}
    >
      {children}
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
