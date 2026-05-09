import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Map as MapIcon, X } from "lucide-react";
import { useDriverActiveLocations } from "../hooks/useDriverActiveLocations";
import { isFirebaseConfigured } from "../lib/firebase/config";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

const OSM_TILE = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const BR_VIEW: L.LatLngExpression = [-14.2, -51.9];
const BR_ZOOM_EMPTY = 5;

function escapePopupHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/>/g, "&gt;");
}

type Props = {
  /** Só no layout desktop (não na vista mobile #/saidas). */
  enabled: boolean;
};

/**
 * Passo 4 — botão de mapa fixo (canto inferior esquerdo) e modal fullscreen com Leaflet + OSM.
 */
export function DesktopDriverLocationsMap({ enabled }: Props) {
  const [open, setOpen] = useState(false);
  const canSync = Boolean(enabled && isFirebaseConfigured());
  const { pins, error, loading } = useDriverActiveLocations(open && canSync);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  if (!canSync) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-4 left-4 z-[88] flex h-12 w-12 items-center justify-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--primary))] shadow-lg transition hover:bg-[hsl(var(--muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        )}
        aria-label="Abrir mapa de localização das viaturas"
        title="Mapa — localização das viaturas"
      >
        <MapIcon className="h-6 w-6" aria-hidden />
      </button>

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
                OpenStreetMap · toque no marcador para ver a placa
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
            {loading ? (
              <div className="pointer-events-none absolute left-4 top-4 z-[500] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))]/95 px-3 py-2 text-xs text-[hsl(var(--muted-foreground))] shadow">
                A sincronizar localizações…
              </div>
            ) : null}
            {error ? (
              <div className="pointer-events-none absolute left-4 top-14 z-[500] max-w-sm rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900 shadow dark:border-red-800 dark:bg-red-950/90 dark:text-red-100">
                {error}
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

    if (pins.length >= 2) {
      try {
        const bounds = L.latLngBounds(pins.map((p) => [p.lat, p.lng] as L.LatLngTuple));
        map.fitBounds(bounds, { padding: [56, 56], maxZoom: 15 });
      } catch {
        map.setView(BR_VIEW, BR_ZOOM_EMPTY);
      }
    } else if (pins.length === 1) {
      map.setView([pins[0].lat, pins[0].lng], 14);
    } else {
      map.setView(BR_VIEW, BR_ZOOM_EMPTY);
    }

    requestAnimationFrame(() => map.invalidateSize());
  }, [visible, pins]);

  return null;
}
