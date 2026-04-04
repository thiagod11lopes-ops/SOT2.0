import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";

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
    return getApp();
  }
  return initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || undefined,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || undefined,
    appId: import.meta.env.VITE_FIREBASE_APP_ID || undefined,
  });
}
