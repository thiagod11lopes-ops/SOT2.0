import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useCatalogItems } from "./catalog-items-context";
import { useDepartures } from "./departures-context";
import { useSyncPreference } from "./sync-preference-context";
import { ensureFirebaseAuth } from "../lib/firebase/auth";
import { isFirebaseConfigured } from "../lib/firebase/config";
import { SOT_STATE_DOC, setSotStateDocWithRetry, subscribeSotStateDoc } from "../lib/firebase/sotStateFirestore";
import { idbGetJson, idbSetJson } from "../lib/indexedDb";
import type { DepartureRecord } from "../types/departure";
import {
  maiorKmChegadaPorViatura,
  mapaTrocaOleoIgual,
  mergeMapaTrocaOleo,
  OIL_MAINTENANCE_STORAGE_KEY,
  viaturasCatalogoUnicas,
  type TrocaOleoRegistro,
} from "../lib/oilMaintenance";

type MapaOleo = Record<string, TrocaOleoRegistro>;

function normalizeMapaOleo(raw: unknown): MapaOleo {
  return raw && typeof raw === "object" ? (raw as MapaOleo) : {};
}

function isMapaOleoEmpty(m: MapaOleo): boolean {
  return Object.keys(m).length === 0;
}

const SUPPRESS_REMOTE_MS = 5000;

export type VehicleMaintenanceContextValue = {
  mapa: MapaOleo;
  setMapa: React.Dispatch<React.SetStateAction<MapaOleo>>;
  departures: DepartureRecord[];
  placas: string[];
  trocaOleoPlaca: string | null;
  setTrocaOleoPlaca: (p: string | null) => void;
  kmSugeridoTrocaOleo: number | null;
  bumpLocalOleoMutation: () => void;
};

const VehicleMaintenanceContext = createContext<VehicleMaintenanceContextValue | null>(null);

function useVehicleMaintenanceState(): VehicleMaintenanceContextValue {
  const { items } = useCatalogItems();
  const { departures } = useDepartures();
  const [mapa, setMapa] = useState<MapaOleo>({});
  const [trocaOleoPlaca, setTrocaOleoPlaca] = useState<string | null>(null);
  const hidratado = useRef(false);
  const applyingRemoteRef = useRef(false);
  const suppressRemoteUntilRef = useRef(0);
  const mapaRef = useRef<MapaOleo>({});
  mapaRef.current = mapa;
  const { firebaseOnlyEnabled } = useSyncPreference();
  const useCloud = isFirebaseConfigured() && firebaseOnlyEnabled;

  const bumpLocalOleoMutation = useCallback(() => {
    suppressRemoteUntilRef.current = Date.now() + SUPPRESS_REMOTE_MS;
    hidratado.current = true;
  }, []);

  useEffect(() => {
    if (useCloud) {
      return;
    }
    let cancel = false;
    void idbGetJson<MapaOleo>(OIL_MAINTENANCE_STORAGE_KEY).then((raw) => {
      if (cancel) return;
      setMapa(normalizeMapaOleo(raw));
      hidratado.current = true;
    });
    return () => {
      cancel = true;
    };
  }, [useCloud]);

  useEffect(() => {
    if (!useCloud) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    void (async () => {
      try {
        await ensureFirebaseAuth();
        if (cancelled) return;
        unsub = subscribeSotStateDoc(
          SOT_STATE_DOC.oilMaintenance,
          (payload) => {
            if (cancelled) return;
            void (async () => {
              if (payload === null) {
                const localRaw = await idbGetJson<unknown>(OIL_MAINTENANCE_STORAGE_KEY);
                const normalized = normalizeMapaOleo(localRaw);
                if (!isMapaOleoEmpty(normalized)) {
                  await setSotStateDocWithRetry(SOT_STATE_DOC.oilMaintenance, normalized).catch((e) => {
                    console.error("[SOT] Promover troca de óleo local → nuvem (doc ausente):", e);
                  });
                }
                setMapa(normalized);
                hidratado.current = true;
                void idbSetJson(OIL_MAINTENANCE_STORAGE_KEY, normalized, { maxAttempts: 6 });
                return;
              }
              if (Date.now() < suppressRemoteUntilRef.current) {
                return;
              }
              const incoming = normalizeMapaOleo(payload);
              const prev = mapaRef.current;

              if (isMapaOleoEmpty(incoming) && !isMapaOleoEmpty(prev)) {
                return;
              }

              applyingRemoteRef.current = true;
              const merged = mergeMapaTrocaOleo(prev, incoming);

              if (!mapaTrocaOleoIgual(merged, incoming)) {
                // merge divergiu do snapshot; mantém merged
              }

              setMapa(merged);
              hidratado.current = true;
              void idbSetJson(OIL_MAINTENANCE_STORAGE_KEY, merged, { maxAttempts: 6 });
            })();
          },
          (err) => console.error("[SOT] Firestore troca de óleo:", err),
          { ignoreCachedSnapshotWhenOnline: true },
        );
      } catch (e) {
        console.error("[SOT] Firebase auth (óleo):", e);
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [useCloud]);

  useEffect(() => {
    if (!hidratado.current) return;
    void idbSetJson(OIL_MAINTENANCE_STORAGE_KEY, mapa, { maxAttempts: 6 });
  }, [mapa]);

  useEffect(() => {
    const flush = () => {
      if (!hidratado.current) return;
      void idbSetJson(OIL_MAINTENANCE_STORAGE_KEY, mapaRef.current, { maxAttempts: 6 });
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    if (!hidratado.current || !useCloud) return;
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      void setSotStateDocWithRetry(SOT_STATE_DOC.oilMaintenance, mapa).catch((e) => {
        console.error("[SOT] Gravar troca de óleo na nuvem:", e);
      });
    }, 120);
    return () => window.clearTimeout(t);
  }, [mapa, useCloud]);

  const placas = useMemo(
    () => viaturasCatalogoUnicas(items.viaturasAdministrativas, items.ambulancias),
    [items.viaturasAdministrativas, items.ambulancias],
  );

  const kmSugeridoTrocaOleo =
    trocaOleoPlaca !== null ? maiorKmChegadaPorViatura(departures, trocaOleoPlaca) : null;

  return useMemo(
    () => ({
      mapa,
      setMapa,
      departures,
      placas,
      trocaOleoPlaca,
      setTrocaOleoPlaca,
      kmSugeridoTrocaOleo,
      bumpLocalOleoMutation,
    }),
    [mapa, departures, placas, trocaOleoPlaca, kmSugeridoTrocaOleo, bumpLocalOleoMutation],
  );
}

export function VehicleMaintenanceProvider({ children }: { children: ReactNode }) {
  const value = useVehicleMaintenanceState();
  return <VehicleMaintenanceContext.Provider value={value}>{children}</VehicleMaintenanceContext.Provider>;
}

export function useVehicleMaintenance(): VehicleMaintenanceContextValue {
  const ctx = useContext(VehicleMaintenanceContext);
  if (!ctx) {
    throw new Error("useVehicleMaintenance deve ser usado dentro de VehicleMaintenanceProvider.");
  }
  return ctx;
}

/** Mapa de trocas de óleo (mesma fonte que a aba Manutenções / modal da home). */
export function useMapaOleoFromMaintenance(): MapaOleo {
  return useVehicleMaintenance().mapa;
}
