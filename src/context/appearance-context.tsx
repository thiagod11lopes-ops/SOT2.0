import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

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

  useEffect(() => {
    applyToDocument(appearance);
    try {
      localStorage.setItem(STORAGE_KEY, appearance);
    } catch {
      /* ignore */
    }
  }, [appearance]);

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
