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
  mergeMapaOficinaProfundo,
  normalizarMapaOficinaCarregado,
  OFICINA_STORAGE_KEY,
  type MapaOficinaPorViatura,
  type RegistroOficina,
  viaturaEstaNaOficina,
} from "../lib/oficinaVisits";
import { idbGetJson, idbSetJson } from "../lib/indexedDb";
import { useSyncPreference } from "./sync-preference-context";

/**
 * Ignorar snapshots do listener logo após edição local ou gravação na nuvem.
 * Com Firestore online, snapshots (cache ou servidor) podem chegar atrasados em relação ao `setDoc`;
 * janelas curtas faziam o merge reaplicar um estado antigo e “apagar” data de saída no mapa da oficina.
 */
const SUPPRESS_REMOTE_MS = 60_000;
/** Após gravar o doc com sucesso, prolonga o bloqueio para evitar eco/corrida servidor ↔ cliente. */
const POST_WRITE_SUPPRESS_EXTRA_MS = 25_000;

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
  const suppressRemoteUntilRef = useRef(0);
  /** Evita reenviar o mesmo JSON ao Firestore em loop (snapshot → estado → escrita). */
  const lastCloudOficinaJsonRef = useRef<string | null>(null);
  const { firebaseOnlyEnabled } = useSyncPreference();
  const useCloud = isFirebaseConfigured() && firebaseOnlyEnabled;

  const bumpLocalMutation = useCallback(() => {
    suppressRemoteUntilRef.current = Date.now() + SUPPRESS_REMOTE_MS;
  }, []);

  useEffect(() => {
    if (useCloud) {
      // Modo estrito Firebase: ignora hidratação inicial por cache local.
      return;
    }
    let cancel = false;
    void idbGetJson<unknown>(OFICINA_STORAGE_KEY).then((raw) => {
      if (cancel) return;
      setMapaOficina(normalizarMapaOficinaCarregado(raw));
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
          SOT_STATE_DOC.oficina,
          (payload) => {
            if (cancelled) return;
            void (async () => {
              if (payload === null) {
                const localRaw = await idbGetJson<unknown>(OFICINA_STORAGE_KEY);
                const normalized = normalizarMapaOficinaCarregado(localRaw);
                if (!isMapaOficinaEmpty(normalized)) {
                  await setSotStateDocWithRetry(SOT_STATE_DOC.oficina, normalized).catch((e) => {
                    console.error("[SOT] Promover oficina local → nuvem (doc ausente):", e);
                  });
                }
                setMapaOficina(normalized);
                hidratado.current = true;
                void idbSetJson(OFICINA_STORAGE_KEY, normalized, { maxAttempts: 6 });
                return;
              }
              if (Date.now() < suppressRemoteUntilRef.current) {
                return;
              }
              const incoming = normalizarMapaOficinaCarregado(payload);

              setMapaOficina((prev) => {
                if (isMapaOficinaEmpty(incoming) && !isMapaOficinaEmpty(prev)) {
                  return prev;
                }
                const merged = mergeMapaOficinaProfundo(prev, incoming);
                if (mapaOficinaIgual(prev, merged)) {
                  if (!mapaOficinaIgual(incoming, prev)) {
                    queueMicrotask(() => {
                      void setSotStateDocWithRetry(SOT_STATE_DOC.oficina, prev)
                        .then(() => {
                          try {
                            lastCloudOficinaJsonRef.current = JSON.stringify(prev);
                          } catch {
                            /* ignore */
                          }
                        })
                        .catch((e) => {
                          console.error("[SOT] Sincronizar oficina (local mais recente que snapshot):", e);
                        });
                    });
                  }
                  return prev;
                }
                return merged;
              });
              hidratado.current = true;
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
    const t = window.setTimeout(() => {
      let json: string;
      try {
        json = JSON.stringify(mapaOficina);
      } catch {
        return;
      }
      if (lastCloudOficinaJsonRef.current === json) return;
      lastCloudOficinaJsonRef.current = json;
      void setSotStateDocWithRetry(SOT_STATE_DOC.oficina, mapaOficina)
        .then(() => {
          suppressRemoteUntilRef.current = Math.max(
            suppressRemoteUntilRef.current,
            Date.now() + POST_WRITE_SUPPRESS_EXTRA_MS,
          );
        })
        .catch((e) => {
          console.error("[SOT] Gravar oficina na nuvem:", e);
          lastCloudOficinaJsonRef.current = null;
        });
    }, 400);
    return () => window.clearTimeout(t);
  }, [mapaOficina, useCloud]);

  const setVisitasParaPlaca = useCallback(
    (placa: string, visitas: RegistroOficina[]) => {
      bumpLocalMutation();
      hidratado.current = true;
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
