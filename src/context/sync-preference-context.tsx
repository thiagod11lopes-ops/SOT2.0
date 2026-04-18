import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { SOT_SYNC_FIREBASE_ONLY_PREF_KEY } from "../lib/firebaseOnlyOnlinePolicy";

const SYNC_PREF_KEY = SOT_SYNC_FIREBASE_ONLY_PREF_KEY;

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
  const forceFirebaseOnlyForMobile =
    typeof window !== "undefined" && window.location.hash.startsWith("#/saidas");
  const firebaseOnlyEnabled = forceFirebaseOnlyForMobile ? true : firebaseOnlyEnabledState;

  const setFirebaseOnlyEnabled = useCallback(
    (value: boolean) => {
      if (forceFirebaseOnlyForMobile && !value) {
        return;
      }
      setFirebaseOnlyEnabledState(value);
      try {
        localStorage.setItem(SYNC_PREF_KEY, value ? "1" : "0");
      } catch {
        /* ignore */
      }
    },
    [forceFirebaseOnlyForMobile],
  );

  const value = useMemo(
    () => ({
      firebaseOnlyEnabled,
      setFirebaseOnlyEnabled,
    }),
    [firebaseOnlyEnabled, setFirebaseOnlyEnabled],
  );

  return <SyncPreferenceContext.Provider value={value}>{children}</SyncPreferenceContext.Provider>;
}

export function useSyncPreference() {
  const ctx = useContext(SyncPreferenceContext);
  if (!ctx) throw new Error("useSyncPreference deve ser usado dentro de SyncPreferenceProvider");
  return ctx;
}
