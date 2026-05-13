/**
 * Componente de mapa baseado no Google Maps JavaScript API através da
 * biblioteca `@react-google-maps/api`.
 *
 * Setup:
 *  1. Obtém uma chave em https://console.cloud.google.com → APIs & Services →
 *     Credentials. Activa pelo menos «Maps JavaScript API»; se fores usar rotas
 *     com trânsito, activa também «Directions API» e «Places API».
 *  2. Define a chave numa das duas formas (a primeira que existir vence):
 *     a. Variável de ambiente Vite no ficheiro `.env` da raiz:
 *        VITE_GOOGLE_MAPS_API_KEY=AIza…  (NUNCA commitar — `.env` está no .gitignore)
 *     b. Prop `apiKey` directamente neste componente.
 *
 * O carregamento é feito uma única vez pelo hook `useJsApiLoader` (o script
 * `https://maps.googleapis.com/maps/api/js` é injectado lazy e partilhado
 * entre todas as instâncias deste componente na app).
 *
 * Estados visuais possíveis (renderizados sempre na mesma dimensão para
 * evitar layout shift):
 *  • Sem chave de API → painel pontilhado com instruções.
 *  • Erro a carregar a API → mensagem vermelha.
 *  • A carregar a API do Google Maps → spinner textual «A carregar mapa…».
 *  • A obter primeira posição GPS (quando `trackUserLocation` está ligado e
 *    ainda não existe nem `position` nem `error`) → «A obter localização GPS…».
 *  • Tudo pronto → `<GoogleMap>` interactivo com marcadores.
 *
 * Limpeza / performance:
 *  • O `watchPosition` é registado pelo hook `useWatchUserLocation` e o seu
 *    `useEffect` devolve um cleanup que chama `navigator.geolocation.clearWatch`
 *    quando o componente desmonta **ou** quando `trackUserLocation` passa a
 *    `false`. Isto evita fugas de memória (handler do GPS continuar a chamar
 *    `setState` num componente já desmontado) e consumo desnecessário de
 *    bateria/GPS depois do mapa fechar.
 *  • O script `maps.googleapis.com` é injectado uma única vez (id global
 *    `"google-maps-script"`), partilhado entre todas as instâncias.
 *
 * PWA — Screen Wake Lock:
 *  • Por defeito (`keepScreenAwake={true}`) o componente pede uma Screen Wake
 *    Lock ao sistema operativo enquanto estiver montado, prevenindo o ecrã
 *    do telemóvel de apagar automaticamente. Isto é importante porque o
 *    iOS/Android **estrangulam ou suspendem o GPS** quando o ecrã apaga,
 *    o que faria a `watchPosition` parar de receber actualizações.
 *  • Re-aquisição automática quando o utilizador volta ao separador (após
 *    `visibilitychange`).
 *  • Cleanup garantido no unmount.
 *  • Disponível só em HTTPS/localhost e browsers modernos (Chrome 84+,
 *    Safari iOS 16.4+). Sem suporte → o componente continua a funcionar,
 *    só não previne o ecrã de apagar (consumidor pode reagir via
 *    `onWakeLockChange.isSupported`).
 */

import { Circle, GoogleMap, Marker, useJsApiLoader, type Libraries } from "@react-google-maps/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { useScreenWakeLock } from "../hooks/useScreenWakeLock";
import {
  useWatchUserLocation,
  type UseWatchUserLocationOptions,
  type WatchedPosition,
} from "../hooks/useWatchUserLocation";

/**
 * Chave da Google Maps API.
 *
 * ── ESPAÇO RESERVADO PARA A TUA CHAVE ─────────────────────────────────────────
 *   Preferencial: define `VITE_GOOGLE_MAPS_API_KEY` no ficheiro `.env` da raiz.
 *   Alternativa:  substitui a string vazia abaixo pela tua chave (NÃO commitar).
 * ─────────────────────────────────────────────────────────────────────────────
 */
const FALLBACK_GOOGLE_MAPS_API_KEY = "";

/**
 * Bibliotecas adicionais carregadas junto com o Maps JS. Inclui «places» (para
 * autocomplete de endereços, alternativa ao Nominatim) e «geometry» (cálculos
 * de distância/área no cliente). Mantemos a referência estável fora do
 * componente para evitar reload do script a cada render.
 */
const DEFAULT_LIBRARIES: Libraries = ["places", "geometry"];

/** Centro inicial por defeito (Brasília, BR) — sobrescreve via prop `center`. */
const DEFAULT_CENTER: google.maps.LatLngLiteral = { lat: -15.793889, lng: -47.882778 };

/**
 * Estilo CSS por defeito do contentor — 100 % de largura por 400 px de altura,
 * alinhado com a especificação de uso do projecto. Sobrescreve via
 * `containerStyle` ou `className` quando precisares de outra dimensão.
 */
const DEFAULT_CONTAINER_STYLE: React.CSSProperties = {
  width: "100%",
  height: "400px",
};

/** Marcador simples a renderizar sobre o mapa. */
export type MapMarker = {
  position: google.maps.LatLngLiteral;
  /** Título opcional (mostrado no hover do desktop). */
  title?: string;
  /** Identificador único — útil quando o pai precisa de mapear cliques. */
  id?: string;
};

export type GoogleMapComponentProps = {
  /**
   * Chave da Google Maps API. Se não passares, o componente lê de
   * `import.meta.env.VITE_GOOGLE_MAPS_API_KEY` ou, como último recurso, do
   * `FALLBACK_GOOGLE_MAPS_API_KEY` definido no topo deste ficheiro.
   */
  apiKey?: string;
  /** Centro do mapa. Default: Brasília. */
  center?: google.maps.LatLngLiteral;
  /** Nível de zoom inicial (0 = mundo, 20 = edifícios). Default: 13. */
  zoom?: number;
  /** Lista de marcadores a renderizar. */
  markers?: MapMarker[];
  /**
   * Bibliotecas extra a carregar com o Maps JS. Por defeito incluímos
   * `places` e `geometry` — passa um array vazio para carregar só o core.
   */
  libraries?: Libraries;
  /** Estilo aplicado ao contentor `<div>` que envolve o mapa. */
  containerStyle?: React.CSSProperties;
  /** Classe Tailwind/CSS aplicada ao contentor externo. */
  className?: string;
  /**
   * Callback disparado uma única vez quando o mapa termina de carregar e a
   * instância `google.maps.Map` está pronta. Útil para o pai guardar a ref e
   * controlar o mapa imperativamente (panTo, fitBounds, etc.).
   */
  onMapLoad?: (map: google.maps.Map) => void;
  /** Callback quando um marcador é clicado (recebe o marker fornecido). */
  onMarkerClick?: (marker: MapMarker) => void;
  /**
   * Locale forçado (ex.: `pt-PT`, `pt-BR`, `en`). Por defeito, o Google
   * detecta automaticamente a partir do `Accept-Language` do browser.
   */
  language?: string;
  /** Região para tendência de geocoding (`BR`, `PT`, …). */
  region?: string;
  /**
   * Quando `true`, o componente arranca `navigator.geolocation.watchPosition`
   * com `{ enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }` (overridable
   * via `watchOptions`) e desenha um marcador azul tipo "estás aqui" na
   * última posição conhecida. O cleanup é automático ao desmontar.
   */
  trackUserLocation?: boolean;
  /**
   * Sobrescreve as opções passadas ao `watchPosition` (apenas usadas quando
   * `trackUserLocation` é `true`).
   */
  watchOptions?: UseWatchUserLocationOptions;
  /**
   * Comportamento da centragem do mapa face à posição do utilizador:
   *   • `"always"` (default) — sempre que as coordenadas mudam, o mapa
   *     recentra-se suavemente (modo "siga-me", como o Google Maps em
   *     navegação activa).
   *   • `"first-fix"` — centra **apenas uma vez**, na primeira posição
   *     recebida; após isso o utilizador pode fazer pan/zoom à vontade.
   *   • `"off"` — nunca altera o centro automaticamente.
   */
  followMode?: "off" | "first-fix" | "always";
  /**
   * Callback disparado a cada actualização de posição vinda do `watchPosition`.
   * Útil quando o pai precisa de enviar a posição a um servidor, gravar
   * histórico, etc. (Não confundir com `onMapLoad`.)
   */
  onUserLocationChange?: (pos: WatchedPosition) => void;
  /**
   * Callback de erro do `watchPosition` (permissão negada, timeout, etc.).
   */
  onUserLocationError?: (err: GeolocationPositionError) => void;
  /**
   * Quando `true` (default), o componente pede uma **Screen Wake Lock** ao
   * sistema enquanto estiver montado — impede o ecrã do telemóvel de apagar
   * automaticamente e, consequentemente, evita que o iOS/Android suspendam
   * o GPS por inactividade.
   *
   * Libertação automática:
   *   • Quando o componente desmonta.
   *   • Quando o utilizador troca de separador/app (visibilitychange) —
   *     o hook re-pede a lock quando volta.
   *   • Quando esta prop muda para `false`.
   *
   * Disponível só em contextos seguros (HTTPS/localhost) e browsers
   * modernos (Chrome 84+, Safari iOS 16.4+, etc.). Em browsers sem suporte
   * o componente continua a funcionar — só não previne o ecrã de apagar.
   */
  keepScreenAwake?: boolean;
  /**
   * Callback quando o estado da Screen Wake Lock muda — útil para mostrar
   * uma indicação visual ao utilizador («ecrã trancado» / «ecrã pode
   * apagar»). Recebe um objecto com `isActive` (lock activa agora),
   * `isSupported` (API suportada neste browser/contexto) e `error`
   * (último erro, ou `null`).
   */
  onWakeLockChange?: (state: { isActive: boolean; isSupported: boolean; error: Error | null }) => void;
  /**
   * Desenha um círculo semi-transparente em redor do marcador do utilizador
   * representando o raio de precisão reportado pelo GPS (efeito "estás aqui"
   * do Google Maps). Default: `true`.
   */
  showAccuracyCircle?: boolean;
};

/**
 * Resolve a chave da API a partir das fontes possíveis, por ordem de
 * preferência: prop → variável de ambiente Vite → fallback hardcoded.
 */
function resolveApiKey(propKey?: string): string {
  if (propKey && propKey.trim()) return propKey.trim();
  const envKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";
  if (envKey.trim()) return envKey.trim();
  return FALLBACK_GOOGLE_MAPS_API_KEY;
}

type StatusPanelProps = {
  /** Texto principal mostrado no centro. */
  children: React.ReactNode;
  /** Tom visual; afecta a cor do texto e o `role` ARIA usado. */
  tone?: "loading" | "error" | "empty";
  className?: string;
  containerStyle?: React.CSSProperties;
  /**
   * Renderiza um pequeno spinner SVG animado à esquerda do texto. Só faz
   * sentido em `tone="loading"`.
   */
  spinner?: boolean;
};

/**
 * Painel de status interno usado nos estados "a carregar", "erro" e "sem chave".
 * Centralizado para garantir a mesma dimensão em todos os estados (evita
 * layout shift entre transições).
 */
function StatusPanel({
  children,
  tone = "loading",
  className,
  containerStyle,
  spinner = false,
}: StatusPanelProps) {
  const color =
    tone === "error"
      ? "rgb(185 28 28)"
      : tone === "empty"
        ? "rgb(71 85 105)"
        : "rgb(100 116 139)";
  const ariaProps =
    tone === "loading"
      ? { "aria-busy": true as const, "aria-live": "polite" as const }
      : tone === "error"
        ? { role: "alert" as const }
        : { role: "status" as const, "aria-live": "polite" as const };
  return (
    <div className={className} style={containerStyle} {...ariaProps}>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          width: "100%",
          height: "100%",
          gap: "0.5rem",
          color,
          fontSize: "0.875rem",
          textAlign: "center",
          padding: "1rem",
        }}
      >
        {spinner ? (
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden="true"
            style={{ animation: "sot-gmap-spin 1s linear infinite" }}
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        ) : null}
        <span>{children}</span>
      </div>
      {/* Keyframes do spinner — inline para o componente ser self-contained
          sem depender de Tailwind/CSS global. */}
      <style>{`
        @keyframes sot-gmap-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

/**
 * Mapa Google embebido reutilizável. Trata loading/erro/missing-key
 * sem rebentar a UI à volta — sempre devolve um contentor com a mesma
 * dimensão para evitar layout shift.
 */
export function GoogleMapComponent({
  apiKey,
  center = DEFAULT_CENTER,
  zoom = 13,
  markers = [],
  libraries = DEFAULT_LIBRARIES,
  containerStyle = DEFAULT_CONTAINER_STYLE,
  className,
  onMapLoad,
  onMarkerClick,
  language,
  region,
  trackUserLocation = false,
  watchOptions,
  followMode = "always",
  onUserLocationChange,
  onUserLocationError,
  keepScreenAwake = true,
  onWakeLockChange,
  showAccuracyCircle = true,
}: GoogleMapComponentProps) {
  // Não memoizamos: `resolveApiKey` lê `import.meta.env` (Vite substitui em
  // build-time, mas o ESLint v7 `react-hooks/purity` vê o acesso como impuro).
  // O cálculo é trivial e a chave raramente muda entre renders.
  const resolvedKey = resolveApiKey(apiKey);

  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-maps-script",
    googleMapsApiKey: resolvedKey,
    libraries,
    language,
    region,
  });

  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const [, setMapInstance] = useState<google.maps.Map | null>(null);

  const handleLoad = useCallback(
    (map: google.maps.Map) => {
      mapInstanceRef.current = map;
      setMapInstance(map);
      onMapLoad?.(map);
    },
    [onMapLoad],
  );

  const handleUnmount = useCallback(() => {
    mapInstanceRef.current = null;
    setMapInstance(null);
  }, []);

  /**
   * Rastreamento contínuo da posição do utilizador via Geolocation API.
   * Activo apenas quando `trackUserLocation` é true.
   */
  const {
    position: userPosition,
    error: userPositionError,
  } = useWatchUserLocation({
    enabled: trackUserLocation,
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 5000,
    ...watchOptions,
  });

  /**
   * Pede uma Screen Wake Lock ao sistema enquanto o mapa estiver montado, para
   * o ecrã do telemóvel não apagar (e, com isso, o GPS não ser estrangulado
   * pelo modo de repouso). O hook trata o re-pedido em `visibilitychange` e
   * a libertação no unmount.
   */
  const wakeLock = useScreenWakeLock({ enabled: keepScreenAwake });

  /** Propaga o estado do wake lock ao chamador (útil para badges UI). */
  useEffect(() => {
    if (!onWakeLockChange) return;
    onWakeLockChange({
      isActive: wakeLock.isActive,
      isSupported: wakeLock.isSupported,
      error: wakeLock.error,
    });
  }, [wakeLock.isActive, wakeLock.isSupported, wakeLock.error, onWakeLockChange]);

  /** Propaga cada nova posição ao chamador (callback estável via `useEffect`). */
  useEffect(() => {
    if (userPosition && onUserLocationChange) {
      onUserLocationChange(userPosition);
    }
  }, [userPosition, onUserLocationChange]);

  useEffect(() => {
    if (userPositionError && onUserLocationError) {
      onUserLocationError(userPositionError);
    }
  }, [userPositionError, onUserLocationError]);

  /**
   * Centragem do mapa em função do `followMode`:
   *   • `"off"` — efeito não dispara nenhuma acção.
   *   • `"first-fix"` — `panTo` apenas na primeira posição recebida.
   *   • `"always"` — `panTo` suavemente sempre que as coordenadas mudam
   *     (modo "siga-me").
   * O efeito é re-executado a cada nova posição porque `userPosition` é a
   * dependência; o `panTo` é um no-op se a coordenada for igual à anterior.
   */
  const didCenterOnFirstFixRef = useRef(false);
  useEffect(() => {
    if (followMode === "off") return;
    if (!userPosition) return;
    const map = mapInstanceRef.current;
    if (!map) return;
    if (followMode === "first-fix" && didCenterOnFirstFixRef.current) return;
    map.panTo({ lat: userPosition.lat, lng: userPosition.lng });
    didCenterOnFirstFixRef.current = true;
  }, [userPosition, followMode]);

  if (!resolvedKey) {
    return (
      <StatusPanel tone="empty" className={className} containerStyle={containerStyle}>
        <span style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <strong>Google Maps API key não configurada</strong>
          <span>
            Define <code>VITE_GOOGLE_MAPS_API_KEY</code> em <code>.env</code> ou passa a prop{" "}
            <code>apiKey</code>.
          </span>
        </span>
      </StatusPanel>
    );
  }

  if (loadError) {
    return (
      <StatusPanel tone="error" className={className} containerStyle={containerStyle}>
        Falha ao carregar o Google Maps: {loadError.message}
      </StatusPanel>
    );
  }

  if (!isLoaded) {
    return (
      <StatusPanel tone="loading" spinner className={className} containerStyle={containerStyle}>
        A carregar mapa…
      </StatusPanel>
    );
  }

  /**
   * Estado de loading extra: estamos a rastrear o utilizador (`trackUserLocation`
   * `true`) mas o GPS ainda não devolveu a primeira posição nem um erro
   * explícito. Mantemos o mapa oculto até termos algo para mostrar — assim
   * cumprimos a especificação «carregando enquanto a API do Google ou a
   * primeira posição GPS não forem obtidas». Quando o `watchPosition` falha
   * (permissão negada, timeout), `userPositionError` deixa de ser `null` e
   * o componente passa adiante para renderizar o mapa sem o pino do utilizador
   * — o consumidor pode tratar o erro via `onUserLocationError`.
   */
  if (trackUserLocation && !userPosition && !userPositionError) {
    return (
      <StatusPanel tone="loading" spinner className={className} containerStyle={containerStyle}>
        A obter localização GPS…
      </StatusPanel>
    );
  }

  /**
   * Ícone azul tipo "estás aqui" do Google Maps. Construído só depois do
   * script estar carregado (precisa de `google.maps.SymbolPath`).
   */
  const userLocationIcon: google.maps.Symbol = {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 8,
    fillColor: "#4285F4",
    fillOpacity: 1,
    strokeColor: "#FFFFFF",
    strokeWeight: 2,
  };

  return (
    <div className={className} style={containerStyle}>
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "100%" }}
        center={center}
        zoom={zoom}
        onLoad={handleLoad}
        onUnmount={handleUnmount}
        options={{
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        }}
      >
        {markers.map((m, idx) => (
          <Marker
            key={m.id ?? `${m.position.lat},${m.position.lng},${idx}`}
            position={m.position}
            title={m.title}
            onClick={onMarkerClick ? () => onMarkerClick(m) : undefined}
          />
        ))}

        {trackUserLocation && userPosition ? (
          <>
            {showAccuracyCircle && userPosition.accuracy > 0 ? (
              <Circle
                center={{ lat: userPosition.lat, lng: userPosition.lng }}
                radius={userPosition.accuracy}
                options={{
                  strokeColor: "#4285F4",
                  strokeOpacity: 0.6,
                  strokeWeight: 1,
                  fillColor: "#4285F4",
                  fillOpacity: 0.15,
                  clickable: false,
                  draggable: false,
                  editable: false,
                  zIndex: 9998,
                }}
              />
            ) : null}
            <Marker
              position={{ lat: userPosition.lat, lng: userPosition.lng }}
              title={`A tua posição (±${Math.round(userPosition.accuracy)} m)`}
              icon={userLocationIcon}
              zIndex={9999}
            />
          </>
        ) : null}
      </GoogleMap>
    </div>
  );
}

export default GoogleMapComponent;
