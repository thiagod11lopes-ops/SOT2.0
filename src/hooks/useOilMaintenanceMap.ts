import { useEffect, useRef, useState } from "react";
import { ensureFirebaseAuth } from "../lib/firebase/auth";
import { isFirebaseConfigured } from "../lib/firebase/config";
import { SOT_STATE_DOC, setSotStateDocWithRetry, subscribeSotStateDoc } from "../lib/firebase/sotStateFirestore";
import { idbGetJson, idbSetJson } from "../lib/indexedDb";
import {
  mapaTrocaOleoIgual,
  mergeMapaTrocaOleo,
  normalizeMapaOleo,
  OIL_MAINTENANCE_STORAGE_KEY,
  type TrocaOleoRegistro,
} from "../lib/oilMaintenance";

type MapaOleo = Record<string, TrocaOleoRegistro>;

function isMapaOleoEmpty(m: MapaOleo): boolean {
  return Object.keys(m).length === 0;
}

const OIL_IDB_OPTS = { allowWhenFirebaseOnlyOnline: true as const, maxAttempts: 6 };

/** Lê o mapa de trocas de óleo (somente leitura; painel Manutenções continua sendo a fonte de escrita). */
export function useOilMaintenanceMap() {
  const [mapa, setMapa] = useState<MapaOleo>({});
  const mapaRef = useRef(mapa);
  mapaRef.current = mapa;

  useEffect(() => {
    let cancel = false;
    void idbGetJson<unknown>(OIL_MAINTENANCE_STORAGE_KEY, OIL_IDB_OPTS).then((raw) => {
      if (cancel) return;
      setMapa(normalizeMapaOleo(raw));
    });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
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
                const local = await idbGetJson<unknown>(OIL_MAINTENANCE_STORAGE_KEY, OIL_IDB_OPTS);
                const normalized = normalizeMapaOleo(local);
                if (!isMapaOleoEmpty(normalized)) {
                  await setSotStateDocWithRetry(SOT_STATE_DOC.oilMaintenance, normalized);
                }
                return;
              }
              const incoming = normalizeMapaOleo(payload);
              const prev = mapaRef.current;

              if (isMapaOleoEmpty(incoming) && !isMapaOleoEmpty(prev)) {
                queueMicrotask(() => {
                  void setSotStateDocWithRetry(SOT_STATE_DOC.oilMaintenance, prev).catch((e) => {
                    console.error("[SOT] Enviar mapa óleo (hook, nuvem vazia):", e);
                  });
                });
                return;
              }

              const merged = mergeMapaTrocaOleo(prev, incoming);

              if (!mapaTrocaOleoIgual(merged, incoming) && !isMapaOleoEmpty(merged)) {
                queueMicrotask(() => {
                  void setSotStateDocWithRetry(SOT_STATE_DOC.oilMaintenance, merged).catch((e) => {
                    console.error("[SOT] Reconciliar mapa óleo (hook):", e);
                  });
                });
              }

              setMapa(merged);
              void idbSetJson(OIL_MAINTENANCE_STORAGE_KEY, merged, OIL_IDB_OPTS);
            })();
          },
          (err) => console.error("[SOT] Firestore óleo (mapa):", err),
          { ignoreCachedSnapshotWhenOnline: true },
        );
      } catch (e) {
        console.error("[SOT] Firebase auth (óleo mapa):", e);
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  return mapa;
}
