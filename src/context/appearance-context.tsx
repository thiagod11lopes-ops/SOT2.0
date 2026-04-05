import {
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
import { SOT_STATE_DOC, setSotStateDoc, subscribeSotStateDoc } from "../lib/firebase/sotStateFirestore";

export type AppearanceMode = "original" | "dark" | "ultra-modern";

const STORAGE_KEY = "sot-appearance";

function readStored(): AppearanceMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "dark" || v === "ultra-modern" || v === "original") return v;
  } catch {
    /* ignore */
  }
  return "original";
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
  const [appearance, setAppearanceState] = useState<AppearanceMode>(() => readStored());
  const applyingRemoteRef = useRef(false);
  const hydratedRef = useRef(true);
  const useCloud = isFirebaseConfigured();

  useEffect(() => {
    if (!useCloud) return;
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
                const local = readStored();
                if (local !== "original") {
                  await setSotStateDoc(SOT_STATE_DOC.appearance, { mode: local });
                }
                return;
              }
              applyingRemoteRef.current = true;
              const next = normalizeAppearancePayload(payload);
              setAppearanceState(next);
              try {
                localStorage.setItem(STORAGE_KEY, next);
              } catch {
                /* ignore */
              }
              hydratedRef.current = true;
            })();
          },
          (err) => console.error("[SOT] Firestore aparência:", err),
        );
      } catch (e) {
        console.error("[SOT] Firebase auth (aparência):", e);
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [useCloud]);

  useEffect(() => {
    applyToDocument(appearance);
    try {
      localStorage.setItem(STORAGE_KEY, appearance);
    } catch {
      /* ignore */
    }
  }, [appearance]);

  useEffect(() => {
    if (!hydratedRef.current || !useCloud) return;
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }
    void setSotStateDoc(SOT_STATE_DOC.appearance, { mode: appearance }).catch((e) => {
      console.error("[SOT] Gravar aparência na nuvem:", e);
    });
  }, [appearance, useCloud]);

  const setAppearance = (mode: AppearanceMode) => {
    setAppearanceState(mode);
  };

  const value = useMemo(() => ({ appearance, setAppearance }), [appearance]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const ctx = useContext(AppearanceContext);
  if (!ctx) {
    throw new Error("useAppearance deve ser usado dentro de AppearanceProvider");
  }
  return ctx;
}
