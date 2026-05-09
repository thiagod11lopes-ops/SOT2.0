/**
 * Entrada deployada por defeito: só `postDriverLocation` (sem Secret Manager VAPID).
 * Para publicar também alarmes push: ver `alarmPush.ts` e o comentário no final deste ficheiro.
 */
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onRequest } from "firebase-functions/v2/https";
import {
  DRIVER_ACTIVE_LOCATIONS_COLLECTION,
  PLACA_MAX_LENGTH,
  deleteAllDriverActiveLocations,
  deleteDriverActiveLocation,
  parseDriverLocationPayload,
  upsertDriverActiveLocation,
} from "./driverActiveLocationIngest.js";
import { ensureAdminApp } from "./adminInit.js";

function readJsonBody(req: { body?: unknown }): Record<string, unknown> {
  const raw = req.body;
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      /* ignore */
    }
    return {};
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(raw)) {
    try {
      const parsed = JSON.parse(raw.toString("utf8")) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      /* ignore */
    }
    return {};
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

/** Passo 3: API HTTP — atualiza Firestore `driver_active_locations` (uma posição viva por placa). */
export const postDriverLocation = onRequest(
  {
    region: "southamerica-east1",
    cors: true,
    invoker: "public",
  },
  async (req, res) => {
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "method_not_allowed" });
      return;
    }
    ensureAdminApp();
    try {
      const authHeader = String(req.headers.authorization ?? "");
      const m = /^Bearer\s+(\S+)/i.exec(authHeader);
      if (!m?.[1]) {
        res.status(401).json({ error: "missing_token" });
        return;
      }
      const decoded = await getAuth().verifyIdToken(m[1]);

      const body = readJsonBody(req);
      const clearOne =
        body.clear === true || body.clear === "true" || body.clear === 1 || body.clear === "1";
      const clearAll =
        body.clearAll === true ||
        body.clearAll === "true" ||
        body.clearAll === 1 ||
        body.clearAll === "1";

      /** Mesmo URL que o POST de posição — remove `driver_active_locations` ao finalizar saída (rubrica). */
      if (clearOne) {
        const placa = String(body.placa ?? "").trim();
        if (!placa || placa.length > PLACA_MAX_LENGTH) {
          res.status(400).json({ error: "invalid_placa" });
          return;
        }
        const db = getFirestore();
        await deleteDriverActiveLocation(db, placa);
        logger.info("postDriverLocation clear ok", {
          collection: DRIVER_ACTIVE_LOCATIONS_COLLECTION,
          placaKeySlice: placa.slice(0, 12),
        });
        res.status(200).json({ ok: true });
        return;
      }

      if (clearAll) {
        const db = getFirestore();
        const deleted = await deleteAllDriverActiveLocations(db);
        logger.info("postDriverLocation clearAll ok", {
          collection: DRIVER_ACTIVE_LOCATIONS_COLLECTION,
          deleted,
          uid: decoded.uid,
        });
        res.status(200).json({ ok: true, deleted });
        return;
      }

      const parsed = parseDriverLocationPayload(body);
      if (!parsed.ok) {
        res.status(parsed.status).json({ error: parsed.error });
        return;
      }

      const db = getFirestore();
      await upsertDriverActiveLocation(db, decoded.uid, parsed.data);
      logger.info("postDriverLocation ok", {
        collection: DRIVER_ACTIVE_LOCATIONS_COLLECTION,
        placaKeySlice: parsed.data.placa.slice(0, 12),
      });
      res.status(200).json({ ok: true });
    } catch (e) {
      logger.error("postDriverLocation", e);
      const code = e && typeof e === "object" && "code" in e ? String((e as { code?: string }).code) : "";
      if (typeof code === "string" && code.startsWith("auth/")) {
        logger.warn("postDriverLocation verifyIdToken failed", {
          code,
          detail: e instanceof Error ? e.message : String(e),
        });
        res.status(401).json({ error: "unauthorized_or_invalid" });
        return;
      }
      res.status(500).json({ error: "internal" });
    }
  },
);

// export { processMobileAlarmPush } from "./alarmPush.js";
