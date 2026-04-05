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
import { SOT_STATE_DOC, setSotStateDoc, subscribeSotStateDoc } from "../lib/firebase/sotStateFirestore";
import {
  normalizarMapaOficinaCarregado,
  OFICINA_STORAGE_KEY,
  type MapaOficinaPorViatura,
  type RegistroOficina,
  viaturaEstaNaOficina,
} from "../lib/oficinaVisits";
import { idbGetJson, idbSetJson } from "../lib/indexedDb";

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
  const hidratado = useRef(false);
  const applyingRemoteRef = useRef(false);
  const useCloud = isFirebaseConfigured();

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
                const local = await idbGetJson<unknown>(OFICINA_STORAGE_KEY);
                const normalized = normalizarMapaOficinaCarregado(local);
                if (!isMapaOficinaEmpty(normalized)) {
                  await setSotStateDoc(SOT_STATE_DOC.oficina, normalized);
                }
                return;
              }
              applyingRemoteRef.current = true;
              const next = normalizarMapaOficinaCarregado(payload);
              setMapaOficina(next);
              hidratado.current = true;
              void idbSetJson(OFICINA_STORAGE_KEY, next);
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
    void idbSetJson(OFICINA_STORAGE_KEY, mapaOficina);
  }, [mapaOficina]);

  useEffect(() => {
    if (!hidratado.current || !useCloud) return;
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }
    void setSotStateDoc(SOT_STATE_DOC.oficina, mapaOficina).catch((e) => {
      console.error("[SOT] Gravar oficina na nuvem:", e);
    });
  }, [mapaOficina, useCloud]);

  const setVisitasParaPlaca = useCallback((placa: string, visitas: RegistroOficina[]) => {
    setMapaOficina((prev) => ({ ...prev, [placa]: visitas }));
  }, []);

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
