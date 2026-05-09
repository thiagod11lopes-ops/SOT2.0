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
  parseDriverLocationPayload,
  upsertDriverActiveLocation,
} from "./driverActiveLocationIngest.js";
import { ensureAdminApp } from "./adminInit.js";

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

      const body =
        typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};
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
        res.status(401).json({ error: "unauthorized_or_invalid" });
        return;
      }
      res.status(500).json({ error: "internal" });
    }
  },
);

// export { processMobileAlarmPush } from "./alarmPush.js";
