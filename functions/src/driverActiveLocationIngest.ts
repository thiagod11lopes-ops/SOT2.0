/**
 * Passo 3 — Backend: ingestão de localização ativa dos motoristas.
 * Uma posição atual por viatura: documento único Firestore keyed pela placa normalizada.
 */

import { Timestamp, type Firestore } from "firebase-admin/firestore";

export const DRIVER_ACTIVE_LOCATIONS_COLLECTION = "driver_active_locations";

export const PLACA_MAX_LENGTH = 32;

/** Chave estável para ID do documento (maiúsculas, apenas A–Z / 0–9 / underscore). */
export function normalizeDriverActiveLocationPlacaKey(placa: string): string {
  const t = String(placa || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return t.length > 0 ? t : "UNKNOWN";
}

export type PersistedDriverActiveLocation = {
  placa: string;
  latitude: number;
  longitude: number;
  departureId: string;
  capturedAt: string;
};

export function parseDriverLocationPayload(
  body: Record<string, unknown>,
): { ok: true; data: PersistedDriverActiveLocation } | { ok: false; status: number; error: string } {
  const placa = String(body.placa ?? "").trim();
  const lat = Number(body.latitude);
  const lng = Number(body.longitude);

  if (!placa || placa.length > PLACA_MAX_LENGTH) {
    return { ok: false, status: 400, error: "invalid_placa" };
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, status: 400, error: "invalid_coordinates" };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false, status: 400, error: "coordinates_out_of_range" };
  }

  let capturedAt =
    typeof body.capturedAt === "string" && body.capturedAt.trim() ? body.capturedAt.trim() : new Date().toISOString();
  if (Number.isNaN(Date.parse(capturedAt))) {
    capturedAt = new Date().toISOString();
  }

  const departureId = typeof body.departureId === "string" ? body.departureId.trim().slice(0, 512) : "";

  return {
    ok: true,
    data: { placa, latitude: lat, longitude: lng, departureId, capturedAt },
  };
}

/** Atualiza a localização mais recente desta viatura (merge sobre o mesmo doc). */
export async function upsertDriverActiveLocation(
  db: Firestore,
  updatedByUid: string,
  data: PersistedDriverActiveLocation,
): Promise<void> {
  const key = normalizeDriverActiveLocationPlacaKey(data.placa);
  await db.collection(DRIVER_ACTIVE_LOCATIONS_COLLECTION).doc(key).set(
    {
      placa: data.placa,
      latitude: data.latitude,
      longitude: data.longitude,
      departureId: data.departureId,
      capturedAt: data.capturedAt,
      updatedAt: Timestamp.now(),
      updatedByUid,
    },
    { merge: true },
  );
}

/** Remove a posição ativa desta viatura (ex.: saída finalizada após rubrica). */
export async function deleteDriverActiveLocation(db: Firestore, placa: string): Promise<void> {
  const key = normalizeDriverActiveLocationPlacaKey(placa);
  await db.collection(DRIVER_ACTIVE_LOCATIONS_COLLECTION).doc(key).delete();
}

const CLEAR_ALL_BATCH_SIZE = 400;

/** Apaga todos os documentos da coleção (mapa sem pins até novo envio GPS). */
export async function deleteAllDriverActiveLocations(db: Firestore): Promise<number> {
  const col = db.collection(DRIVER_ACTIVE_LOCATIONS_COLLECTION);
  let total = 0;
  for (;;) {
    const snap = await col.limit(CLEAR_ALL_BATCH_SIZE).get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const d of snap.docs) {
      batch.delete(d.ref);
    }
    await batch.commit();
    total += snap.size;
  }
  return total;
}
