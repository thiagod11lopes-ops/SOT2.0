import { getAuth } from "firebase/auth";
import { ensureFirebaseAuth } from "./firebase/auth";
import { getFirebaseApp, isFirebaseConfigured } from "./firebase/config";

/** URL explícita opcional (produção, emuladores ou proxy). Caso falte, monta pela região e ID do projeto. */
export function resolveDriverLocationPostUrl(): string | null {
  const explicit = import.meta.env.VITE_DRIVER_LOCATION_POST_URL?.trim();
  if (explicit) return explicit;
  const pid = import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim();
  if (!pid) return null;
  return `https://southamerica-east1-${pid}.cloudfunctions.net/postDriverLocation`;
}

/**
 * Envio HTTP (Passo 2) das coordenadas para o backend.
 * Utilizador deve estar autenticado no Firebase (anónimo ou outro).
 */
export async function postDriverLocation(args: {
  placa: string;
  latitude: number;
  longitude: number;
  /** Identificador da saída (opcional, diagnóstico). */
  departureId?: string;
  capturedAt?: string;
}): Promise<void> {
  const url = resolveDriverLocationPostUrl();
  if (!url) {
    throw new Error(
      "URL de envio de localização indisponível: defina VITE_FIREBASE_PROJECT_ID ou VITE_DRIVER_LOCATION_POST_URL.",
    );
  }
  if (!isFirebaseConfigured()) throw new Error("Firebase não configurado neste ambiente.");

  await ensureFirebaseAuth();
  const user = getAuth(getFirebaseApp()).currentUser;
  const token = user ? await user.getIdToken() : null;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      placa: args.placa.trim(),
      latitude: args.latitude,
      longitude: args.longitude,
      departureId: args.departureId,
      capturedAt: args.capturedAt ?? new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `HTTP ${res.status} ${res.statusText}`);
  }
}
