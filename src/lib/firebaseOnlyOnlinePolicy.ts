/** Chave compartilhada com `SyncPreferenceProvider` / IndexedDB policy. */
export const SOT_SYNC_FIREBASE_ONLY_PREF_KEY = "sot_sync_firebase_only_v1";

/**
 * Política global: em modo Firebase-only e online, dados operacionais não devem
 * ser lidos/escritos do armazenamento local (IndexedDB/localStorage).
 */
export function isFirebaseOnlyOnlineActive(): boolean {
  if (typeof navigator === "undefined" || !navigator.onLine) return false;
  try {
    const raw = localStorage.getItem(SOT_SYNC_FIREBASE_ONLY_PREF_KEY);
    return raw !== "0";
  } catch {
    return true;
  }
}

