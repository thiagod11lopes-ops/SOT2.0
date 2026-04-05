import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirebaseApp, isFirebaseConfigured } from "./config";

/**
 * Autenticação anónima — todos os dispositivos autenticados partilham as mesmas regras Firestore
 * (ler/escrever na coleção `departures` quando `request.auth != null`).
 * No Firebase Console: Authentication → Sign-in method → Anonymous → Enable.
 *
 * Um único `signInAnonymously` em voo: vários providers montam em paralelo e chamam isto ao mesmo tempo.
 */
let anonymousSignInInFlight: Promise<void> | null = null;

export async function ensureFirebaseAuth(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const auth = getAuth(getFirebaseApp());
  if (auth.currentUser) return;
  if (!anonymousSignInInFlight) {
    anonymousSignInInFlight = signInAnonymously(auth)
      .then(() => undefined)
      .catch((e) => {
        anonymousSignInInFlight = null;
        throw e;
      });
  }
  await anonymousSignInInFlight;
}
