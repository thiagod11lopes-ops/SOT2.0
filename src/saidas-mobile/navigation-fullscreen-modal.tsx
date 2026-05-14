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
  Polyline,
  useGoogleMap,
  useJsApiLoader,
  type Libraries,
} from "@react-google-maps/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useCatalogItems } from "../context/catalog-items-context";
import { useDriverActiveLocations } from "../hooks/useDriverActiveLocations";
import { useScreenWakeLock } from "../hooks/useScreenWakeLock";
import { useVehicleTypeByPlaca } from "../hooks/useVehicleTypeByPlaca";
import { useWatchUserLocation } from "../hooks/useWatchUserLocation";
import { VehicleIcon } from "../components/vehicle-icon";
import { primaryPlacaFromViaturasField } from "../lib/viaturaPlaca";
import { resolveVehicleType } from "../lib/vehicleTypeByPlaca";
import { setMobileNavigationActive } from "./mobile-navigation-mode";
import type { DepartureRecord } from "../types/departure";
import {
  type DrivingRoute,
  type GeocodeResult,
  type RouteStep,
  type SpeedInterval,
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
 *
 * - `geometry` — encoding/decoding de polilinhas, cálculos geo.
 * - `marker` — `google.maps.marker.AdvancedMarkerElement` (marcadores HTML
 *   modernos com rotação por CSS, qualidade visual superior, e que substitui
 *   o `google.maps.Marker` clássico que está em depreciação).
 * - `places` — `AutocompleteService` + `PlacesService` para sugestões de
 *   endereço em tempo real na barra de endereço do navegador (estilo
 *   app Google Maps). Cobrado por sessão: a `AutocompleteSessionToken`
 *   agrupa todos os keystrokes + 1 `getDetails` num único billable event.
 */
const GMAPS_LIBRARIES: Libraries = ["geometry", "marker", "places"];

/** Debounce dos pedidos de autocomplete (ms) — equilíbrio responsividade/quota. */
const PLACES_DEBOUNCE_MS = 220;

/** Raio (m) à volta da posição do motorista para enviesar sugestões. */
const PLACES_LOCATION_BIAS_RADIUS_M = 50_000;

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
 * Constrói a query de geocoding inicial a partir dos campos *estruturados*
 * do registo. Combina apenas `hospitalDestino` e `cidade` — o campo
 * "Destino" do formulário (record.bairro) é texto livre digitado pelo
 * motorista para fins de relatório e **não** é propagado para a barra de
 * endereço do navegador (esta é uma entrada independente que o motorista
 * pode preencher/editar dentro do próprio mapa).
 */
function buildDestinationQuery(record: DepartureRecord): string {
  const partes = [record.hospitalDestino, record.cidade]
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

/**
 * Inclinação da câmara (em graus) usada em modo navegação activa.
 * 67.5° é o máximo permitido pelo Google Maps JS API em mapas vector
 * (com Map ID). A mesma constante é usada para inclinar as silhuetas
 * das viaturas via `perspective(...) rotateX(...)`, fazendo com que os
 * carros "deitem-se" sobre o asfalto e combinem com a vista 3D.
 */
const NAV_TILT_DEGREES = 67.5;

/**
 * Nível de zoom usado em modo navegação activa. No Google Maps cada nível
 * inteiro dobra a escala. 20 corresponde a uma vista bem próxima da
 * viatura (~15 m de campo de visão em frente), com a silhueta 3D
 * destacada e detalhe forte do cruzamento seguinte — equivalente ao
 * dobro do zoom 19 anterior. Em preview (botão "Centralizar" fora de
 * navegação) usa-se 17, panorâmico.
 */
const NAV_ACTIVE_ZOOM = 20;
const PREVIEW_RECENTER_ZOOM = 17;

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
 * Cores dos troços de trânsito (apenas quando a Routes API devolve
 * `speedReadingIntervals`). `NORMAL` mantém o azul base; os outros estados
 * são desenhados POR CIMA do azul, garantindo continuidade visual.
 *
 *  - NORMAL       → azul (igual à polilinha base — só pintamos os troços
 *                   anormais para reduzir ruído visual)
 *  - SLOW         → laranja
 *  - TRAFFIC_JAM  → vermelho
 *  - UNKNOWN      → cinzento claro (raro; Google ainda não tem dados)
 */
const TRAFFIC_OVERLAY_COLORS: Record<SpeedInterval["speed"], string | null> = {
  NORMAL: null,
  SLOW: "#f59e0b",
  TRAFFIC_JAM: "#dc2626",
  UNKNOWN: "#94a3b8",
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

// =============================================================================
// AdvancedHTMLMarker — wrapper imperativo
// =============================================================================
// O `@react-google-maps/api@2.20` ainda não tem `<AdvancedMarker>`. Esta
// implementação criar manualmente `google.maps.marker.AdvancedMarkerElement`
// e renderiza conteúdo React arbitrário no seu `content` via `createPortal`.
//
// Padrão recomendado pela documentação Google quando se usa React:
//  https://developers.google.com/maps/documentation/javascript/advanced-markers/migration
// =============================================================================

type AdvancedHTMLMarkerProps = {
  /** Coordenada do marcador. */
  position: { lat: number; lng: number };
  /** zIndex (motorista > destino > outras viaturas). */
  zIndex?: number;
  /** Callback ao tocar/clicar no marcador. */
  onClick?: () => void;
  /** `title` (tooltip nativa do browser). */
  title?: string;
  /** Conteúdo React renderizado dentro do marcador. */
  children: React.ReactNode;
};

/**
 * Marcador HTML moderno baseado em `AdvancedMarkerElement`. Precisa de:
 *  - script Maps JS carregado com a biblioteca `marker`
 *  - `<GoogleMap>` ancestor com `mapId` configurado (Cloud-based Map Style)
 *
 * Se algum dos dois falhar, o marcador simplesmente não renderiza
 * (com aviso no console). Não há fallback automático para `<Marker>` —
 * para isso seria preciso configurar o Map ID em Cloud Console.
 */
function AdvancedHTMLMarker({
  position,
  zIndex,
  onClick,
  title,
  children,
}: AdvancedHTMLMarkerProps) {
  const map = useGoogleMap();
  const containerRef = useRef<HTMLDivElement | null>(null);
  if (containerRef.current === null && typeof document !== "undefined") {
    containerRef.current = document.createElement("div");
  }
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const clickListenerRef = useRef<google.maps.MapsEventListener | null>(null);

  // Cria o marcador uma única vez por par (map, container) e remove no
  // unmount. Posição, zIndex, title e onClick são actualizados em efeitos
  // separados para evitar re-criar o marcador a cada render (re-criar é
  // caro e remove o DOM da página).
  useEffect(() => {
    if (!map || !containerRef.current) return;
    if (typeof google === "undefined" || !google.maps?.marker?.AdvancedMarkerElement) {
      console.warn(
        "[SOT] google.maps.marker.AdvancedMarkerElement indisponível — verifica se a biblioteca 'marker' foi carregada.",
      );
      return;
    }
    const marker = new google.maps.marker.AdvancedMarkerElement({
      map,
      position,
      content: containerRef.current,
    });
    markerRef.current = marker;
    return () => {
      marker.map = null;
      markerRef.current = null;
      if (clickListenerRef.current) {
        clickListenerRef.current.remove();
        clickListenerRef.current = null;
      }
    };
    // Deliberadamente sem `position`/`zIndex`/`onClick` — esses são
    // actualizados a baixo sem destruir o marcador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Actualiza a posição sem re-criar o marcador.
  useEffect(() => {
    const m = markerRef.current;
    if (!m) return;
    m.position = { lat: position.lat, lng: position.lng };
  }, [position.lat, position.lng]);

  // Actualiza zIndex sem re-criar.
  useEffect(() => {
    const m = markerRef.current;
    if (!m) return;
    m.zIndex = zIndex ?? null;
  }, [zIndex]);

  // Actualiza title.
  useEffect(() => {
    const m = markerRef.current;
    if (!m) return;
    m.title = title ?? "";
  }, [title]);

  // (Re)regista o listener `gmp-click` sempre que `onClick` mudar.
  useEffect(() => {
    const m = markerRef.current;
    if (!m) return;
    if (clickListenerRef.current) {
      clickListenerRef.current.remove();
      clickListenerRef.current = null;
    }
    if (onClick) {
      clickListenerRef.current = m.addListener("gmp-click", onClick);
    }
  }, [onClick]);

  // Renderiza o conteúdo React dentro do `<div>` que serve de `content`
  // do `AdvancedMarkerElement`. O DOM permanece atómico (Google insere o
  // div sozinho como filho do `AdvancedMarkerElement`).
  if (!containerRef.current) return null;
  return createPortal(children, containerRef.current);
}

/**
 * Devolve o SVG path de uma seta apropriada para a manobra OSRM. Cobre os
 * tipos mais comuns; o resto cai numa seta "em frente". Tamanho viewBox 24×24,
 * stroke preto sobre fundo branco fica perfeito sobre a barra de navegação.
 */
function maneuverArrowPath(step: RouteStep): string {
  const m = step.maneuver;
  if (!m) return "M12 4 L12 20 M5 11 L12 4 L19 11";
  const mod = m.modifier ?? "";
  switch (m.type) {
    case "depart":
      return "M12 4 L12 20 M5 11 L12 4 L19 11";
    case "arrive":
      // Bandeira de chegada
      return "M5 21 L5 4 M5 4 H17 L14 8 L17 12 H5";
    case "roundabout":
    case "rotary":
      // Círculo + seta a sair
      return "M12 6 a6 6 0 1 0 6 6 M18 12 L22 12 M18 12 L20 9";
    case "turn":
    case "end of road":
    case "fork":
    case "continue":
    case "merge":
    case "new name":
    default: {
      if (mod === "left")
        return "M19 20 L19 12 a4 4 0 0 0 -4 -4 L7 8 M7 8 L11 4 M7 8 L11 12";
      if (mod === "right")
        return "M5 20 L5 12 a4 4 0 0 1 4 -4 L17 8 M17 8 L13 4 M17 8 L13 12";
      if (mod === "slight left")
        return "M15 20 L11 8 M11 8 L7 11 M11 8 L13 12";
      if (mod === "slight right")
        return "M9 20 L13 8 M13 8 L17 11 M13 8 L11 12";
      if (mod === "sharp left")
        return "M19 20 L19 14 a4 4 0 0 0 -4 -4 H6 M6 10 L10 6 M6 10 L10 14";
      if (mod === "sharp right")
        return "M5 20 L5 14 a4 4 0 0 1 4 -4 H18 M18 10 L14 6 M18 10 L14 14";
      if (mod === "uturn")
        return "M5 20 L5 11 a4 4 0 0 1 4 -4 H13 a4 4 0 0 1 4 4 V20 M17 16 L13 20 M17 16 L13 12";
      return "M12 4 L12 20 M5 11 L12 4 L19 11";
    }
  }
}

export function NavigationFullScreenModal({
  open,
  record,
  onClose,
  initialScreenLocked = false,
}: Props) {
  // ─── Loader do Google Maps script ────────────────────────────────────────
  // Lê a chave da variável Vite (substituída no build pelo workflow GitHub).
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";
  /**
   * Map ID obrigatório para `AdvancedMarkerElement`. Configurado em Cloud
   * Console → Maps Platform → Map Styles. Sem isto, os marcadores não
   * renderizam (com aviso em console).
   */
  const mapId = import.meta.env.VITE_GOOGLE_MAP_ID ?? "";
  const { isLoaded: gmapsLoaded, loadError: gmapsLoadError } = useJsApiLoader({
    id: GMAPS_LOADER_ID,
    googleMapsApiKey: apiKey,
    libraries: GMAPS_LIBRARIES,
    language: "pt-BR",
    region: "BR",
  });

  /**
   * Opções dinâmicas do `<GoogleMap>`: inclui `mapId` quando configurado.
   * Aviso uma vez no console se faltar para ajudar diagnóstico.
   */
  useEffect(() => {
    if (open && !mapId) {
      console.warn(
        "[SOT] VITE_GOOGLE_MAP_ID não configurado — os marcadores AdvancedMarkerElement não vão renderizar. Cria um Map ID em https://console.cloud.google.com/google/maps-apis/studio/maps",
      );
    }
  }, [open, mapId]);
  const mapOptionsWithId = useMemo<google.maps.MapOptions>(
    () => (mapId ? { ...MAP_OPTIONS, mapId } : MAP_OPTIONS),
    [mapId],
  );

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

  /**
   * `true` enquanto o motorista está em modo navegação activa (após clicar
   * "Iniciar"). Em vez do preview/overview com `fitBounds`, a câmara segue
   * o motorista (panTo + zoom alto) e mostramos a próxima manobra a destaque.
   */
  const [navigating, setNavigating] = useState(false);
  /** `true` após a primeira centragem em modo navegação (para fazer zoom 17 só uma vez). */
  const navInitializedRef = useRef(false);
  /**
   * `true` quando o motorista arrasta o mapa em modo navegação — pausa o
   * auto-follow para ele poder explorar o trajeto sem o mapa "saltar" para
   * a posição actual a cada tick GPS. O botão "Centralizar" reactiva.
   */
  const [userPanned, setUserPanned] = useState(false);

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

  /**
   * Texto activo do destino — começa por ser a string composta a partir do
   * registo (hospital/bairro/cidade) e pode ser sobrescrita pelo motorista
   * directamente na barra de endereço do topo, ao estilo Google Maps.
   * Mudanças em `destinationQuery` disparam novo geocoding + nova rota.
   */
  const [destinationQuery, setDestinationQuery] = useState<string>(() =>
    buildDestinationQuery(record),
  );
  /**
   * Valor do `<input>` editável na barra de endereço — espelha `destinationQuery`
   * mas pode ser editado livremente; só vai para `destinationQuery` quando o
   * motorista submete (Enter ou botão Aplicar).
   */
  const [destinationInput, setDestinationInput] = useState<string>(() =>
    buildDestinationQuery(record),
  );

  // Sempre que o modal abre (ou o registo muda enquanto o modal está aberto),
  // recoloca o texto do destino na barra de endereço a partir do registo.
  useEffect(() => {
    if (!open) return;
    const q = buildDestinationQuery(record);
    setDestinationQuery(q);
    setDestinationInput(q);
  }, [open, record]);

  // ─── Autocomplete Google Places ──────────────────────────────────────────
  /**
   * Sugestões devolvidas pelo `AutocompleteService` a cada keystroke (com
   * debounce). Vazio quando não há query, quando o utilizador acabou de
   * escolher uma sugestão, ou quando o input está em modo "valor inicial
   * vindo do registo" (não foi tocado pelo motorista).
   */
  const [placeSuggestions, setPlaceSuggestions] = useState<
    google.maps.places.AutocompletePrediction[]
  >([]);
  /** `true` enquanto há um pedido de autocomplete pendente. */
  const [placesLoading, setPlacesLoading] = useState(false);
  /**
   * Token de sessão Places — agrupa todos os keystrokes + 1 `getDetails`
   * num único evento facturável. Refresca quando o utilizador escolhe um
   * lugar (e portanto inicia nova "sessão" de pesquisa).
   */
  const placesSessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  /** Instância do `AutocompleteService` — criada uma vez quando o script carrega. */
  const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  /**
   * `PlacesService` — precisa de um `HTMLDivElement` ou `google.maps.Map`
   * como argumento. Reutilizamos o `mapInstance` quando este estiver
   * disponível; caso contrário, criamos um div invisível só para o serviço.
   */
  const placesServiceDivRef = useRef<HTMLDivElement | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  /**
   * Suprime o próximo debounce sempre que o input for actualizado de forma
   * programática (escolha de sugestão, sincronização inicial com o registo).
   * Sem isto, escolher uma sugestão dispararia novo `getPlacePredictions` a
   * partir do texto canónico da própria sugestão.
   */
  const suppressNextPlacesFetchRef = useRef(false);

  // Inicializa os serviços Places quando o script Maps acaba de carregar.
  useEffect(() => {
    if (!gmapsLoaded || !open) return;
    if (typeof google === "undefined" || !google.maps.places) return;
    if (!autocompleteServiceRef.current) {
      autocompleteServiceRef.current = new google.maps.places.AutocompleteService();
    }
    if (!placesSessionTokenRef.current) {
      placesSessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
    }
  }, [gmapsLoaded, open]);

  // Cria/recria o PlacesService assim que tivermos uma instância do mapa.
  useEffect(() => {
    if (!gmapsLoaded) return;
    if (typeof google === "undefined" || !google.maps.places) return;
    if (mapInstance) {
      placesServiceRef.current = new google.maps.places.PlacesService(mapInstance);
    } else if (placesServiceDivRef.current) {
      placesServiceRef.current = new google.maps.places.PlacesService(
        placesServiceDivRef.current,
      );
    }
  }, [gmapsLoaded, mapInstance]);

  // Sincroniza programaticamente `destinationInput` quando muda o registo (open
  // useEffect acima) — neste caso suprimimos o próximo fetch de sugestões.
  useEffect(() => {
    if (!open) return;
    suppressNextPlacesFetchRef.current = true;
  }, [open, record]);

  // Debounce + pedido de sugestões a cada keystroke. Enviesa pela posição
  // actual do motorista (raio 50 km) e restringe ao Brasil para evitar
  // resultados de outros países com mesmo nome.
  useEffect(() => {
    if (!open) return;
    if (!autocompleteServiceRef.current) return;
    // Sintonização programática (escolha de sugestão / sync inicial) —
    // não dispara novo fetch.
    if (suppressNextPlacesFetchRef.current) {
      suppressNextPlacesFetchRef.current = false;
      return;
    }
    const query = destinationInput.trim();
    if (query.length < 3) {
      setPlaceSuggestions([]);
      setPlacesLoading(false);
      return;
    }
    const service = autocompleteServiceRef.current;
    const session = placesSessionTokenRef.current ?? undefined;
    let cancelled = false;
    setPlacesLoading(true);
    const timer = window.setTimeout(() => {
      const request: google.maps.places.AutocompletionRequest = {
        input: query,
        sessionToken: session,
        componentRestrictions: { country: "br" },
      };
      const refOrigin = originRef.current;
      if (refOrigin) {
        request.locationBias = {
          center: { lat: refOrigin.lat, lng: refOrigin.lng },
          radius: PLACES_LOCATION_BIAS_RADIUS_M,
        };
      }
      service.getPlacePredictions(request, (predictions, status) => {
        if (cancelled) return;
        setPlacesLoading(false);
        if (
          status !== google.maps.places.PlacesServiceStatus.OK ||
          !predictions
        ) {
          setPlaceSuggestions([]);
          return;
        }
        setPlaceSuggestions(predictions);
      });
    }, PLACES_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [destinationInput, open]);

  /**
   * Quando o motorista toca numa sugestão Places, obtemos coordenadas via
   * `getDetails` (cobrado dentro da mesma sessão de autocomplete), e
   * usamos directamente para o cálculo de rota — sem passar pelo
   * Nominatim. Refresca o session token para a próxima pesquisa.
   */
  const handleSelectPlaceSuggestion = useCallback(
    (prediction: google.maps.places.AutocompletePrediction) => {
      const service = placesServiceRef.current;
      const session = placesSessionTokenRef.current ?? undefined;
      if (!service) return;
      // Actualiza o input para o texto canónico imediatamente, para feedback.
      const label =
        prediction.structured_formatting?.main_text ?? prediction.description;
      suppressNextPlacesFetchRef.current = true;
      setDestinationInput(label);
      setPlaceSuggestions([]);
      setPlacesLoading(true);
      service.getDetails(
        {
          placeId: prediction.place_id,
          fields: ["geometry", "name", "formatted_address"],
          sessionToken: session,
        },
        (place, status) => {
          setPlacesLoading(false);
          // Refresca o token — uma sessão Places termina ao chamar getDetails.
          placesSessionTokenRef.current =
            new google.maps.places.AutocompleteSessionToken();
          if (
            status !== google.maps.places.PlacesServiceStatus.OK ||
            !place?.geometry?.location
          ) {
            setError("Não foi possível obter a localização desse endereço.");
            return;
          }
          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();
          const displayName =
            place.formatted_address ?? place.name ?? prediction.description;
          const shortLabel = place.name ?? label;
          setError(null);
          // Salta o geocoding (já temos coords) — define `destination`
          // directamente e dispara o efeito de rota.
          setRoute(null);
          routingStartedRef.current = false;
          routeFittedRef.current = false;
          spokenStepIdxRef.current = -1;
          setDestinationQuery(displayName);
          setDestination({ lat, lng, displayName, shortLabel });
        },
      );
    },
    [],
  );

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
    // Sem destino ainda — o motorista tem de digitar na barra de endereço
    // no topo do mapa. Limpa loading/erro e espera nova submissão.
    if (!destinationQuery) {
      setLoading("");
      setError(null);
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
    fetchDrivingRoute(usedOrigin, usedDest, { googleApiKey: apiKey }).then((r) => {
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
  }, [open, hasOrigin, hasDestination, routeAttempt, apiKey]);

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
  // 5b) Overlays de trânsito — só com Google Routes API. Cada intervalo
  //     `SLOW`/`TRAFFIC_JAM` vira uma `<Polyline>` por cima da base azul,
  //     usando os pontos da `routePath` no intervalo [startIndex, endIndex].
  //     Adicionamos +1 ao `endIndex` (slice exclusivo) para o último ponto
  //     ser incluído. Intervalos `NORMAL` são ignorados (mantemos o azul).
  // ---------------------------------------------------------------------------
  const trafficOverlays = useMemo<
    Array<{ key: string; path: Coord[]; color: string }>
  >(() => {
    if (!route?.speedIntervals || routePath.length === 0) return [];
    const out: Array<{ key: string; path: Coord[]; color: string }> = [];
    for (const iv of route.speedIntervals) {
      const color = TRAFFIC_OVERLAY_COLORS[iv.speed];
      if (!color) continue;
      const start = Math.max(0, Math.min(iv.startIndex, routePath.length - 1));
      const end = Math.max(start, Math.min(iv.endIndex + 1, routePath.length));
      if (end - start < 2) continue;
      out.push({
        key: `${iv.speed}-${start}-${end}`,
        path: routePath.slice(start, end),
        color,
      });
    }
    return out;
  }, [route, routePath]);

  /**
   * Severidade global do trânsito na rota.
   *
   * Combina duas fontes:
   *  1. `speedIntervals` (apenas Routes API com `TRAFFIC_ON_POLYLINE`):
   *     se houver pelo menos um troço SLOW/TRAFFIC_JAM, classificamos como
   *     "slow" ou "jam" consoante o pior dos troços.
   *  2. Delta `duration - staticDuration` (sempre disponível com Routes API):
   *     fallback útil quando o Google ainda não tem intervalos por troço
   *     mas já reflectiu o trânsito no tempo total. > 5 min de atraso
   *     considera-se engarrafamento severo; > 1 min considera-se lento.
   */
  const trafficSeverity = useMemo<"none" | "slow" | "jam">(() => {
    if (!route) return "none";
    const hasJam = route.speedIntervals?.some((iv) => iv.speed === "TRAFFIC_JAM");
    if (hasJam) return "jam";
    const hasSlow = route.speedIntervals?.some((iv) => iv.speed === "SLOW");
    if (hasSlow) return "slow";
    if (typeof route.staticDuration === "number") {
      const delta = route.duration - route.staticDuration;
      if (delta > 300) return "jam";
      if (delta > 60) return "slow";
    }
    return "none";
  }, [route]);

  // ---------------------------------------------------------------------------
  // 6) Variante visual da viatura — resolvida primeiro pelo mapa configurado
  //    na aba "Mobile — rastreamento (GPS)" (`vehicleTypeByPlaca`), com
  //    fallback para heurística textual. Influencia o ícone SVG mostrado no
  //    marcador `AdvancedHTMLMarker` (carro cinza, ambulância branca ou
  //    camião cinza).
  // ---------------------------------------------------------------------------
  const vehicleTypeByPlaca = useVehicleTypeByPlaca();
  const { items: catalogItems } = useCatalogItems();
  const vehicleCatalogHint = useMemo(
    () => ({
      ambulancias: catalogItems.ambulancias,
      viaturasAdministrativas: catalogItems.viaturasAdministrativas,
    }),
    [catalogItems.ambulancias, catalogItems.viaturasAdministrativas],
  );
  const driverPlaca = useMemo(
    () => primaryPlacaFromViaturasField(record.viaturas ?? ""),
    [record.viaturas],
  );
  const driverVehicleVariant = useMemo(
    () =>
      resolveVehicleType(driverPlaca, record.viaturas, vehicleTypeByPlaca, vehicleCatalogHint),
    [driverPlaca, record.viaturas, vehicleTypeByPlaca, vehicleCatalogHint],
  );

  // ---------------------------------------------------------------------------
  // 6b) Próxima manobra a apresentar — usado pela barra superior em modo
  //     navegação activa. Escolhe o passo cujo `start` está mais próximo do
  //     motorista, ignorando passos que já foram ultrapassados (fim mais
  //     próximo do que o início). O passo "depart" é sempre ignorado porque
  //     é o ponto de partida (instrução "siga em frente" inicial não ajuda).
  // ---------------------------------------------------------------------------
  const nextManeuver = useMemo<{ step: RouteStep; distM: number } | null>(() => {
    if (!route || !origin) return null;
    let best: { step: RouteStep; distM: number } | null = null;
    for (let i = 1; i < route.steps.length; i++) {
      const step = route.steps[i];
      const coords = step.geometry?.coordinates;
      if (!coords || coords.length === 0) continue;
      const [lngS, latS] = coords[0];
      const [lngE, latE] = coords[coords.length - 1];
      const distStart = haversineMeters(origin, { lat: latS, lng: lngS });
      const distEnd = haversineMeters(origin, { lat: latE, lng: lngE });
      // Já passámos este passo? (fim mais perto do que o início, e início > 30 m)
      if (distEnd < distStart && distStart > 30) continue;
      if (!best || distStart < best.distM) {
        best = { step, distM: distStart };
      }
    }
    return best;
  }, [route, origin]);

  // ---------------------------------------------------------------------------
  // 6c) Câmara segue o motorista em modo navegação activa (modo 3D ao estilo
  //     Google Maps / Waze: tilt 67.5° + rotação por heading + edifícios em
  //     volume vector).
  //     - Primeira vez que entra em `navigating`: zoom 17, tilt 67.5° + panTo.
  //     - Ticks seguintes do GPS: panTo + setHeading (tilt preservado).
  //     - Se o motorista arrastou o mapa (`userPanned = true`), pausa o
  //       auto-follow até clicar em "Centralizar".
  //     - O 3D só funciona com Map ID + tile Vetor (já configurado no
  //       Cloud Console). Em mapas raster, setTilt é ignorado silenciosamente.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!navigating || !mapInstance || !origin) return;
    if (!navInitializedRef.current) {
      // Aproxima bem da viatura (zoom 19 ≈ vista ao volante estilo
      // Google Maps / Waze) para o motorista ver o cruzamento seguinte
      // com clareza e a silhueta 3D bem destacada.
      mapInstance.setZoom(NAV_ACTIVE_ZOOM);
      // Inclina a câmara para vista 3D. setTilt aceita 0-67.5° em mapas
      // vector com Map ID; outros são ignorados.
      try {
        mapInstance.setTilt(NAV_TILT_DEGREES);
      } catch {
        // ignora — sem Map ID ou tile raster
      }
      navInitializedRef.current = true;
    }
    if (userPanned) return;
    mapInstance.panTo({ lat: origin.lat, lng: origin.lng });
    // Rotação por heading — só com heading válida (velocidade > 0,5 m/s).
    if (heading !== null && Number.isFinite(heading)) {
      try {
        mapInstance.setHeading(heading);
      } catch {
        // setHeading requer tile vector; ignora se falhar.
      }
    }
  }, [navigating, mapInstance, origin, heading, userPanned]);

  // ---------------------------------------------------------------------------
  // 6d) Volta a vista 2D (tilt 0, heading 0) quando o motorista clica em
  //     "Visão geral" ou fecha o modal. Sem isto, o mapa fica preso em 3D
  //     mesmo no modo preview, dificultando ver a rota inteira.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (navigating || !mapInstance) return;
    try {
      mapInstance.setTilt(0);
      mapInstance.setHeading(0);
    } catch {
      // ignora — mapa pode estar a ser desmontado
    }
  }, [navigating, mapInstance]);

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
    navInitializedRef.current = false;
    setNavigating(false);
    setUserPanned(false);
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

  /**
   * Aplica o destino digitado na barra de endereço:
   *  1. Valida que o texto não está vazio nem é igual ao actual.
   *  2. Limpa o `destination` geocodificado e a `route` calculada.
   *  3. Repõe os refs de routing para o efeito de geocoding voltar a correr.
   *  4. Actualiza `destinationQuery` (dispara o efeito de geocoding).
   *
   * Os efeitos existentes encarregam-se de: geocodificar o novo texto,
   * pedir uma nova rota a OSRM/Google Routes, e fazer `fitBounds` ao novo
   * trajeto. O motorista pode então tocar "Iniciar" para começar a navegar.
   */
  const handleSubmitDestination = useCallback(() => {
    const next = destinationInput.trim();
    if (!next) return;
    if (next === destinationQuery) return;
    setDestination(null);
    setRoute(null);
    setError(null);
    routingStartedRef.current = false;
    routeFittedRef.current = false;
    spokenStepIdxRef.current = -1;
    setDestinationQuery(next);
  }, [destinationInput, destinationQuery]);

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
            options={mapOptionsWithId}
            onLoad={handleMapLoad}
            onUnmount={handleMapUnmount}
            // `dragstart` só dispara em arrasto humano (panTo programático
            // não o emite). Em modo navegação, pausa o auto-follow até o
            // motorista clicar em "Centralizar".
            onDragStart={() => {
              if (navigating) setUserPanned(true);
            }}
          >
            {/* Polilinha da rota (azul base) — só renderiza após routing responder. */}
            {routePath.length > 0 ? (
              <>
                <Polyline path={routePath} options={ROUTE_POLYLINE_OPTIONS} />
                {/* Overlays de trânsito por cima do azul: laranja para SLOW,
                    vermelho para TRAFFIC_JAM. Apenas presente quando a Routes
                    API responder com `speedReadingIntervals`. */}
                {trafficOverlays.map((seg) => (
                  <Polyline
                    key={seg.key}
                    path={seg.path}
                    options={{
                      strokeColor: seg.color,
                      strokeOpacity: 0.95,
                      strokeWeight: 6,
                      geodesic: false,
                      clickable: false,
                      zIndex: 6,
                    }}
                  />
                ))}
              </>
            ) : origin && destination ? (
              // Fallback: linha recta tracejada cinzenta quando ainda não há
              // rota calculada (a calcular, ou OSRM falhou). Dá ao motorista
              // pelo menos uma indicação visual da direcção do destino.
              <Polyline
                path={[origin, { lat: destination.lat, lng: destination.lng }]}
                options={FALLBACK_LINE_OPTIONS}
              />
            ) : null}

            {/* Marcador do destino — pino vermelho HTML. */}
            {destination ? (
              <AdvancedHTMLMarker
                position={{ lat: destination.lat, lng: destination.lng }}
                title={destination.displayName}
                zIndex={20}
              >
                <div
                  style={{
                    transform: "translate(0, -50%)",
                    filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.35))",
                  }}
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 24 32" width="32" height="42">
                    <path
                      d="M12 0 C5 0 0 5 0 12 C0 20 12 32 12 32 C12 32 24 20 24 12 C24 5 19 0 12 0 Z"
                      fill="#dc2626"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                    <circle cx="12" cy="12" r="4" fill="#ffffff" />
                  </svg>
                </div>
              </AdvancedHTMLMarker>
            ) : null}

            {/* Marcador do motorista — silhueta de viatura rotacionada pelo
                heading do GPS. Em modo navegação, aplica perspectiva 3D
                (rotateX igual ao tilt do mapa) para a silhueta deitar-se no
                asfalto e combinar com a vista 3D. Em modo preview, fica
                plana (top-down). */}
            {origin ? (
              <AdvancedHTMLMarker position={origin} zIndex={30}>
                <div
                  style={{
                    // perspective dá profundidade; rotateX deita o SVG no
                    // mesmo ângulo que o mapa está inclinado; rotateZ
                    // alinha com o heading do GPS. Em preview (navigating
                    // = false), só rotateZ (rotação 2D simples).
                    transform: navigating
                      ? `perspective(600px) rotateX(${NAV_TILT_DEGREES}deg) rotateZ(${heading ?? 0}deg)`
                      : `rotate(${heading ?? 0}deg)`,
                    transformOrigin: "center",
                    transition: "transform 200ms ease-out",
                    filter: "drop-shadow(0 4px 4px rgba(0,0,0,0.45))",
                  }}
                  aria-hidden="true"
                >
                  <VehicleIcon variant={driverVehicleVariant} size={42} />
                </div>
              </AdvancedHTMLMarker>
            ) : null}

            {/* Pinos das outras viaturas — silhueta configurada (carro,
                ambulância ou camião) + placa em badge por cima.
                O clique abre uma `InfoWindow` com placa + timestamp. */}
            {otherPins.map((p) => {
              const key = `${p.placa}|${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
              const variant = resolveVehicleType(
                p.placa,
                p.placa,
                vehicleTypeByPlaca,
                vehicleCatalogHint,
              );
              return (
                <AdvancedHTMLMarker
                  key={key}
                  position={{ lat: p.lat, lng: p.lng }}
                  zIndex={15}
                  onClick={() => setSelectedOtherPin(key)}
                  title={`${p.placa} — outra viatura em curso`}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "2px",
                      transform: "translate(0, -50%)",
                      filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        background: "rgba(255,255,255,0.95)",
                        color: "#0f172a",
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "1px 5px",
                        borderRadius: 4,
                        whiteSpace: "nowrap",
                        border: "1px solid #475569",
                      }}
                    >
                      {p.placa}
                    </span>
                    {/* Silhueta da viatura — em modo navegação activa,
                        deita-se com o tilt do mapa (perspective 3D).
                        Sem heading das outras viaturas, mostra sempre
                        "para cima" (no sentido do movimento da câmara). */}
                    <div
                      style={{
                        transform: navigating
                          ? `perspective(600px) rotateX(${NAV_TILT_DEGREES}deg)`
                          : "none",
                        transformOrigin: "center top",
                        transition: "transform 200ms ease-out",
                      }}
                    >
                      <VehicleIcon variant={variant} size={28} />
                    </div>
                  </div>
                </AdvancedHTMLMarker>
              );
            })}

            {/* InfoWindow do pin seleccionado — renderizada fora do
                AdvancedHTMLMarker para evitar problemas de portal. */}
            {selectedOtherPin
              ? otherPins
                  .filter(
                    (p) =>
                      `${p.placa}|${p.lat.toFixed(5)},${p.lng.toFixed(5)}` ===
                      selectedOtherPin,
                  )
                  .map((p) => (
                    <InfoWindow
                      key={`info-${selectedOtherPin}`}
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
                  ))
              : null}
          </GoogleMap>
        )}
      </div>

      {/* Barra superior — DUAS variantes:
          - Modo preview (`!navigating`): destino + cartão dist/tempo/chegada.
          - Modo navegação activa: cartão da PRÓXIMA MANOBRA (seta + texto +
            distância até à manobra), estilo Google Maps. */}
      {navigating && nextManeuver ? (
        <div
          className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex flex-col gap-1 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
        >
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-slate-900/95 px-4 py-3 text-white shadow-lg backdrop-blur">
            {/* Seta da manobra. */}
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-slate-900">
              <svg
                viewBox="0 0 24 24"
                width="36"
                height="36"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={maneuverArrowPath(nextManeuver.step)} />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-2xl font-bold leading-none">
                {nextManeuver.distM < 50
                  ? "Agora"
                  : nextManeuver.distM < 1000
                    ? `Em ${Math.round(nextManeuver.distM / 10) * 10} m`
                    : `Em ${(nextManeuver.distM / 1000).toLocaleString("pt-PT", {
                        maximumFractionDigits: 1,
                      })} km`}
              </p>
              <p className="mt-1 truncate text-sm text-white/85">
                {maneuverToPortuguese(nextManeuver.step) ||
                  (nextManeuver.step.name
                    ? `Continue na ${nextManeuver.step.name}`
                    : "Continue em frente")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setVoiceEnabled((v) => !v)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white"
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
        </div>
      ) : (
        <div
          className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex flex-col gap-2 bg-gradient-to-b from-black/45 to-transparent p-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
        >
          {/* Barra de endereço estilo Google Maps: "Seu local" (origem fixa)
              em cima + campo editável de destino em baixo. Submeter o campo
              (Enter ou botão "Aplicar") limpa a rota actual e dispara novo
              geocoding + cálculo de rota. Permite ao motorista refinar o
              destino sem fechar o navegador. */}
          <div className="pointer-events-auto flex items-start gap-2">
            <div className="min-w-0 flex-1 rounded-2xl bg-white text-slate-900 shadow-lg ring-1 ring-black/5">
              {/* Linha "Seu local" — origem (read-only). */}
              <div className="flex items-center gap-3 px-3 py-2">
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center"
                  aria-hidden="true"
                >
                  <span className="block h-3 w-3 rounded-full bg-blue-600 ring-[3px] ring-blue-100" />
                </span>
                <span className="truncate text-sm font-medium text-slate-700">
                  Seu local
                </span>
              </div>

              {/* Divisória pontilhada vertical (estilo Google Maps). */}
              <div
                aria-hidden="true"
                className="ml-[1.0625rem] flex flex-col items-start gap-[3px] pb-0.5"
              >
                <span className="block h-[3px] w-[3px] rounded-full bg-slate-300" />
                <span className="block h-[3px] w-[3px] rounded-full bg-slate-300" />
              </div>

              {/* Campo editável do destino — submete com Enter ou "Aplicar". */}
              <form
                className="flex items-center gap-3 px-3 py-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSubmitDestination();
                }}
              >
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center"
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 24 32" width="14" height="18">
                    <path
                      d="M12 0 C5 0 0 5 0 12 C0 20 12 32 12 32 C12 32 24 20 24 12 C24 5 19 0 12 0 Z"
                      fill="#dc2626"
                    />
                    <circle cx="12" cy="12" r="4" fill="#ffffff" />
                  </svg>
                </span>
                <input
                  type="text"
                  value={destinationInput}
                  onChange={(e) => setDestinationInput(e.target.value)}
                  placeholder="Destino"
                  aria-label="Destino"
                  className="min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  enterKeyHint="search"
                />
                {destinationInput.trim() &&
                destinationInput.trim() !== destinationQuery &&
                placeSuggestions.length === 0 &&
                !placesLoading ? (
                  <button
                    type="submit"
                    className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-[0.7rem] font-bold uppercase tracking-wider text-white shadow-sm active:bg-blue-700"
                  >
                    Aplicar
                  </button>
                ) : null}
              </form>

              {/* Sugestões Google Places (estilo Maps): aparecem assim que
                  o motorista digita ≥ 3 caracteres. Tocar numa sugestão
                  define o destino e dispara o cálculo de rota. */}
              {placesLoading || placeSuggestions.length > 0 ? (
                <div className="max-h-64 overflow-y-auto border-t border-slate-200">
                  {placesLoading && placeSuggestions.length === 0 ? (
                    <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500">
                      <span
                        className="block h-3 w-3 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600"
                        aria-hidden="true"
                      />
                      A procurar…
                    </div>
                  ) : null}
                  {placeSuggestions.map((suggestion) => {
                    const main =
                      suggestion.structured_formatting?.main_text ??
                      suggestion.description;
                    const secondary =
                      suggestion.structured_formatting?.secondary_text ?? "";
                    return (
                      <button
                        key={suggestion.place_id}
                        type="button"
                        onClick={() => handleSelectPlaceSuggestion(suggestion)}
                        className="flex w-full items-start gap-3 px-3 py-2 text-left text-slate-900 transition active:bg-slate-100"
                      >
                        <span
                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-slate-400"
                          aria-hidden="true"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width="16"
                            height="16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M12 22s-7-8.5-7-13a7 7 0 1 1 14 0c0 4.5-7 13-7 13z" />
                            <circle cx="12" cy="9" r="2.5" />
                          </svg>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {main}
                          </span>
                          {secondary ? (
                            <span className="block truncate text-[0.7rem] text-slate-500">
                              {secondary}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            {/* Div invisível usado como host do `PlacesService` antes do
                mapa estar montado. */}
            <div ref={placesServiceDivRef} style={{ display: "none" }} />
            <button
              type="button"
              onClick={() => setVoiceEnabled((v) => !v)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/95 text-slate-900 shadow ring-1 ring-black/5"
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
              {/* Badge de trânsito (só com Routes API). Mostra a severidade
                  global (fluido/lento/congestionado) e o atraso em minutos
                  quando significativo, para o motorista perceber o impacto. */}
              {route?.provider === "google" ? (
                <span
                  className={`mt-0.5 inline-flex w-fit items-center gap-1 rounded px-1.5 py-px text-[9px] font-bold uppercase tracking-wider ${
                    trafficSeverity === "jam"
                      ? "bg-red-100 text-red-700"
                      : trafficSeverity === "slow"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-emerald-100 text-emerald-700"
                  }`}
                  title={
                    typeof route.staticDuration === "number"
                      ? `Sem trânsito: ${formatDuration(route.staticDuration)}`
                      : undefined
                  }
                >
                  {trafficSeverity === "jam"
                    ? "Congestionado"
                    : trafficSeverity === "slow"
                      ? "Lento"
                      : "Fluido"}
                  {typeof route.staticDuration === "number" &&
                  route.duration - route.staticDuration > 60
                    ? ` · +${formatDuration(route.duration - route.staticDuration)}`
                    : null}
                </span>
              ) : null}
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
                {!loading &&
                  (error ??
                    (destinationQuery
                      ? "A preparar navegação…"
                      : "Digite o destino na barra acima para calcular a rota."))}
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
      )}

      {/* Rodapé compacto (apenas em modo navegação): km restantes · ETA. */}
      {navigating && route ? (
        <div
          className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 5.25rem)" }}
        >
          <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-white/95 px-4 py-2 text-slate-900 shadow-md backdrop-blur">
            <span className="text-sm font-bold leading-none">
              {formatDistance(route.distance)}
            </span>
            <span className="h-4 w-px bg-slate-300" />
            <span className="text-sm font-semibold leading-none">
              {formatDuration(route.duration)}
            </span>
            <span className="h-4 w-px bg-slate-300" />
            <span className="text-sm font-semibold leading-none text-slate-600">
              {formatEta(route.duration)}
            </span>
          </div>
        </div>
      ) : null}

      {/* Botão flutuante: trancar tela (canto superior esquerdo). */}
      <button
        type="button"
        onClick={() => {
          lastLockTapRef.current = 0;
          setScreenLocked(true);
        }}
        className="pointer-events-auto absolute left-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-slate-900/85 text-white shadow-lg backdrop-blur active:bg-slate-900"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 12rem)" }}
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
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 12rem)" }}
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

      {/* Botão "Iniciar" — só aparece em modo preview (antes de navegar) e
          quando há rota calculada. Estilo Google Maps: pílula verde grande
          ao centro inferior, com seta de play. */}
      {route && !navigating ? (
        <button
          type="button"
          onClick={() => {
            navInitializedRef.current = false;
            setUserPanned(false);
            setNavigating(true);
          }}
          className="pointer-events-auto absolute left-1/2 z-10 flex h-14 -translate-x-1/2 items-center gap-2 rounded-full bg-emerald-600 px-6 text-white shadow-xl shadow-emerald-900/40 backdrop-blur active:bg-emerald-700"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
          aria-label="Iniciar navegação"
          title="Iniciar navegação"
        >
          <svg
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M6 4l16 8-16 8V4z" />
          </svg>
          <span className="text-base font-bold uppercase tracking-wider">Iniciar</span>
        </button>
      ) : null}

      {/* Botão "Centralizar" — circular com crosshair GPS, empilhado por
          cima do "Voltar" no canto inferior esquerdo. Sempre visível quando
          há posição. Acção: pan + zoom 17 + reactivar auto-follow (se
          estiver em navegação). Em navegação, restaura também o tilt 3D
          e a rotação por heading. */}
      {origin ? (
        <button
          type="button"
          onClick={() => {
            if (mapInstance) {
              mapInstance.panTo({ lat: origin.lat, lng: origin.lng });
              mapInstance.setZoom(
                navigating ? NAV_ACTIVE_ZOOM : PREVIEW_RECENTER_ZOOM,
              );
              if (navigating) {
                try {
                  mapInstance.setTilt(NAV_TILT_DEGREES);
                  if (heading !== null && Number.isFinite(heading)) {
                    mapInstance.setHeading(heading);
                  }
                } catch {
                  // ignora se mapa raster
                }
              }
            }
            setUserPanned(false);
          }}
          className={`pointer-events-auto absolute left-3 z-10 flex h-12 w-12 items-center justify-center rounded-full shadow-lg backdrop-blur active:scale-95 ${
            navigating && userPanned
              ? "bg-blue-600 text-white"
              : "bg-white/95 text-blue-600"
          }`}
          style={{
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 4.25rem)",
          }}
          aria-label="Centralizar na minha posição"
          title="Centralizar na minha posição"
        >
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <circle cx="12" cy="12" r="8" />
            <line x1="12" y1="2" x2="12" y2="5" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <line x1="2" y1="12" x2="5" y2="12" />
            <line x1="19" y1="12" x2="22" y2="12" />
          </svg>
        </button>
      ) : null}

      {/* Botão "Visão geral" — em modo navegação volta ao preview com fitBounds. */}
      {navigating ? (
        <button
          type="button"
          onClick={() => {
            // Voltar ao preview: para a câmara seguir, e reaplica o fitBounds.
            setNavigating(false);
            routeFittedRef.current = false;
          }}
          className="pointer-events-auto absolute right-3 z-10 flex h-12 items-center gap-2 rounded-full bg-white/95 px-4 text-slate-900 shadow-lg backdrop-blur active:bg-slate-100"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
          aria-label="Voltar à visão geral da rota"
          title="Visão geral"
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-9-4z" />
            <line x1="3" y1="7" x2="21" y2="7" />
          </svg>
          <span className="text-xs font-bold uppercase tracking-wider">Visão geral</span>
        </button>
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
