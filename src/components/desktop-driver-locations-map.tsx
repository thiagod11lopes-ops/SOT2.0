import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Map as MapIcon, X } from "lucide-react";
import { useDriverActiveLocations } from "../hooks/useDriverActiveLocations";
import { isFirebaseConfigured } from "../lib/firebase/config";
import { Button } from "./ui/button";

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
                      ? `Última atualização Firebase: ${formatHmSs(lastUpdateAtMs)} · toque no marcador para ver a placa`
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
          />
        </>
      ) : null}
    </DriverLocationsMapUiContext.Provider>
  );
}

/** Botão no cabeçalho (entre o pão e o RDV). Só renderiza dentro de `DesktopDriverLocationsMapProvider` com Firebase ativo. */
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

function MapLeafletHost({
  visible,
  containerRef,
  mapRef,
  layerRef,
  pins,
}: {
  visible: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  mapRef: React.RefObject<L.Map | null>;
  layerRef: React.RefObject<L.LayerGroup | null>;
  pins: { placa: string; lat: number; lng: number }[];
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

    const markerOpts: L.CircleMarkerOptions = {
      radius: 10,
      color: "#1d4ed8",
      weight: 2,
      fillColor: "#3b82f6",
      fillOpacity: 0.85,
    };

    for (const p of pins) {
      const m = L.circleMarker([p.lat, p.lng], markerOpts);
      const label = escapePopupHtml(p.placa);
      m.bindPopup(`<strong>${label}</strong>`, { className: "sot-driver-map-popup" });
      m.bindTooltip(p.placa, { sticky: true, direction: "top", className: "sot-driver-map-placa-tooltip" });
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
  }, [visible, pins]);

  return null;
}
