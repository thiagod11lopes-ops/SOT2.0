const SYNC_PREF_KEY = "sot_sync_firebase_only_v1";

/**
 * Política global: em modo Firebase-only e online, dados operacionais não devem
 * ser lidos/escritos do armazenamento local (IndexedDB/localStorage).
 */
export function isFirebaseOnlyOnlineActive(): boolean {
  if (typeof navigator === "undefined" || !navigator.onLine) return false;
  try {
    const raw = localStorage.getItem(SYNC_PREF_KEY);
    return raw !== "0";
  } catch {
    return true;
  }
}

