import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirebaseApp, isFirebaseConfigured } from "./config";

/**
 * Autenticação anónima — todos os dispositivos autenticados partilham as mesmas regras Firestore
 * (ler/escrever na coleção `departures` quando `request.auth != null`).
 * No Firebase Console: Authentication → Sign-in method → Anonymous → Enable.
 *
 * `authStateReady` + `getIdToken` garantem que o token existe antes do Firestore enviar pedidos
 * (evita `Missing or insufficient permissions` por corrida com o SDK).
 *
 * Um único `signInAnonymously` em voo: vários providers montam em paralelo e chamam isto ao mesmo tempo.
 */
let anonymousSignInInFlight: Promise<void> | null = null;

async function refreshIdToken(auth: ReturnType<typeof getAuth>): Promise<void> {
  const u = auth.currentUser;
  if (!u) return;
  await u.getIdToken();
}

export async function ensureFirebaseAuth(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const auth = getAuth(getFirebaseApp());
  await auth.authStateReady();

  if (auth.currentUser) {
    await refreshIdToken(auth);
    return;
  }

  if (!anonymousSignInInFlight) {
    anonymousSignInInFlight = signInAnonymously(auth)
      .then(async (cred) => {
        await cred.user.getIdToken();
      })
      .then(() => undefined)
      .catch((e) => {
        anonymousSignInInFlight = null;
        throw e;
      });
  }
  await anonymousSignInInFlight;

  if (!auth.currentUser) {
    throw new Error(
      "Firebase Auth: sessão anónima não ficou disponível. Confirme domínio autorizado e Anonymous ativo.",
    );
  }
  await refreshIdToken(auth);
}
