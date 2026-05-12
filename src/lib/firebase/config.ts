import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";

/**
 * No WebView Android (Capacitor), o transporte WebChannel por `fetch` pode falhar se o
 * `CapacitorHttp` estiver a patchar `fetch`. Long-polling evita esse caminho quando necessário.
 * Deve correr antes de qualquer `getFirestore(app)`.
 */
function ensureFirestoreWebViewFriendlyTransport(app: FirebaseApp): void {
  try {
    initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
    });
  } catch {
    /* já inicializado nesta sessão */
  }
}

/** True quando VITE_FIREBASE_* obrigatórios estão definidos (build / .env). */
export function isFirebaseConfigured(): boolean {
  return (
    !!import.meta.env.VITE_FIREBASE_API_KEY?.trim() &&
    !!import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() &&
    !!import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim()
  );
}

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase não configurado: defina VITE_FIREBASE_* no .env");
  }
  if (getApps().length > 0) {
    const app = getApp();
    ensureFirestoreWebViewFriendlyTransport(app);
    return app;
  }
  const app = initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || undefined,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || undefined,
    appId: import.meta.env.VITE_FIREBASE_APP_ID || undefined,
  });
  ensureFirestoreWebViewFriendlyTransport(app);
  return app;
}
