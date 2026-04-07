import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

const SYNC_PREF_KEY = "sot_sync_firebase_only_v1";

type SyncPreferenceContextValue = {
  firebaseOnlyEnabled: boolean;
  setFirebaseOnlyEnabled: (value: boolean) => void;
};

const SyncPreferenceContext = createContext<SyncPreferenceContextValue | null>(null);

function readInitialPreference(): boolean {
  try {
    const raw = localStorage.getItem(SYNC_PREF_KEY);
    if (raw === "0") return false;
    if (raw === "1") return true;
  } catch {
    /* ignore */
  }
  return true;
}

export function SyncPreferenceProvider({ children }: { children: ReactNode }) {
  const [firebaseOnlyEnabledState, setFirebaseOnlyEnabledState] = useState<boolean>(readInitialPreference);

  const setFirebaseOnlyEnabled = (value: boolean) => {
    setFirebaseOnlyEnabledState(value);
    try {
      localStorage.setItem(SYNC_PREF_KEY, value ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const value = useMemo(
    () => ({
      firebaseOnlyEnabled: firebaseOnlyEnabledState,
      setFirebaseOnlyEnabled,
    }),
    [firebaseOnlyEnabledState],
  );

  return <SyncPreferenceContext.Provider value={value}>{children}</SyncPreferenceContext.Provider>;
}

export function useSyncPreference() {
  const ctx = useContext(SyncPreferenceContext);
  if (!ctx) throw new Error("useSyncPreference deve ser usado dentro de SyncPreferenceProvider");
  return ctx;
}
