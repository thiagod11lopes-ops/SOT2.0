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
import { ensureFirebaseAuth } from "../lib/firebase/auth";
import { isFirebaseConfigured } from "../lib/firebase/config";
import { SOT_STATE_DOC, setSotStateDocWithRetry, subscribeSotStateDoc } from "../lib/firebase/sotStateFirestore";
import {
  mapaOficinaIgual,
  mergeMapaOficina,
  normalizarMapaOficinaCarregado,
  OFICINA_STORAGE_KEY,
  type MapaOficinaPorViatura,
  type RegistroOficina,
  viaturaEstaNaOficina,
} from "../lib/oficinaVisits";
import { idbGetJson, idbSetJson } from "../lib/indexedDb";
import { useSyncPreference } from "./sync-preference-context";

const SUPPRESS_REMOTE_MS = 5000;

type OficinaVisitasContextValue = {
  mapaOficina: MapaOficinaPorViatura;
  setVisitasParaPlaca: (placa: string, visitas: RegistroOficina[]) => void;
  /** True se existe registro com data de entrada e sem data de saída. */
  estaNaOficina: (placa: string) => boolean;
};

const OficinaVisitasContext = createContext<OficinaVisitasContextValue | null>(null);

function isMapaOficinaEmpty(m: MapaOficinaPorViatura): boolean {
  return Object.keys(m).length === 0;
}

export function OficinaVisitasProvider({ children }: { children: ReactNode }) {
  const [mapaOficina, setMapaOficina] = useState<MapaOficinaPorViatura>({});
  const mapaRef = useRef(mapaOficina);
  mapaRef.current = mapaOficina;

  const hidratado = useRef(false);
  const applyingRemoteRef = useRef(false);
  const suppressRemoteUntilRef = useRef(0);
  const { firebaseOnlyEnabled } = useSyncPreference();
  const useCloud = isFirebaseConfigured() && firebaseOnlyEnabled;

  const bumpLocalMutation = useCallback(() => {
    suppressRemoteUntilRef.current = Date.now() + SUPPRESS_REMOTE_MS;
  }, []);

  useEffect(() => {
    let cancel = false;
    void idbGetJson<unknown>(OFICINA_STORAGE_KEY).then((raw) => {
      if (cancel) return;
      setMapaOficina(normalizarMapaOficinaCarregado(raw));
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
    void (async () => {
      try {
        await ensureFirebaseAuth();
        if (cancelled) return;
        unsub = subscribeSotStateDoc(
          SOT_STATE_DOC.oficina,
          (payload) => {
            if (cancelled) return;
            void (async () => {
              if (payload === null) {
                // Firebase como fonte da verdade: não promover local->nuvem no bootstrap.
                return;
              }
              if (Date.now() < suppressRemoteUntilRef.current) {
                return;
              }
              const incoming = normalizarMapaOficinaCarregado(payload);
              const prev = mapaRef.current;

              if (isMapaOficinaEmpty(incoming) && !isMapaOficinaEmpty(prev)) {
                return;
              }

              applyingRemoteRef.current = true;
              const merged = mergeMapaOficina(prev, incoming);

              if (!mapaOficinaIgual(merged, incoming)) {
                queueMicrotask(() => {
                  void setSotStateDocWithRetry(SOT_STATE_DOC.oficina, merged).catch((e) => {
                    console.error("[SOT] Reconciliar oficina com a nuvem:", e);
                  });
                });
              }

              setMapaOficina(merged);
              void idbSetJson(OFICINA_STORAGE_KEY, merged, { maxAttempts: 6 });
            })();
          },
          (err) => console.error("[SOT] Firestore oficina:", err),
        );
      } catch (e) {
        console.error("[SOT] Firebase auth (oficina):", e);
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [useCloud]);

  useEffect(() => {
    if (!hidratado.current) return;
    void idbSetJson(OFICINA_STORAGE_KEY, mapaOficina, { maxAttempts: 6 });
  }, [mapaOficina]);

  useEffect(() => {
    const flush = () => {
      if (!hidratado.current) return;
      void idbSetJson(OFICINA_STORAGE_KEY, mapaRef.current, { maxAttempts: 6 });
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
      void setSotStateDocWithRetry(SOT_STATE_DOC.oficina, mapaOficina).catch((e) => {
        console.error("[SOT] Gravar oficina na nuvem:", e);
      });
    }, 120);
    return () => window.clearTimeout(t);
  }, [mapaOficina, useCloud]);

  const setVisitasParaPlaca = useCallback(
    (placa: string, visitas: RegistroOficina[]) => {
      bumpLocalMutation();
      setMapaOficina((prev) => ({ ...prev, [placa]: visitas }));
    },
    [bumpLocalMutation],
  );

  const estaNaOficina = useCallback(
    (placa: string) => {
      const t = placa.trim();
      if (!t) return false;
      const key = Object.keys(mapaOficina).find((k) => k.toLowerCase() === t.toLowerCase());
      if (!key) return false;
      return viaturaEstaNaOficina(mapaOficina[key]);
    },
    [mapaOficina],
  );

  const value = useMemo(
    () => ({ mapaOficina, setVisitasParaPlaca, estaNaOficina }),
    [mapaOficina, setVisitasParaPlaca, estaNaOficina],
  );

  return (
    <OficinaVisitasContext.Provider value={value}>{children}</OficinaVisitasContext.Provider>
  );
}

export function useOficinaVisitas() {
  const ctx = useContext(OficinaVisitasContext);
  if (!ctx) {
    throw new Error("useOficinaVisitas deve ser usado dentro de OficinaVisitasProvider");
  }
  return ctx;
}
