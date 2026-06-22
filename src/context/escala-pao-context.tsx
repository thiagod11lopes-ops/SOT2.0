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
  type EscalaPaoStored,
  getMotoristaEscalaParaData,
  loadEscalaPaoFromIdb,
  saveEscalaPaoToIdb,
} from "../lib/escalaPaoStorage";
import {
  dedupeIntegrantesOrder,
  loadIntegrantesPaoFromIdb,
  saveIntegrantesPaoToIdb,
} from "../lib/integrantesPaoStorage";
import { useSyncPreference } from "./sync-preference-context";

function normalizeEscalaPaoBundle(raw: unknown): { escala: EscalaPaoStored; integrantes: string[] } {
  if (!raw || typeof raw !== "object") {
    return { escala: {}, integrantes: [] };
  }
  const o = raw as Record<string, unknown>;
  const escalaRaw = o.escala;
  const escala: EscalaPaoStored =
    escalaRaw && typeof escalaRaw === "object" && !Array.isArray(escalaRaw)
      ? { ...(escalaRaw as EscalaPaoStored) }
      : {};
  const integrantes = Array.isArray(o.integrantes)
    ? dedupeIntegrantesOrder(o.integrantes.filter((x): x is string => typeof x === "string"))
    : [];
  return { escala, integrantes };
}

function isEscalaBundleEmpty(e: EscalaPaoStored, integrantes: string[]): boolean {
  return Object.keys(e).length === 0 && integrantes.length === 0;
}

async function saveBundleToIdb(escala: EscalaPaoStored, integrantes: string[]): Promise<void> {
  await saveEscalaPaoToIdb(escala);
  await saveIntegrantesPaoToIdb(integrantes);
}

type CloudSyncStatus = "idle" | "syncing" | "synced" | "error";

type EscalaPaoContextValue = {
  escala: EscalaPaoStored;
  integrantes: string[];
  setIntegrantes: (next: string[]) => void;
  motoristaParaData: (date: Date) => string;
  setMotoristaNaData: (dateKey: string, nome: string) => void;
  setEscalaCompleta: (next: EscalaPaoStored) => void;
  initialLoadComplete: boolean;
  cloudSyncStatus: CloudSyncStatus;
  setRemoteSyncPaused: (paused: boolean) => void;
  flushCloudWrite: () => Promise<void>;
};

const EscalaPaoContext = createContext<EscalaPaoContextValue | null>(null);

export function EscalaPaoProvider({ children }: { children: ReactNode }) {
  const { firebaseOnlyEnabled } = useSyncPreference();
  const useCloud = isFirebaseConfigured() && firebaseOnlyEnabled;

  const [escala, setEscala] = useState<EscalaPaoStored>({});
  const [integrantes, setIntegrantesState] = useState<string[]>([]);
  const [initialLoadComplete, setInitialLoadComplete] = useState(!useCloud);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>(useCloud ? "idle" : "synced");

  const applyingRemoteRef = useRef(false);
  const remoteSyncPausedRef = useRef(false);
  const hydratedRef = useRef(!useCloud);
  const localPromotionAttemptedRef = useRef(false);
  const cloudWriteInFlightRef = useRef(false);
  const pendingCloudBundleRef = useRef<{ escala: EscalaPaoStored; integrantes: string[] } | null>(null);
  const escalaRef = useRef(escala);
  const integrantesRef = useRef(integrantes);
  escalaRef.current = escala;
  integrantesRef.current = integrantes;

  const setRemoteSyncPaused = useCallback((paused: boolean) => {
    remoteSyncPausedRef.current = paused;
  }, []);

  const pushBundleToCloud = useCallback(
    async (nextEscala: EscalaPaoStored, nextIntegrantes: string[]) => {
      if (!useCloud || !hydratedRef.current) return;
      pendingCloudBundleRef.current = { escala: nextEscala, integrantes: nextIntegrantes };
      if (cloudWriteInFlightRef.current) return;
      cloudWriteInFlightRef.current = true;
      try {
        while (pendingCloudBundleRef.current) {
          const toSend = pendingCloudBundleRef.current;
          pendingCloudBundleRef.current = null;
          setCloudSyncStatus("syncing");
          try {
            await setSotStateDocWithRetry(SOT_STATE_DOC.escalaPaoBundle, {
              escala: toSend.escala,
              integrantes: toSend.integrantes,
            });
            await saveBundleToIdb(toSend.escala, toSend.integrantes);
            setCloudSyncStatus("synced");
          } catch (e) {
            setCloudSyncStatus("error");
            console.error("[SOT] Gravar escala pão na nuvem:", e);
          }
        }
      } finally {
        cloudWriteInFlightRef.current = false;
      }
    },
    [useCloud],
  );

  const flushCloudWrite = useCallback(async () => {
    if (!useCloud) return;
    await pushBundleToCloud(escalaRef.current, integrantesRef.current);
  }, [pushBundleToCloud, useCloud]);

  useEffect(() => {
    if (useCloud) return;
    let cancelled = false;
    void Promise.all([loadEscalaPaoFromIdb(), loadIntegrantesPaoFromIdb()]).then(([e, i]) => {
      if (cancelled) return;
      setEscala(e);
      setIntegrantesState(i);
      hydratedRef.current = true;
      setInitialLoadComplete(true);
      setCloudSyncStatus("synced");
    });
    return () => {
      cancelled = true;
    };
  }, [useCloud]);

  useEffect(() => {
    if (!useCloud) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    setInitialLoadComplete(false);
    hydratedRef.current = false;
    setCloudSyncStatus("idle");

    void (async () => {
      try {
        await ensureFirebaseAuth();
        if (cancelled) return;
        unsub = subscribeSotStateDoc(
          SOT_STATE_DOC.escalaPaoBundle,
          (payload) => {
            void (async () => {
              if (cancelled) return;
              if (remoteSyncPausedRef.current) return;

              if (payload === null) {
                if (!localPromotionAttemptedRef.current) {
                  localPromotionAttemptedRef.current = true;
                  const [localE, localI] = await Promise.all([
                    loadEscalaPaoFromIdb(),
                    loadIntegrantesPaoFromIdb(),
                  ]);
                  if (!isEscalaBundleEmpty(localE, localI)) {
                    try {
                      await setSotStateDocWithRetry(SOT_STATE_DOC.escalaPaoBundle, {
                        escala: localE,
                        integrantes: localI,
                      });
                      applyingRemoteRef.current = true;
                      setEscala(localE);
                      setIntegrantesState(localI);
                      await saveBundleToIdb(localE, localI);
                      setCloudSyncStatus("synced");
                    } catch (e) {
                      console.error("[SOT] Promover escala pão local para nuvem:", e);
                      setCloudSyncStatus("error");
                    }
                  }
                }
                hydratedRef.current = true;
                setInitialLoadComplete(true);
                return;
              }

              applyingRemoteRef.current = true;
              const incoming = normalizeEscalaPaoBundle(payload);
              setEscala(incoming.escala);
              setIntegrantesState(incoming.integrantes);
              setCloudSyncStatus("synced");
              await saveBundleToIdb(incoming.escala, incoming.integrantes);
              hydratedRef.current = true;
              setInitialLoadComplete(true);
            })();
          },
          (err) => {
            console.error("[SOT] Firestore escala pão:", err);
            if (!cancelled) {
              setCloudSyncStatus("error");
              hydratedRef.current = true;
              setInitialLoadComplete(true);
            }
          },
          { ignoreCachedSnapshotWhenOnline: true },
        );
      } catch (e) {
        console.error("[SOT] Firebase auth (escala pão):", e);
        if (!cancelled) {
          setCloudSyncStatus("error");
          hydratedRef.current = true;
          setInitialLoadComplete(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [useCloud]);

  useEffect(() => {
    if (!useCloud || !hydratedRef.current) return;
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      void pushBundleToCloud(escala, integrantes);
    }, 450);
    return () => window.clearTimeout(t);
  }, [escala, integrantes, useCloud, pushBundleToCloud]);

  useEffect(() => {
    if (useCloud || !hydratedRef.current) return;
    void saveBundleToIdb(escala, integrantes);
  }, [escala, integrantes, useCloud]);

  const setIntegrantes = useCallback((next: string[]) => {
    setIntegrantesState(dedupeIntegrantesOrder(next));
  }, []);

  const motoristaParaData = useCallback(
    (date: Date) => getMotoristaEscalaParaData(escala, date),
    [escala],
  );

  const setMotoristaNaData = useCallback((dateKey: string, nome: string) => {
    setEscala((prev) => ({ ...prev, [dateKey]: nome }));
  }, []);

  const setEscalaCompleta = useCallback((next: EscalaPaoStored) => {
    setEscala(next);
  }, []);

  const value = useMemo(
    () => ({
      escala,
      integrantes,
      setIntegrantes,
      motoristaParaData,
      setMotoristaNaData,
      setEscalaCompleta,
      initialLoadComplete,
      cloudSyncStatus,
      setRemoteSyncPaused,
      flushCloudWrite,
    }),
    [
      escala,
      integrantes,
      setIntegrantes,
      motoristaParaData,
      setMotoristaNaData,
      setEscalaCompleta,
      initialLoadComplete,
      cloudSyncStatus,
      setRemoteSyncPaused,
      flushCloudWrite,
    ],
  );

  return <EscalaPaoContext.Provider value={value}>{children}</EscalaPaoContext.Provider>;
}

export function useEscalaPao() {
  const ctx = useContext(EscalaPaoContext);
  if (!ctx) {
    throw new Error("useEscalaPao deve ser usado dentro de EscalaPaoProvider");
  }
  return ctx;
}
