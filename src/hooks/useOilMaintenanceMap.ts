import { useEffect, useState } from "react";
import { ensureFirebaseAuth } from "../lib/firebase/auth";
import { isFirebaseConfigured } from "../lib/firebase/config";
import { SOT_STATE_DOC, setSotStateDoc, subscribeSotStateDoc } from "../lib/firebase/sotStateFirestore";
import { idbGetJson, idbSetJson } from "../lib/indexedDb";
import { OIL_MAINTENANCE_STORAGE_KEY, type TrocaOleoRegistro } from "../lib/oilMaintenance";

type MapaOleo = Record<string, TrocaOleoRegistro>;

function normalizeMapaOleo(raw: unknown): MapaOleo {
  return raw && typeof raw === "object" ? (raw as MapaOleo) : {};
}

function isMapaOleoEmpty(m: MapaOleo): boolean {
  return Object.keys(m).length === 0;
}

/** Lê o mapa de trocas de óleo (somente leitura; painel Manutenções continua sendo a fonte de escrita). */
export function useOilMaintenanceMap() {
  const [mapa, setMapa] = useState<MapaOleo>({});

  useEffect(() => {
    let cancel = false;
    void idbGetJson<MapaOleo>(OIL_MAINTENANCE_STORAGE_KEY).then((raw) => {
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
                const local = await idbGetJson<unknown>(OIL_MAINTENANCE_STORAGE_KEY);
                const normalized = normalizeMapaOleo(local);
                if (!isMapaOleoEmpty(normalized)) {
                  await setSotStateDoc(SOT_STATE_DOC.oilMaintenance, normalized);
                }
                return;
              }
              const next = normalizeMapaOleo(payload);
              setMapa(next);
              void idbSetJson(OIL_MAINTENANCE_STORAGE_KEY, next);
            })();
          },
          (err) => console.error("[SOT] Firestore óleo (mapa):", err),
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
