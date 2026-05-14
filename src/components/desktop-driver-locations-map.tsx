import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Map as MapIcon, X } from "lucide-react";
import { useCatalogItems } from "../context/catalog-items-context";
import { useDriverActiveLocations } from "../hooks/useDriverActiveLocations";
import { useVehicleTypeByPlaca } from "../hooks/useVehicleTypeByPlaca";
import { isFirebaseConfigured } from "../lib/firebase/config";
import {
  resolveVehicleType,
  type VehicleCatalogHint,
  type VehicleTypeByPlaca,
} from "../lib/vehicleTypeByPlaca";
import { Button } from "./ui/button";
import { VehicleIcon } from "./vehicle-icon";

const OSM_TILE = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const BR_VIEW: L.LatLngExpression = [-14.2, -51.9];
const BR_ZOOM_EMPTY = 5;

function escapePopupHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/>/g, "&gt;");
}

type DriverLocationsMapUi = {
  open: () => void;
  pinsCount: number;
  countLabel: string;
};

const DriverLocationsMapUiContext = createContext<DriverLocationsMapUi | null>(null);

function formatHmSs(ms: number): string {
  return new Date(ms).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Devolve "11/05/2026 às 19:53" (com data + hora curtas), em pt-BR. */
function formatDateTime(ms: number): string {
  const d = new Date(ms);
  const date = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${date} às ${time}`;
}

/** "agora", "há 3 min", "há 2 h", "há 1 dia" — útil para popup do mapa. */
function formatRelative(ms: number, now: number = Date.now()): string {
  const diffSec = Math.max(0, Math.floor((now - ms) / 1000));
  if (diffSec < 60) return "agora mesmo";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `há ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `há ${hr} h`;
  const days = Math.floor(hr / 24);
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}

/**
 * Envolve o layout desktop e expõe o botão do mapa no cabeçalho (ao lado do RDV).
 * Mantém um único listener Firestore + estado do modal.
 */
export function DesktopDriverLocationsMapProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [snapshotRetryNonce, setSnapshotRetryNonce] = useState(0);
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const canSync = Boolean(enabled && isFirebaseConfigured());
  const { pins, error, loading, lastUpdateAtMs, subscribed } = useDriverActiveLocations(canSync, snapshotRetryNonce);
  // Mapa placa→tipo de viatura sincronizado entre dispositivos. As silhuetas
  // dos pinos no mapa Leaflet seguem esta configuração (definida em
  // Configurações → Mobile — rastreamento GPS).
  const vehicleTypeByPlaca = useVehicleTypeByPlaca();
  // Pista do catálogo — placas em `ambulancias` defaultam para ambulância
  // mesmo sem configuração explícita no mapa acima.
  const { items: catalogItems } = useCatalogItems();
  const catalogHint: VehicleCatalogHint = {
    ambulancias: catalogItems.ambulancias,
    viaturasAdministrativas: catalogItems.viaturasAdministrativas,
  };

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const countLabel =
    pins.length === 0
      ? "nenhuma viatura com posição"
      : pins.length === 1
        ? "1 viatura em tempo real"
        : `${pins.length} viaturas em tempo real`;

  const uiValue: DriverLocationsMapUi | null = canSync
    ? {
        open: () => setOpen(true),
        pinsCount: pins.length,
        countLabel,
      }
    : null;

  return (
    <DriverLocationsMapUiContext.Provider value={uiValue}>
      {children}
      {canSync ? (
        <>
          {open ? (
            <div
              className="fixed inset-0 z-[95] flex flex-col bg-[hsl(var(--background))]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="sot-driver-map-title"
            >
              <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 shadow-sm">
                <div className="min-w-0">
                  <h2 id="sot-driver-map-title" className="truncate text-lg font-semibold text-[hsl(var(--foreground))]">
                    Localização das viaturas
                  </h2>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    {lastUpdateAtMs
                      ? `Última atualização Firebase: ${formatHmSs(lastUpdateAtMs)} · placa sempre visível junto ao marcador`
                      : subscribed
                        ? "OpenStreetMap · a aguardar posições…"
                        : "OpenStreetMap · a ligar ao Firebase…"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  aria-label="Fechar mapa"
                  onClick={() => setOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </header>

              <div className="relative min-h-0 flex-1">
                <div ref={containerRef} className="driver-locations-map-leaflet absolute inset-0 z-0" />
                {!online ? (
                  <div className="pointer-events-none absolute inset-x-0 top-4 z-[500] mx-auto flex w-[min(92%,28rem)] justify-center px-2">
                    <div className="rounded-md border border-amber-500/70 bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-950 shadow dark:bg-amber-950/85 dark:text-amber-100">
                      Sem ligação à Internet — atualizações do mapa retomam ao voltar a estar online.
                    </div>
                  </div>
                ) : null}
                {loading ? (
                  <div className="pointer-events-none absolute left-4 top-4 z-[500] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))]/95 px-3 py-2 text-xs text-[hsl(var(--muted-foreground))] shadow">
                    A sincronizar localizações…
                  </div>
                ) : null}
                {error ? (
                  <div className="absolute left-4 top-14 z-[500] flex max-w-md flex-col gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900 shadow dark:border-red-800 dark:bg-red-950/90 dark:text-red-100">
                    <span>{error}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 self-start border-red-400/80 bg-white text-red-900 hover:bg-red-100 dark:bg-red-900/40 dark:text-red-50 dark:hover:bg-red-900/60"
                      onClick={() => setSnapshotRetryNonce((n) => n + 1)}
                    >
                      Tentar novamente
                    </Button>
                  </div>
                ) : null}
                {!loading && !error && pins.length === 0 ? (
                  <div className="pointer-events-none absolute left-4 top-4 z-[500] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))]/95 px-3 py-2 text-xs text-[hsl(var(--muted-foreground))] shadow">
                    Nenhuma viatura com posição ativa no momento.
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <MapLeafletHost
            visible={open}
            containerRef={containerRef}
            mapRef={mapRef}
            layerRef={layerRef}
            pins={pins}
            vehicleTypeByPlaca={vehicleTypeByPlaca}
            catalogHint={catalogHint}
          />
        </>
      ) : null}
    </DriverLocationsMapUiContext.Provider>
  );
}

/** Abre o mapa de localização em tempo real (contexto de `DesktopDriverLocationsMapProvider`). */
export function DesktopDriverLocationsMapHeaderButton() {
  const ctx = useContext(DriverLocationsMapUiContext);
  if (!ctx) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={ctx.open}
      aria-label={`Abrir mapa de localização — ${ctx.countLabel}`}
      title={`Mapa — ${ctx.countLabel}`}
      className="relative shrink-0"
    >
      <MapIcon className="h-[1.35rem] w-[1.35rem]" aria-hidden />
      {ctx.pinsCount > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-[0.65rem] font-bold leading-none text-white shadow-sm">
          {ctx.pinsCount > 99 ? "99+" : ctx.pinsCount}
        </span>
      ) : null}
    </Button>
  );
}

/**
 * Pré-renderiza as 3 silhuetas SVG para HTML estático em ordem de montagem
 * do módulo. Reutilizar a mesma string por tipo é ~30× mais rápido do que
 * chamar `renderToStaticMarkup` por pin a cada update.
 */
const VEHICLE_ICON_HTML = {
  car: renderToStaticMarkup(<VehicleIcon variant="car" size={32} />),
  ambulance: renderToStaticMarkup(<VehicleIcon variant="ambulance" size={32} />),
  truck: renderToStaticMarkup(<VehicleIcon variant="truck" size={32} />),
} as const;

/**
 * Cria um `L.divIcon` para uma viatura com a silhueta apropriada + badge da
 * placa por cima. Tamanho fixo (32×48) — ancora no centro horizontal e na
 * base vertical da viatura para que o pin "fique" exactamente sobre a
 * coordenada GPS.
 */
function buildVehicleDivIcon(placa: string, variant: "car" | "ambulance" | "truck"): L.DivIcon {
  const label = escapePopupHtml(placa);
  const svgHtml = VEHICLE_ICON_HTML[variant];
  // Total: badge (~16px) + gap 2 + silhueta (48px) = ~66 de altura.
  const html = `
    <div class="sot-driver-vehicle-marker">
      <span class="sot-driver-vehicle-placa">${label}</span>
      ${svgHtml}
    </div>
  `;
  return L.divIcon({
    html,
    className: "sot-driver-vehicle-divicon",
    iconSize: [40, 70],
    iconAnchor: [20, 60],
    popupAnchor: [0, -56],
    tooltipAnchor: [0, -56],
  });
}

function MapLeafletHost({
  visible,
  containerRef,
  mapRef,
  layerRef,
  pins,
  vehicleTypeByPlaca,
  catalogHint,
}: {
  visible: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  mapRef: React.RefObject<L.Map | null>;
  layerRef: React.RefObject<L.LayerGroup | null>;
  pins: { placa: string; lat: number; lng: number; lastUpdateAtMs: number | null }[];
  vehicleTypeByPlaca: VehicleTypeByPlaca;
  catalogHint: VehicleCatalogHint;
}) {
  const prevPinCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (!visible) prevPinCountRef.current = null;
  }, [visible]);

  useEffect(() => {
    if (!visible || !containerRef.current) return;

    const el = containerRef.current;
    const map = L.map(el, { zoomControl: true }).setView(BR_VIEW, BR_ZOOM_EMPTY);

    L.tileLayer(OSM_TILE, {
      maxZoom: 19,
      attribution: OSM_ATTRIB,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);

    mapRef.current = map;
    layerRef.current = group;

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
      layerRef.current = null;
    };
    // refs estáveis — não listar refs nas deps para evitar re-execução
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apenas ao abrir/fechar o modal
  }, [visible]);

  useEffect(() => {
    if (!visible || !mapRef.current || !layerRef.current) return;

    const map = mapRef.current;
    const group = layerRef.current;

    group.clearLayers();

    for (const p of pins) {
      // Resolve o tipo de viatura configurado na aba GPS (com fallback
      // pelo catálogo + heurístico se a placa não estiver configurada).
      const variant = resolveVehicleType(p.placa, p.placa, vehicleTypeByPlaca, catalogHint);
      const icon = buildVehicleDivIcon(p.placa, variant);
      const m = L.marker([p.lat, p.lng], { icon, riseOnHover: true });
      const label = escapePopupHtml(p.placa);
      const popupHtml =
        p.lastUpdateAtMs !== null
          ? `<strong>${label}</strong><br /><span style="font-size:11px;color:#555">Última posição: ${escapePopupHtml(
              formatDateTime(p.lastUpdateAtMs),
            )} <span style="opacity:0.7">(${escapePopupHtml(formatRelative(p.lastUpdateAtMs))})</span></span>`
          : `<strong>${label}</strong><br /><span style="font-size:11px;color:#888">Hora da última posição desconhecida.</span>`;
      m.bindPopup(popupHtml, { className: "sot-driver-map-popup" });
      m.addTo(group);
    }

    const n = pins.length;
    const prev = prevPinCountRef.current;
    prevPinCountRef.current = n;
    /** Só reposiciona zoom/canvas quando mudou o número de viaturas (evita saltos a cada actualização GPS). */
    const shouldResetView = prev === null || prev !== n;

    if (shouldResetView) {
      if (n >= 2) {
        try {
          const bounds = L.latLngBounds(pins.map((p) => [p.lat, p.lng] as L.LatLngTuple));
          map.fitBounds(bounds, { padding: [56, 56], maxZoom: 15 });
        } catch {
          map.setView(BR_VIEW, BR_ZOOM_EMPTY);
        }
      } else if (n === 1) {
        map.setView([pins[0].lat, pins[0].lng], 14);
      } else {
        map.setView(BR_VIEW, BR_ZOOM_EMPTY);
      }
    }

    requestAnimationFrame(() => map.invalidateSize());
  }, [visible, pins, vehicleTypeByPlaca, catalogHint]);

  return null;
}
