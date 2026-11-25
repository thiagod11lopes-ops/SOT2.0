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
import {
  SOT_STATE_DOC,
  setSotStateDocWithRetry,
  subscribeSotStateDoc,
  writeMergedSotStateDocWithRetry,
} from "../lib/firebase/sotStateFirestore";
import { idbGetJson, idbSetJson } from "../lib/indexedDb";
import type { DepartureRecord } from "../types/departure";
import {
  getRegistroTrocaOleo,
  maiorKmChegadaPorViatura,
  mapaTrocaOleoIgual,
  mergeMapaTrocaOleo,
  normalizeMapaOleo,
  OIL_MAINTENANCE_STORAGE_KEY,
  registroTrocaOleoSugeridoDoKmAtual,
  viaturasCatalogoUnicas,
  type TrocaOleoRegistro,
} from "../lib/oilMaintenance";

type MapaOleo = Record<string, TrocaOleoRegistro>;

function isMapaOleoEmpty(m: MapaOleo): boolean {
  return Object.keys(m).length === 0;
}

/** Em «Nuvem ativa» o IDB bloqueia leituras/escritas sem esta flag — o óleo precisa
 *  de espelho local para não ficar só na nuvem (e poder promover se o doc zerar). */
const OIL_IDB_OPTS = { allowWhenFirebaseOnlyOnline: true as const, maxAttempts: 6 };

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
  /** Grava registo na tabela + IndexedDB + Firestore de imediato (não depende do efeito). */
  saveRegistroTrocaOleo: (placa: string, km: number, dataIso: string) => void;
  /**
   * Para cada viatura sem registo e com KM atual, grava o mesmo padrão do modal
   * (KM atual + hoje → próxima +10.000 km / +6 meses) e actualiza a tabela.
   */
  preencherTrocasComKmAtual: () => number;
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

  const persistMapaOleoNow = useCallback(
    (next: MapaOleo) => {
      hidratado.current = true;
      mapaRef.current = next;
      void idbSetJson(OIL_MAINTENANCE_STORAGE_KEY, next, OIL_IDB_OPTS);
      if (!useCloud || isMapaOleoEmpty(next)) return;
      applyingRemoteRef.current = false;
      suppressRemoteUntilRef.current = Date.now() + SUPPRESS_REMOTE_MS;
      // Merge com o servidor — evita que um mapa local incompleto apague outras placas.
      void writeMergedSotStateDocWithRetry(
        SOT_STATE_DOC.oilMaintenance,
        {},
        next,
        (_base, server, local) =>
          mergeMapaTrocaOleo(normalizeMapaOleo(local), normalizeMapaOleo(server)),
      )
        .then((mergedRaw) => {
          const merged = normalizeMapaOleo(mergedRaw);
          mapaRef.current = merged;
          void idbSetJson(OIL_MAINTENANCE_STORAGE_KEY, merged, OIL_IDB_OPTS);
          if (!mapaTrocaOleoIgual(merged, next)) {
            applyingRemoteRef.current = true;
            setMapa(merged);
          }
        })
        .catch((e) => {
          console.error("[SOT] Gravar troca de óleo na nuvem (merge):", e);
          // Fallback: escrita directa do mapa local.
          void setSotStateDocWithRetry(SOT_STATE_DOC.oilMaintenance, next).catch((err) => {
            console.error("[SOT] Gravar troca de óleo na nuvem (fallback):", err);
          });
        });
    },
    [useCloud],
  );

  const saveRegistroTrocaOleo = useCallback(
    (placa: string, km: number, dataIso: string) => {
      const placaTrim = placa.trim();
      if (!placaTrim) return;
      bumpLocalOleoMutation();
      setMapa((prev) => {
        const existingKey =
          Object.keys(prev).find((k) => k.trim().toLowerCase() === placaTrim.toLowerCase()) ?? placaTrim;
        const next: MapaOleo = { ...prev };
        for (const k of Object.keys(next)) {
          if (k !== existingKey && k.trim().toLowerCase() === existingKey.trim().toLowerCase()) {
            delete next[k];
          }
        }
        next[existingKey] = { ultimaTrocaKm: km, ultimaTrocaData: dataIso };
        persistMapaOleoNow(next);
        return next;
      });
    },
    [bumpLocalOleoMutation, persistMapaOleoNow],
  );

  const placas = useMemo(
    () => viaturasCatalogoUnicas(items.viaturasAdministrativas, items.ambulancias),
    [items.viaturasAdministrativas, items.ambulancias],
  );

  const preencherTrocasComKmAtual = useCallback(() => {
    bumpLocalOleoMutation();
    const prev = mapaRef.current;
    const next: MapaOleo = { ...prev };
    let gravados = 0;
    for (const placa of placas) {
      if (getRegistroTrocaOleo(next, placa)) continue;
      const km = maiorKmChegadaPorViatura(departures, placa);
      const sug = registroTrocaOleoSugeridoDoKmAtual(km);
      if (!sug) continue;
      next[placa] = sug;
      gravados += 1;
    }
    if (gravados > 0) {
      setMapa(next);
      persistMapaOleoNow(next);
    }
    return gravados;
  }, [bumpLocalOleoMutation, placas, departures, persistMapaOleoNow]);

  // Sempre hidrata IndexedDB primeiro (também em modo nuvem). Sem isto, um
  // snapshot vazio do Firestore apaga a UI e pode sobrescrever o IDB local.
  useEffect(() => {
    let cancel = false;
    void idbGetJson<unknown>(OIL_MAINTENANCE_STORAGE_KEY, OIL_IDB_OPTS).then((raw) => {
      if (cancel) return;
      const normalized = normalizeMapaOleo(raw);
      if (!isMapaOleoEmpty(normalized)) {
        setMapa((prev) => {
          if (isMapaOleoEmpty(prev)) return normalized;
          return mergeMapaTrocaOleo(normalized, prev);
        });
      }
      hidratado.current = true;
    });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!useCloud) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    const promoteLocalIfRemoteEmpty = async (incoming: MapaOleo) => {
      const localRaw = await idbGetJson<unknown>(OIL_MAINTENANCE_STORAGE_KEY, OIL_IDB_OPTS);
      const local = normalizeMapaOleo(localRaw);
      const prev = mapaRef.current;
      const seed = !isMapaOleoEmpty(prev) ? prev : local;
      if (isMapaOleoEmpty(incoming) && !isMapaOleoEmpty(seed)) {
        await setSotStateDocWithRetry(SOT_STATE_DOC.oilMaintenance, seed).catch((e) => {
          console.error("[SOT] Promover troca de óleo local → nuvem (remoto vazio):", e);
        });
        applyingRemoteRef.current = true;
        setMapa(seed);
        hidratado.current = true;
        void idbSetJson(OIL_MAINTENANCE_STORAGE_KEY, seed, OIL_IDB_OPTS);
        return true;
      }
      return false;
    };

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
                const localRaw = await idbGetJson<unknown>(OIL_MAINTENANCE_STORAGE_KEY, OIL_IDB_OPTS);
                const normalized = normalizeMapaOleo(localRaw);
                const seed = !isMapaOleoEmpty(mapaRef.current) ? mapaRef.current : normalized;
                if (!isMapaOleoEmpty(seed)) {
                  await setSotStateDocWithRetry(SOT_STATE_DOC.oilMaintenance, seed).catch((e) => {
                    console.error("[SOT] Promover troca de óleo local → nuvem (doc ausente):", e);
                  });
                }
                applyingRemoteRef.current = true;
                setMapa(seed);
                hidratado.current = true;
                void idbSetJson(OIL_MAINTENANCE_STORAGE_KEY, seed, OIL_IDB_OPTS);
                return;
              }
              if (Date.now() < suppressRemoteUntilRef.current) {
                return;
              }
              const incoming = normalizeMapaOleo(payload);
              if (await promoteLocalIfRemoteEmpty(incoming)) {
                return;
              }

              const prev = mapaRef.current;
              applyingRemoteRef.current = true;
              const merged = mergeMapaTrocaOleo(prev, incoming);

              if (!mapaTrocaOleoIgual(merged, incoming) && !isMapaOleoEmpty(merged)) {
                // Snapshot remoto incompleto vs. local — reenvia o merge.
                void setSotStateDocWithRetry(SOT_STATE_DOC.oilMaintenance, merged).catch((e) => {
                  console.error("[SOT] Reconciliar troca de óleo (merge → nuvem):", e);
                });
              }

              setMapa(merged);
              hidratado.current = true;
              void idbSetJson(OIL_MAINTENANCE_STORAGE_KEY, merged, OIL_IDB_OPTS);
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
    void idbSetJson(OIL_MAINTENANCE_STORAGE_KEY, mapa, OIL_IDB_OPTS);
  }, [mapa]);

  useEffect(() => {
    const flush = () => {
      if (!hidratado.current) return;
      void idbSetJson(OIL_MAINTENANCE_STORAGE_KEY, mapaRef.current, OIL_IDB_OPTS);
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
    // Não publicar mapa vazio para a nuvem (evita apagar dados remotos por corrida de hidratação).
    if (isMapaOleoEmpty(mapa)) return;
    // Se ainda estamos na janela de suppress após save local, o persistMapaOleoNow
    // já enviou — evita corrida que publique um mapa intermédio.
    if (Date.now() < suppressRemoteUntilRef.current) return;
    const t = window.setTimeout(() => {
      void setSotStateDocWithRetry(SOT_STATE_DOC.oilMaintenance, mapa).catch((e) => {
        console.error("[SOT] Gravar troca de óleo na nuvem:", e);
      });
    }, 120);
    return () => window.clearTimeout(t);
  }, [mapa, useCloud]);

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
      saveRegistroTrocaOleo,
      preencherTrocasComKmAtual,
    }),
    [
      mapa,
      departures,
      placas,
      trocaOleoPlaca,
      kmSugeridoTrocaOleo,
      bumpLocalOleoMutation,
      saveRegistroTrocaOleo,
      preencherTrocasComKmAtual,
    ],
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

/** Registo de uma placa (case-insensitive). */
export function useRegistroTrocaOleo(placa: string | null | undefined): TrocaOleoRegistro | undefined {
  const { mapa } = useVehicleMaintenance();
  if (!placa) return undefined;
  return getRegistroTrocaOleo(mapa, placa);
}
