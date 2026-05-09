import { getApps, initializeApp } from "firebase-admin/app";

/** Evita inicialização duplicada; uso partilhado entre funções. */
export function ensureAdminApp(): void {
  if (getApps().length === 0) initializeApp();
}
