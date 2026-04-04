import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirebaseApp, isFirebaseConfigured } from "./config";

/**
 * Autenticação anónima — todos os dispositivos autenticados partilham as mesmas regras Firestore
 * (ler/escrever na coleção `departures` quando `request.auth != null`).
 * No Firebase Console: Authentication → Sign-in method → Anonymous → Enable.
 */
export async function ensureFirebaseAuth(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const auth = getAuth(getFirebaseApp());
  if (auth.currentUser) return;
  await signInAnonymously(auth);
}
