import { useEffect, type ReactNode } from "react";
import { useSyncPreference } from "../context/sync-preference-context";
import { isFirebaseConfigured } from "../lib/firebase/config";
import { ensureSiadDriverRequestCloudSync } from "../lib/siadDriverRequestCloudSync";

export function SiadDriverRequestSyncProvider({ children }: { children: ReactNode }) {
  const { firebaseOnlyEnabled } = useSyncPreference();
  const useCloud = isFirebaseConfigured() && firebaseOnlyEnabled;

  useEffect(() => ensureSiadDriverRequestCloudSync(useCloud), [useCloud]);

  return children;
}
