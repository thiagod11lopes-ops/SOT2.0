import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Map as MapIcon, X } from "lucide-react";
import { useCatalogItems } from "../context/catalog-items-context";
import { useDepartures } from "../context/departures-context";
import { useDriverActiveLocations } from "../hooks/useDriverActiveLocations";
import { useVehicleTypeByPlaca } from "../hooks/useVehicleTypeByPlaca";
import { filterDriverLocationPinsPorSaidaIniciada } from "../lib/departureDriverMapFilter";
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

/**
 * Bairro Lins de Vasconcelos (RJ) — posição **inicial** da cruz (antes de qualquer arraste).
 * O utilizador pode arrastar o marcador; a nova posição guarda-se em `localStorage`.
 */
const DEFAULT_LINS_DE_VASCONCELOS_CRUZ_LATLNG: L.LatLngTuple = [-22.90858, -43.27967];

const LINS_CROSS_POSITION_LS_KEY = "sot-driver-map-lins-cross-latlng-v1";

function loadSavedLinsCrossLatLng(): L.LatLngTuple | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LINS_CROSS_POSITION_LS_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { lat?: unknown; lng?: unknown };
    const lat = Number(o.lat);
    const lng = Number(o.lng);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return null;
    }
    return [lat, lng];
  } catch {
    return null;
  }
}

function persistLinsCrossLatLng(ll: L.LatLngTuple): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      LINS_CROSS_POSITION_LS_KEY,
      JSON.stringify({ lat: ll[0], lng: ll[1], updatedAt: Date.now() }),
    );
  } catch {
    /* quota / modo privado */
  }
}

const DN1_POSITION_LS_KEY = "sot-driver-map-1dn-latlng-v1";

function loadSavedDn1LatLng(): L.LatLngTuple | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(DN1_POSITION_LS_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { lat?: unknown; lng?: unknown };
    const lat = Number(o.lat);
    const lng = Number(o.lng);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return null;
    }
    return [lat, lng];
  } catch {
    return null;
  }
}

function persistDn1LatLng(ll: L.LatLngTuple): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      DN1_POSITION_LS_KEY,
      JSON.stringify({ lat: ll[0], lng: ll[1], updatedAt: Date.now() }),
    );
  } catch {
    /* quota / modo privado */
  }
}

const OFICINA_POSITION_LS_KEY = "sot-driver-map-oficina-latlng-v1";

function loadSavedOficinaLatLng(): L.LatLngTuple | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(OFICINA_POSITION_LS_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { lat?: unknown; lng?: unknown };
    const lat = Number(o.lat);
    const lng = Number(o.lng);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return null;
    }
    return [lat, lng];
  } catch {
    return null;
  }
}

function persistOficinaLatLng(ll: L.LatLngTuple): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      OFICINA_POSITION_LS_KEY,
      JSON.stringify({ lat: ll[0], lng: ll[1], updatedAt: Date.now() }),
    );
  } catch {
    /* quota / modo privado */
  }
}

/** HTML estático do ícone (cruz médica vermelha em SVG). */
const HOSPITAL_MARCILIO_DIAS_DIVICON_HTML = `
  <div class="sot-driver-hnmd-cross-wrap" title="Lins de Vasconcelos · HNMD">
    <svg class="sot-driver-hnmd-cross-svg" width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="11" y="4" width="6" height="20" fill="#dc2626" rx="1.5" />
      <rect x="4" y="11" width="20" height="6" fill="#dc2626" rx="1.5" />
    </svg>
  </div>
`;

/** Se alguma viatura estiver a menos disto (km) do HNMD, o mapa inclui a cruz no enquadramento. */
const KM_MAX_PARA_INCLUIR_HNMD_NO_ENQUADRAMENTO = 90;

function distanciaKmApprox(a: L.LatLngTuple, b: L.LatLngTuple): number {
  const dLat = (a[0] - b[0]) * 111;
  const dLng = (a[1] - b[1]) * 111 * Math.cos((a[0] * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/**
 * Posição inicial de «1° DN» quando não há `localStorage`
 * (equivalente ao antigo Fuel+cruz, mantendo o mapa parecido sem o ícone Fuel).
 */
const DEFAULT_DN1_OFFSET_FROM_CROSS_LAT = -0.0001;
const DEFAULT_DN1_OFFSET_FROM_CROSS_LNG = 0.0004;

function initialDn1LatLngForMap(crossInitial: L.LatLngTuple): L.LatLngTuple {
  const saved = loadSavedDn1LatLng();
  if (saved) return saved;
  return [
    crossInitial[0] + DEFAULT_DN1_OFFSET_FROM_CROSS_LAT,
    crossInitial[1] + DEFAULT_DN1_OFFSET_FROM_CROSS_LNG,
  ];
}

/** Posição inicial de «OFICINA» quando não há `localStorage` (~deslocado do «1° DN» inicial). */
const DEFAULT_OFICINA_OFFSET_FROM_DN1_LAT = -0.0001;
const DEFAULT_OFICINA_OFFSET_FROM_DN1_LNG = 0.00016;

function initialOficinaLatLngForMap(dn1Initial: L.LatLngTuple): L.LatLngTuple {
  const saved = loadSavedOficinaLatLng();
  if (saved) return saved;
  return [
    dn1Initial[0] + DEFAULT_OFICINA_OFFSET_FROM_DN1_LAT,
    dn1Initial[1] + DEFAULT_OFICINA_OFFSET_FROM_DN1_LNG,
  ];
}

const HOSPITAL_CROSS_STYLE_ID = "sot-driver-hnmd-cross-styles";

/**
 * Injeta animação e estilo do DivIcon — garante cruz visível mesmo se o CSS
 * do bundle falhar ou o leaflet sobrescrever classes.
 */
function ensureHospitalCrossStylesInDocument(): void {
  if (typeof document === "undefined") return;
  let el = document.getElementById(HOSPITAL_CROSS_STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = HOSPITAL_CROSS_STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = `
@keyframes sot-hnmd-cross-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0.2; } }
.leaflet-marker-icon.sot-driver-hnmd-cross-divicon {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}
.sot-driver-hnmd-cross-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.45));
  animation: sot-hnmd-cross-blink 1s step-end infinite;
}
.sot-driver-hnmd-cross-svg { display: block; }
.leaflet-marker-icon.sot-driver-1dn-divicon {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}
.sot-driver-1dn-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px 6px;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.35));
  animation: sot-hnmd-cross-blink 1s step-end infinite;
}
.sot-driver-1dn-label {
  color: #2563eb;
  font: 700 11px/1.1 system-ui, "Segoe UI", sans-serif;
  white-space: nowrap;
  letter-spacing: -0.02em;
}
.leaflet-marker-icon.sot-driver-oficina-divicon {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}
.sot-driver-oficina-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px 6px;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.35));
  animation: sot-hnmd-cross-blink 1s step-end infinite;
}
.sot-driver-oficina-label {
  color: #dc2626;
  font: 700 11px/1.1 system-ui, "Segoe UI", sans-serif;
  white-space: nowrap;
  letter-spacing: 0.02em;
}
@media (prefers-reduced-motion: reduce) {
  .sot-driver-hnmd-cross-wrap,
  .sot-driver-1dn-wrap,
  .sot-driver-oficina-wrap { animation: none !important; opacity: 1 !important; }
}`;
}

function buildHospitalMarcilioDiasDivIcon(): L.DivIcon {
  return L.divIcon({
    html: HOSPITAL_MARCILIO_DIAS_DIVICON_HTML,
    className: "sot-driver-hnmd-cross-divicon",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -12],
  });
}

const DN1_ICON_HTML = renderToStaticMarkup(
  <div className="sot-driver-1dn-wrap" title="1° DN">
    <span className="sot-driver-1dn-label">1° DN</span>
  </div>,
);

function buildDn1DivIcon(): L.DivIcon {
  return L.divIcon({
    html: DN1_ICON_HTML,
    className: "sot-driver-1dn-divicon",
    iconSize: [52, 22],
    iconAnchor: [26, 11],
    popupAnchor: [0, -10],
  });
}

const OFICINA_ICON_HTML = renderToStaticMarkup(
  <div className="sot-driver-oficina-wrap" title="Oficina">
    <span className="sot-driver-oficina-label">OFICINA</span>
  </div>,
);

function buildOficinaDivIcon(): L.DivIcon {
  return L.divIcon({
    html: OFICINA_ICON_HTML,
    className: "sot-driver-oficina-divicon",
    iconSize: [72, 22],
    iconAnchor: [36, 11],
    popupAnchor: [0, -10],
  });
}

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
  const { pins, error, loading, subscribed } = useDriverActiveLocations(canSync, snapshotRetryNonce);
  const { departures } = useDepartures();
  /** Mesmo conjunto de placas que o card «Saídas em Andamento» na página principal (hoje local). */
  const pinsVisiveis = useMemo(() => filterDriverLocationPinsPorSaidaIniciada(pins, departures), [pins, departures]);
  const lastUpdatePinsVisiveisMs = useMemo(() => {
    let maxTs = 0;
    for (const p of pinsVisiveis) {
      const t = p.lastUpdateAtMs;
      if (t !== null && t > maxTs) maxTs = t;
    }
    return maxTs > 0 ? maxTs : null;
  }, [pinsVisiveis]);
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
    pinsVisiveis.length === 0
      ? "nenhuma viatura com posição"
      : pinsVisiveis.length === 1
        ? "1 viatura em tempo real"
        : `${pinsVisiveis.length} viaturas em tempo real`;

  const uiValue: DriverLocationsMapUi | null = canSync
    ? {
        open: () => setOpen(true),
        pinsCount: pinsVisiveis.length,
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
                    {lastUpdatePinsVisiveisMs
                      ? `Última atualização Firebase: ${formatHmSs(lastUpdatePinsVisiveisMs)} · placa sempre visível junto ao marcador`
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
                {!loading && !error && pinsVisiveis.length === 0 ? (
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
            pins={pinsVisiveis}
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
  const linsCrossLatLngRef = useRef<L.LatLngTuple>(
    loadSavedLinsCrossLatLng() ?? DEFAULT_LINS_DE_VASCONCELOS_CRUZ_LATLNG,
  );
  const mapLandmarkSeedRef = useRef<{ dn1: L.LatLngTuple; oficina: L.LatLngTuple } | null>(null);
  if (mapLandmarkSeedRef.current === null) {
    const crossForDefaults = loadSavedLinsCrossLatLng() ?? DEFAULT_LINS_DE_VASCONCELOS_CRUZ_LATLNG;
    const dn1 = initialDn1LatLngForMap(crossForDefaults);
    mapLandmarkSeedRef.current = { dn1, oficina: initialOficinaLatLngForMap(dn1) };
  }
  const dn1LatLngRef = useRef<L.LatLngTuple>(mapLandmarkSeedRef.current.dn1);
  const oficinaLatLngRef = useRef<L.LatLngTuple>(mapLandmarkSeedRef.current.oficina);

  useEffect(() => {
    if (!visible) prevPinCountRef.current = null;
  }, [visible]);

  useLayoutEffect(() => {
    if (!visible || !containerRef.current) return;

    ensureHospitalCrossStylesInDocument();

    const el = containerRef.current;
    const crossPos = linsCrossLatLngRef.current;
    const map = L.map(el, { zoomControl: true }).setView(crossPos, 14);

    L.tileLayer(OSM_TILE, {
      maxZoom: 19,
      attribution: OSM_ATTRIB,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);

    const hospitalIcon = buildHospitalMarcilioDiasDivIcon();
    const hospitalMarker = L.marker(crossPos, {
      icon: hospitalIcon,
      zIndexOffset: 450,
      draggable: true,
      autoPan: true,
    }).addTo(map);
    hospitalMarker.bindPopup(
      '<strong>Lins de Vasconcelos</strong><br /><span style="font-size:11px">Hospital Naval Marcílio Dias (HNMD)</span><br /><span style="font-size:10px;opacity:.85">Arraste o ícone para fixar a cruz no mapa.</span>',
      {
        className: "sot-driver-map-popup",
      },
    );

    const dn1Pos = dn1LatLngRef.current;
    const dn1Icon = buildDn1DivIcon();
    const dn1Marker = L.marker(dn1Pos, {
      icon: dn1Icon,
      zIndexOffset: 445,
      draggable: true,
      autoPan: true,
    }).addTo(map);
    dn1Marker.bindPopup(
      '<strong>1° DN</strong><br /><span style="font-size:11px">Marcador independente — arraste para posicionar (guardado neste computador).</span>',
      { className: "sot-driver-map-popup" },
    );

    const oficinaPos = oficinaLatLngRef.current;
    const oficinaIcon = buildOficinaDivIcon();
    const oficinaMarker = L.marker(oficinaPos, {
      icon: oficinaIcon,
      zIndexOffset: 440,
      draggable: true,
      autoPan: true,
    }).addTo(map);
    oficinaMarker.bindPopup(
      '<strong>OFICINA</strong><br /><span style="font-size:11px">Marcador independente — arraste para posicionar (guardado neste computador).</span>',
      { className: "sot-driver-map-popup" },
    );

    hospitalMarker.on("dragend", () => {
      const ll = hospitalMarker.getLatLng();
      const tuple: L.LatLngTuple = [ll.lat, ll.lng];
      linsCrossLatLngRef.current = tuple;
      persistLinsCrossLatLng(tuple);
    });

    dn1Marker.on("dragend", () => {
      const ll = dn1Marker.getLatLng();
      const tuple: L.LatLngTuple = [ll.lat, ll.lng];
      dn1LatLngRef.current = tuple;
      persistDn1LatLng(tuple);
    });

    oficinaMarker.on("dragend", () => {
      const ll = oficinaMarker.getLatLng();
      const tuple: L.LatLngTuple = [ll.lat, ll.lng];
      oficinaLatLngRef.current = tuple;
      persistOficinaLatLng(tuple);
    });

    mapRef.current = map;
    layerRef.current = group;

    const kick = () => {
      map.invalidateSize();
      void map.getContainer().offsetHeight;
    };
    kick();
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      kick();
      inner = requestAnimationFrame(() => {
        kick();
      });
    });
    const t320 = window.setTimeout(kick, 320);
    const t600 = window.setTimeout(kick, 600);

    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
      window.clearTimeout(t320);
      window.clearTimeout(t600);
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
      const m = L.marker([p.lat, p.lng], { icon, riseOnHover: true, draggable: false });
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
    /** Abrir o modal ou mudar quantidade de viaturas → voltamos a enquadrar tudo (GPS só move marcadores). */
    const shouldResetView = prev === null || prev !== n;

    const crossPin = linsCrossLatLngRef.current;

    function applyFitBoundsForAllPins(): void {
      map.invalidateSize();
      void map.getContainer().offsetHeight;

      const algumPinoPertoDoHospital = pins.some(
        (p) => distanciaKmApprox([p.lat, p.lng], crossPin) <= KM_MAX_PARA_INCLUIR_HNMD_NO_ENQUADRAMENTO,
      );

      if (n >= 2) {
        try {
          const bounds = L.latLngBounds(pins.map((p) => [p.lat, p.lng] as L.LatLngTuple));
          if (algumPinoPertoDoHospital) {
            bounds.extend(crossPin);
            bounds.extend(dn1LatLngRef.current);
            bounds.extend(oficinaLatLngRef.current);
          }
          map.fitBounds(bounds, { padding: [64, 64], maxZoom: 15 });
        } catch {
          map.setView(linsCrossLatLngRef.current, 14);
        }
        return;
      }
      if (n === 1) {
        const p0 = pins[0];
        const v: L.LatLngTuple = [p0.lat, p0.lng];
        try {
          if (
            distanciaKmApprox(v, crossPin) <= KM_MAX_PARA_INCLUIR_HNMD_NO_ENQUADRAMENTO
          ) {
            const b = L.latLngBounds([v, crossPin, dn1LatLngRef.current, oficinaLatLngRef.current]);
            map.fitBounds(b, { padding: [56, 56], maxZoom: 16 });
          } else {
            map.fitBounds(L.latLngBounds(v, v), { padding: [72, 72], maxZoom: 15 });
          }
        } catch {
          map.setView(v, 14);
        }
        return;
      }
      map.setView(linsCrossLatLngRef.current, 14);
    }

    let refitTimer: ReturnType<typeof window.setTimeout> | undefined;
    if (shouldResetView) {
      applyFitBoundsForAllPins();
      /** Modal acaba de medir o painel — segundo enquadramento garante todas as viaturas visíveis. */
      refitTimer = window.setTimeout(() => applyFitBoundsForAllPins(), 450);
    }

    requestAnimationFrame(() => map.invalidateSize());

    return () => {
      if (refitTimer !== undefined) window.clearTimeout(refitTimer);
    };
  }, [visible, pins, vehicleTypeByPlaca, catalogHint, layerRef, mapRef]); // Adicionado layerRef e mapRef

  return null;
}
