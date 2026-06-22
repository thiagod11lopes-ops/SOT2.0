import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  emptyDetalheServicoBundle,
  isDetalheServicoBundleEmpty,
  loadDetalheServicoBundleFromIdb,
  migrateDetalheServicoBundleMotoristaNames,
  normalizeDetalheServicoBundle,
  saveDetalheServicoBundleToIdb,
  type DetalheServicoBundle,
} from "../lib/detalheServicoBundle";
import { isFirebaseConfigured } from "../lib/firebase/config";
import { SOT_STATE_DOC, setSotStateDocWithRetry, subscribeSotStateDoc } from "../lib/firebase/sotStateFirestore";
import { useSyncPreference } from "./sync-preference-context";

type CloudSyncStatus = "idle" | "syncing" | "synced" | "error";

type DetalheServicoContextValue = {
  bundle: DetalheServicoBundle;
  setBundle: Dispatch<SetStateAction<DetalheServicoBundle>>;
  initialLoadComplete: boolean;
  awaitingFirstCloudSnapshot: boolean;
  cloudSyncStatus: CloudSyncStatus;
  cloudSyncAt: Date | null;
  /** Pausa aplicação de snapshots remotos (ex.: enquanto a grelha está editável). */
  setRemoteSyncPaused: (paused: boolean) => void;
  /** Força gravação imediata na nuvem (ex.: ao bloquear edição). */
  flushCloudWrite: () => Promise<void>;
};

const DetalheServicoContext = createContext<DetalheServicoContextValue | null>(null);

export function DetalheServicoProvider({ children }: { children: ReactNode }) {
  const { firebaseOnlyEnabled } = useSyncPreference();
  const useCloud = isFirebaseConfigured() && firebaseOnlyEnabled;

  const [bundle, setBundleState] = useState<DetalheServicoBundle>(emptyDetalheServicoBundle);
  const [initialLoadComplete, setInitialLoadComplete] = useState(!useCloud);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>(useCloud ? "idle" : "synced");
  const [cloudSyncAt, setCloudSyncAt] = useState<Date | null>(null);

  const applyingRemoteRef = useRef(false);
  const remoteSyncPausedRef = useRef(false);
  const hydratedRef = useRef(!useCloud);
  const localPromotionAttemptedRef = useRef(false);
  const cloudWriteInFlightRef = useRef(false);
  const pendingCloudBundleRef = useRef<DetalheServicoBundle | null>(null);
  const bundleRef = useRef(bundle);
  bundleRef.current = bundle;

  const setBundle = useCallback<Dispatch<SetStateAction<DetalheServicoBundle>>>((action) => {
    setBundleState((prev) => (typeof action === "function" ? action(prev) : action));
  }, []);

  const setRemoteSyncPaused = useCallback((paused: boolean) => {
    remoteSyncPausedRef.current = paused;
  }, []);

  const pushBundleToCloud = useCallback(
    async (nextBundle: DetalheServicoBundle) => {
      if (!useCloud || !hydratedRef.current) return;
      pendingCloudBundleRef.current = nextBundle;
      if (cloudWriteInFlightRef.current) return;
      cloudWriteInFlightRef.current = true;
      try {
        while (pendingCloudBundleRef.current) {
          const toSend = pendingCloudBundleRef.current;
          pendingCloudBundleRef.current = null;
          setCloudSyncStatus("syncing");
          try {
            await setSotStateDocWithRetry(SOT_STATE_DOC.detalheServico, toSend);
            await saveDetalheServicoBundleToIdb(toSend);
            setCloudSyncStatus("synced");
            setCloudSyncAt(new Date());
          } catch (e) {
            setCloudSyncStatus("error");
            console.error("[SOT] Gravar detalhe serviço na nuvem:", e);
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
    await pushBundleToCloud(bundleRef.current);
  }, [pushBundleToCloud, useCloud]);

  useEffect(() => {
    if (useCloud) return;
    let cancelled = false;
    void loadDetalheServicoBundleFromIdb().then((local) => {
      if (cancelled) return;
      const next = migrateDetalheServicoBundleMotoristaNames(local);
      setBundleState(next);
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
        const { ensureFirebaseAuth } = await import("../lib/firebase/auth");
        await ensureFirebaseAuth();
        if (cancelled) return;
        unsub = subscribeSotStateDoc(
          SOT_STATE_DOC.detalheServico,
          (payload) => {
            void (async () => {
              if (cancelled) return;
              if (remoteSyncPausedRef.current) return;

              if (payload === null) {
                if (!localPromotionAttemptedRef.current) {
                  localPromotionAttemptedRef.current = true;
                  const local = migrateDetalheServicoBundleMotoristaNames(
                    await loadDetalheServicoBundleFromIdb(),
                  );
                  if (!isDetalheServicoBundleEmpty(local)) {
                    try {
                      await setSotStateDocWithRetry(SOT_STATE_DOC.detalheServico, local);
                      applyingRemoteRef.current = true;
                      setBundleState(local);
                      await saveDetalheServicoBundleToIdb(local);
                      setCloudSyncStatus("synced");
                      setCloudSyncAt(new Date());
                    } catch (e) {
                      console.error("[SOT] Promover detalhe serviço local para nuvem:", e);
                      setCloudSyncStatus("error");
                    }
                  }
                }
                hydratedRef.current = true;
                setInitialLoadComplete(true);
                return;
              }

              applyingRemoteRef.current = true;
              const next = migrateDetalheServicoBundleMotoristaNames(normalizeDetalheServicoBundle(payload));
              setBundleState(next);
              setCloudSyncStatus("synced");
              setCloudSyncAt(new Date());
              await saveDetalheServicoBundleToIdb(next);
              hydratedRef.current = true;
              setInitialLoadComplete(true);
            })();
          },
          (err) => {
            console.error("[SOT] Firestore detalhe serviço:", err);
            if (!cancelled) {
              setCloudSyncStatus("error");
              hydratedRef.current = true;
              setInitialLoadComplete(true);
            }
          },
          { ignoreCachedSnapshotWhenOnline: true },
        );
      } catch (e) {
        console.error("[SOT] Firebase auth (detalhe serviço):", e);
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
      void pushBundleToCloud(bundle);
    }, 450);
    return () => window.clearTimeout(t);
  }, [bundle, useCloud, pushBundleToCloud]);

  useEffect(() => {
    if (useCloud || !hydratedRef.current) return;
    void saveDetalheServicoBundleToIdb(bundle);
  }, [bundle, useCloud]);

  const value: DetalheServicoContextValue = {
    bundle,
    setBundle,
    initialLoadComplete,
    awaitingFirstCloudSnapshot: useCloud && !initialLoadComplete,
    cloudSyncStatus,
    cloudSyncAt,
    setRemoteSyncPaused,
    flushCloudWrite,
  };

  return <DetalheServicoContext.Provider value={value}>{children}</DetalheServicoContext.Provider>;
}

export function useDetalheServico(): DetalheServicoContextValue {
  const ctx = useContext(DetalheServicoContext);
  if (!ctx) {
    throw new Error("useDetalheServico só pode ser usado dentro de DetalheServicoProvider");
  }
  return ctx;
}
