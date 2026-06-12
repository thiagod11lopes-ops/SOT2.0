import {
  useCallback,
  createContext,
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
  APPEARANCE_IDB_KEY,
  mergeAppearanceRecords,
  parseAppearanceRecord,
  readAppearanceFromLocalStorage,
  writeAppearanceToLocalStorage,
  type AppearanceMode,
  type AppearanceRecord,
} from "../lib/appearanceStorage";

export type { AppearanceMode } from "../lib/appearanceStorage";
import { idbGetJson, idbSetJson } from "../lib/indexedDb";
import { useSyncPreference } from "./sync-preference-context";

const SUPPRESS_REMOTE_MS = 5000;

function readAppearanceBootstrap(): AppearanceRecord {
  return readAppearanceFromLocalStorage() ?? { mode: "original", updatedAt: 0 };
}

async function loadAppearanceFromIdb(): Promise<AppearanceRecord> {
  const idbRaw = await idbGetJson<unknown>(APPEARANCE_IDB_KEY);
  const fromIdb = parseAppearanceRecord(idbRaw);
  const fromLs = readAppearanceFromLocalStorage();
  return mergeAppearanceRecords(fromIdb, fromLs);
}

async function saveAppearanceLocally(record: AppearanceRecord): Promise<void> {
  await idbSetJson(APPEARANCE_IDB_KEY, record);
  writeAppearanceToLocalStorage(record);
}

function applyToDocument(mode: AppearanceMode) {
  if (mode === "original") {
    delete document.documentElement.dataset.appearance;
  } else {
    document.documentElement.dataset.appearance = mode;
  }
}

type AppearanceContextValue = {
  appearance: AppearanceMode;
  setAppearance: (mode: AppearanceMode) => void;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const bootstrap = readAppearanceBootstrap();
  const [appearance, setAppearanceState] = useState<AppearanceMode>(bootstrap.mode);
  const recordRef = useRef<AppearanceRecord>(bootstrap);
  const [localReady, setLocalReady] = useState(false);
  const applyingRemoteRef = useRef(false);
  const hydratedRef = useRef(false);
  const persistReadyRef = useRef(false);
  const suppressRemoteUntilRef = useRef(0);
  const { firebaseOnlyEnabled } = useSyncPreference();
  const useCloud = isFirebaseConfigured() && firebaseOnlyEnabled;

  const bumpLocalMutation = useCallback(() => {
    suppressRemoteUntilRef.current = Date.now() + SUPPRESS_REMOTE_MS;
  }, []);

  useEffect(() => {
    applyToDocument(bootstrap.mode);
  }, [bootstrap.mode]);

  /** Sempre hidrata do IndexedDB + localStorage antes de aceitar gravações. */
  useEffect(() => {
    let cancelled = false;
    void loadAppearanceFromIdb().then((record) => {
      if (cancelled) return;
      applyingRemoteRef.current = true;
      recordRef.current = record;
      setAppearanceState(record.mode);
      applyToDocument(record.mode);
      setLocalReady(true);
      if (!useCloud) {
        hydratedRef.current = true;
      }
      queueMicrotask(() => {
        applyingRemoteRef.current = false;
        persistReadyRef.current = true;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [useCloud]);

  useEffect(() => {
    if (!useCloud || !localReady) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    void (async () => {
      try {
        await ensureFirebaseAuth();
        if (cancelled) return;
        unsub = subscribeSotStateDoc(
          SOT_STATE_DOC.appearance,
          (payload) => {
            if (cancelled) return;
            if (Date.now() < suppressRemoteUntilRef.current) return;
            if (payload === null) {
              hydratedRef.current = true;
              void setSotStateDocWithRetry(SOT_STATE_DOC.appearance, recordRef.current).catch((e) =>
                console.error("[SOT] Sem doc de aparência na nuvem — gravar preferência local:", e),
              );
              return;
            }
            const remote = parseAppearanceRecord(payload) ?? { mode: "original" as const, updatedAt: 0 };
            const local = recordRef.current;
            if (remote.updatedAt > local.updatedAt) {
              applyingRemoteRef.current = true;
              recordRef.current = remote;
              setAppearanceState(remote.mode);
              void saveAppearanceLocally(remote);
              hydratedRef.current = true;
              queueMicrotask(() => {
                applyingRemoteRef.current = false;
              });
              return;
            }
            hydratedRef.current = true;
            if (remote.mode !== local.mode) {
              void setSotStateDocWithRetry(SOT_STATE_DOC.appearance, local).catch((e) =>
                console.error("[SOT] Sincronizar aparência local (mais recente) na nuvem:", e),
              );
            }
          },
          (err) => console.error("[SOT] Firestore aparência:", err),
          { ignoreCachedSnapshotWhenOnline: true },
        );
      } catch (e) {
        console.error("[SOT] Firebase auth (aparência):", e);
        hydratedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [useCloud, localReady]);

  useEffect(() => {
    applyToDocument(appearance);
  }, [appearance]);

  useEffect(() => {
    if (!localReady || !persistReadyRef.current) return;
    if (applyingRemoteRef.current) return;
    const record = recordRef.current;
    void saveAppearanceLocally(record);
  }, [appearance, localReady]);

  useEffect(() => {
    if (!localReady || !hydratedRef.current || !useCloud) return;
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }
    void setSotStateDocWithRetry(SOT_STATE_DOC.appearance, recordRef.current).catch((e) => {
      console.error("[SOT] Gravar aparência na nuvem:", e);
    });
  }, [appearance, useCloud, localReady]);

  const setAppearance = useCallback(
    (mode: AppearanceMode) => {
      bumpLocalMutation();
      hydratedRef.current = true;
      const next: AppearanceRecord = { mode, updatedAt: Date.now() };
      recordRef.current = next;
      setAppearanceState(mode);
    },
    [bumpLocalMutation],
  );

  const value = useMemo(() => ({ appearance, setAppearance }), [appearance, setAppearance]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const ctx = useContext(AppearanceContext);
  if (!ctx) {
    throw new Error("useAppearance deve ser usado dentro de AppearanceProvider");
  }
  return ctx;
}
