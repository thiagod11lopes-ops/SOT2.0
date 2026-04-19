import { useEffect, type ReactNode } from "react";
import { ensureFirebaseAuth } from "../lib/firebase/auth";
import { isFirebaseConfigured } from "../lib/firebase/config";
import { SOT_STATE_DOC, subscribeSotStateDoc } from "../lib/firebase/sotStateFirestore";
import {
  applyRdvFirebaseRemotePayload,
  setRdvFirebaseSyncActive,
} from "../lib/relatorioDiarioViaturasStorage";
import { useSyncPreference } from "./sync-preference-context";

/**
 * Com «Usar somente dados do Firebase» ativo, o RDV (carro-quebrado) sincroniza o doc `sot_state/rdvByDate`,
 * como o resto da app (sem promover localStorage para a nuvem no arranque).
 */
export function RdvFirebaseSyncProvider({ children }: { children: ReactNode }) {
  const { firebaseOnlyEnabled } = useSyncPreference();
  const useCloud = isFirebaseConfigured() && firebaseOnlyEnabled;

  useEffect(() => {
    if (!useCloud) {
      setRdvFirebaseSyncActive(false);
      return;
    }
    setRdvFirebaseSyncActive(true);
    let cancelled = false;
    let unsub: (() => void) | undefined;
    void (async () => {
      try {
        await ensureFirebaseAuth();
        if (cancelled) return;
        unsub = subscribeSotStateDoc(
          SOT_STATE_DOC.rdvByDate,
          (payload) => {
            if (cancelled) return;
            applyRdvFirebaseRemotePayload(payload === undefined ? null : payload);
          },
          (err) => console.error("[SOT] Firestore RDV:", err),
          { ignoreCachedSnapshotWhenOnline: true },
        );
      } catch (e) {
        console.error("[SOT] Firebase auth (RDV):", e);
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
      setRdvFirebaseSyncActive(false);
    };
  }, [useCloud]);

  return <>{children}</>;
}
