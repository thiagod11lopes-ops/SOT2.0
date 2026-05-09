import { getApps, initializeApp } from "firebase-admin/app";

/** Evita inicialização duplicada; uso partilhado entre funções. */
export function ensureAdminApp(): void {
  if (getApps().length > 0) return;

  let projectId =
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT;

  if (!projectId && process.env.FIREBASE_CONFIG) {
    try {
      const cfg = JSON.parse(process.env.FIREBASE_CONFIG) as { projectId?: string };
      if (cfg.projectId) projectId = cfg.projectId;
    } catch {
      /* ignore */
    }
  }

  if (projectId) {
    initializeApp({ projectId });
  } else {
    initializeApp();
  }
}
