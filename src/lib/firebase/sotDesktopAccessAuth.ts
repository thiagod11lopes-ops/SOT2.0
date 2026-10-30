import { getApps, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { getFirebaseApp, isFirebaseConfigured } from "./config";

const ACCESS_APP = "sot-desktop-access";

function accessAuth() {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase não está configurado neste build.");
  }
  const found = getApps().find((app) => app.name === ACCESS_APP);
  const app = found ?? initializeApp(getFirebaseApp().options, ACCESS_APP);
  return getAuth(app);
}

/** Conta de e-mail separada do login anônimo usado pelos dados e pelo celular. */
export async function createDesktopAccessAccount(email: string, senha: string): Promise<void> {
  await createUserWithEmailAndPassword(accessAuth(), email, senha);
}

export async function signInDesktopAccess(email: string, senha: string): Promise<void> {
  await signInWithEmailAndPassword(accessAuth(), email, senha);
}

export async function sendDesktopAccessReset(email: string): Promise<void> {
  await sendPasswordResetEmail(accessAuth(), email);
}
