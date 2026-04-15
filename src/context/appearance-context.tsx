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
import { idbGetJson, idbSetJson } from "../lib/indexedDb";
import { useSyncPreference } from "./sync-preference-context";

export type AppearanceMode = "original" | "dark" | "ultra-modern";

const IDB_KEY = "sot-appearance";
const LEGACY_LS_KEY = "sot-appearance";
const SUPPRESS_REMOTE_MS = 5000;

async function loadAppearanceFromIdb(): Promise<AppearanceMode> {
  const v = await idbGetJson<unknown>(IDB_KEY);
  if (v === "dark" || v === "ultra-modern" || v === "original") return v;
  try {
    if (typeof localStorage === "undefined") return "original";
    const ls = localStorage.getItem(LEGACY_LS_KEY);
    if (ls === "dark" || ls === "ultra-modern" || ls === "original") {
      await idbSetJson(IDB_KEY, ls);
      localStorage.removeItem(LEGACY_LS_KEY);
      return ls;
    }
  } catch {
    /* ignore */
  }
  return "original";
}

async function saveAppearanceToIdb(mode: AppearanceMode): Promise<void> {
  await idbSetJson(IDB_KEY, mode);
}

function normalizeAppearancePayload(raw: unknown): AppearanceMode {
  if (!raw || typeof raw !== "object") return "original";
  const m = (raw as Record<string, unknown>).mode;
  if (m === "dark" || m === "ultra-modern" || m === "original") return m;
  return "original";
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
  const [appearance, setAppearanceState] = useState<AppearanceMode>("original");
  const [localReady, setLocalReady] = useState(false);
  const applyingRemoteRef = useRef(false);
  const hydratedRef = useRef(true);
  const suppressRemoteUntilRef = useRef(0);
  const { firebaseOnlyEnabled } = useSyncPreference();
  const useCloud = isFirebaseConfigured() && firebaseOnlyEnabled;
  const bumpLocalMutation = useCallback(() => {
    suppressRemoteUntilRef.current = Date.now() + SUPPRESS_REMOTE_MS;
  }, []);

  useEffect(() => {
    if (useCloud) {
      // Modo estrito Firebase: ignora hidratação inicial por cache local.
      setLocalReady(true);
      return;
    }
    void loadAppearanceFromIdb().then((m) => {
      setAppearanceState(m);
      setLocalReady(true);
    });
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
            void (async () => {
              if (payload === null) {
                // Firebase como fonte da verdade: não promover local->nuvem no bootstrap.
                return;
              }
              if (Date.now() < suppressRemoteUntilRef.current) return;
              applyingRemoteRef.current = true;
              const next = normalizeAppearancePayload(payload);
              setAppearanceState(next);
              void saveAppearanceToIdb(next);
              hydratedRef.current = true;
            })();
          },
          (err) => console.error("[SOT] Firestore aparência:", err),
          { ignoreCachedSnapshotWhenOnline: true },
        );
      } catch (e) {
        console.error("[SOT] Firebase auth (aparência):", e);
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
    if (!localReady) return;
    void saveAppearanceToIdb(appearance);
  }, [appearance, localReady]);

  useEffect(() => {
    if (!localReady || !hydratedRef.current || !useCloud) return;
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }
    void setSotStateDocWithRetry(SOT_STATE_DOC.appearance, { mode: appearance }).catch((e) => {
      console.error("[SOT] Gravar aparência na nuvem:", e);
    });
  }, [appearance, useCloud, localReady]);

  const setAppearance = useCallback((mode: AppearanceMode) => {
    bumpLocalMutation();
    setAppearanceState(mode);
  }, [bumpLocalMutation]);

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
