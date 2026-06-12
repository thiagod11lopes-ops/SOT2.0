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

function isAppearanceMode(v: unknown): v is AppearanceMode {
  return v === "dark" || v === "ultra-modern" || v === "original";
}

/** Leitura síncrona (localStorage) para evitar flash do tema errado ao recarregar. */
function readAppearanceBootstrap(): AppearanceMode {
  try {
    if (typeof localStorage === "undefined") return "original";
    const ls = localStorage.getItem(LEGACY_LS_KEY);
    if (isAppearanceMode(ls)) return ls;
  } catch {
    /* ignore */
  }
  return "original";
}

async function loadAppearanceFromIdb(): Promise<AppearanceMode> {
  const v = await idbGetJson<unknown>(IDB_KEY);
  if (isAppearanceMode(v)) return v;
  return readAppearanceBootstrap();
}

async function saveAppearanceToIdb(mode: AppearanceMode): Promise<void> {
  await idbSetJson(IDB_KEY, mode);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(LEGACY_LS_KEY, mode);
    }
  } catch {
    /* ignore */
  }
}

function normalizeAppearancePayload(raw: unknown): AppearanceMode {
  if (!raw || typeof raw !== "object") return "original";
  const m = (raw as Record<string, unknown>).mode;
  if (isAppearanceMode(m)) return m;
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
  const bootstrap = readAppearanceBootstrap();
  const [appearance, setAppearanceState] = useState<AppearanceMode>(bootstrap);
  const appearanceRef = useRef(appearance);
  appearanceRef.current = appearance;
  const [localReady, setLocalReady] = useState(false);
  const applyingRemoteRef = useRef(false);
  /** Permite gravar na nuvem após hidratação local e/ou 1.º snapshot remoto. */
  const hydratedRef = useRef(false);
  const persistReadyRef = useRef(false);
  const suppressRemoteUntilRef = useRef(0);
  const { firebaseOnlyEnabled } = useSyncPreference();
  const useCloud = isFirebaseConfigured() && firebaseOnlyEnabled;
  const bumpLocalMutation = useCallback(() => {
    suppressRemoteUntilRef.current = Date.now() + SUPPRESS_REMOTE_MS;
  }, []);

  useEffect(() => {
    applyToDocument(bootstrap);
  }, [bootstrap]);

  /** Sempre hidrata do IndexedDB (também em modo Firebase) antes de aceitar gravações. */
  useEffect(() => {
    let cancelled = false;
    void loadAppearanceFromIdb().then((m) => {
      if (cancelled) return;
      applyingRemoteRef.current = true;
      setAppearanceState(m);
      applyToDocument(m);
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
              void setSotStateDocWithRetry(SOT_STATE_DOC.appearance, {
                mode: appearanceRef.current,
              }).catch((e) => console.error("[SOT] Sem doc de aparência na nuvem — gravar preferência local:", e));
              return;
            }
            applyingRemoteRef.current = true;
            const next = normalizeAppearancePayload(payload);
            setAppearanceState(next);
            void saveAppearanceToIdb(next);
            hydratedRef.current = true;
            queueMicrotask(() => {
              applyingRemoteRef.current = false;
            });
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

  const setAppearance = useCallback(
    (mode: AppearanceMode) => {
      bumpLocalMutation();
      hydratedRef.current = true;
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
