/**
 * Entrada deployada por defeito: só `postDriverLocation` (sem Secret Manager VAPID).
 * Para publicar também alarmes push: ver `alarmPush.ts` e o comentário no final deste ficheiro.
 */
import { getAuth } from "firebase-admin/auth";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
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

/** Doc Firestore onde guardamos o token partilhado para autenticação do OwnTracks. */
const OWNTRACKS_CONFIG_DOC = { collection: "sot_state", id: "owntracks" } as const;

/**
 * Cache em memória do token OwnTracks; renovado a cada 60s. Evita uma leitura Firestore
 * por cada POST do telemóvel (que pode ser ~12/h × N motoristas).
 */
let owntracksTokenCache: { value: string | null; readAt: number } = { value: null, readAt: 0 };

async function readOwntracksSharedToken(db: Firestore, now: number = Date.now()): Promise<string | null> {
  if (owntracksTokenCache.value && now - owntracksTokenCache.readAt < 60_000) {
    return owntracksTokenCache.value;
  }
  try {
    const snap = await db.collection(OWNTRACKS_CONFIG_DOC.collection).doc(OWNTRACKS_CONFIG_DOC.id).get();
    const data = snap.exists ? (snap.data() ?? {}) : {};
    /**
     * O cliente grava com `setSotStateDoc` que embrulha como `{ payload: { token, bindings } }`.
     * Aceitamos também a forma "plana" para resiliência (caso a configuração seja escrita
     * directamente por outro script).
     */
    const payloadRaw = (data as { payload?: unknown }).payload;
    const candidate =
      payloadRaw && typeof payloadRaw === "object" ? (payloadRaw as Record<string, unknown>) : (data as Record<string, unknown>);
    const tokenRaw = candidate.token;
    const token = typeof tokenRaw === "string" && tokenRaw.trim().length >= 16 ? tokenRaw.trim() : null;
    owntracksTokenCache = { value: token, readAt: now };
    return token;
  } catch (e) {
    logger.warn("readOwntracksSharedToken Firestore error", e);
    return null;
  }
}

/** Decode HTTP Basic Auth. */
function decodeBasicAuthPassword(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const m = /^Basic\s+(\S+)/i.exec(authHeader);
  if (!m?.[1]) return null;
  try {
    const decoded = Buffer.from(m[1], "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    if (idx < 0) return null;
    return decoded.slice(idx + 1);
  } catch {
    return null;
  }
}

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

/** Só para diagnóstico em 401 — não substitui verifyIdToken. */
function decodeJwtAudUnsafe(idToken: string): string | null {
  try {
    const parts = idToken.split(".");
    if (parts.length < 2) return null;
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const o = JSON.parse(json) as { aud?: unknown };
    return typeof o.aud === "string" ? o.aud : null;
  } catch {
    return null;
  }
}

function deployedFirebaseProjectId(): string | null {
  return (
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    null
  );
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
    let bearerJwt: string | undefined;
    try {
      const authHeader = String(req.headers.authorization ?? "");
      const m = /^Bearer\s+(\S+)/i.exec(authHeader);
      if (!m?.[1]) {
        res.status(401).json({ error: "missing_token" });
        return;
      }
      bearerJwt = m[1];
      const decoded = await getAuth().verifyIdToken(bearerJwt);

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
        const fnProj = deployedFirebaseProjectId();
        const tokenProj = bearerJwt ? decodeJwtAudUnsafe(bearerJwt) : null;
        const mismatch =
          Boolean(fnProj && tokenProj && tokenProj !== fnProj);
        res.status(401).json({
          error: "unauthorized_or_invalid",
          ...(mismatch
            ? {
                reason: "firebase_project_mismatch",
                token_project: tokenProj,
                function_project: fnProj,
              }
            : {}),
        });
        return;
      }
      res.status(500).json({ error: "internal" });
    }
  },
);

const MOTORISTA_ACTIVE_ASSIGNMENTS_COLLECTION = "motorista_active_assignments";

/**
 * Devolve a placa actualmente atribuída a este motorista (escrita pelo SOT mobile quando
 * o motorista faz "Iniciar Saída"). `null` se não houver atribuição activa.
 */
async function readActivePlacaForMotorista(
  db: Firestore,
  motoristaSlug: string,
): Promise<{ placa: string; departureId: string } | null> {
  if (!motoristaSlug) return null;
  try {
    const snap = await db.collection(MOTORISTA_ACTIVE_ASSIGNMENTS_COLLECTION).doc(motoristaSlug).get();
    if (!snap.exists) return null;
    const data = snap.data() ?? {};
    if (data.active !== true) return null;
    const placa = typeof data.placa === "string" ? data.placa.trim() : "";
    if (!placa || placa.length > PLACA_MAX_LENGTH) return null;
    const departureId = typeof data.departureId === "string" ? data.departureId.slice(0, 512) : "";
    return { placa, departureId };
  } catch (e) {
    logger.warn("readActivePlacaForMotorista Firestore error", e);
    return null;
  }
}

/**
 * Endpoint público para receber posições de iPhones via app OwnTracks.
 *
 * Diferenças face a `postDriverLocation`:
 *  - Autenticação por **Basic Auth** (OwnTracks não suporta Firebase ID tokens). A password
 *    é um token partilhado guardado em Firestore `sot_state/owntracks.token` (gerado e
 *    rodado pelo admin na página de Configurações → Mobile — rastreamento (GPS)).
 *  - Payload no formato OwnTracks (`_type: "location"`, `lat`, `lon`, `tst` em segundos).
 *  - A **placa NÃO vem do QR** (cada motorista pode conduzir várias viaturas). O QR
 *    contém apenas o `motorista` (slug). A placa é descoberta no servidor lendo
 *    `motorista_active_assignments/{slug}` — gravada pelo SOT mobile quando o motorista
 *    toca "Iniciar Saída".
 *  - Tipos diferentes de `_type` (lwt, transition, waypoint, status) respondem 200 sem efeito.
 */
export const postOwntracksLocation = onRequest(
  {
    region: "southamerica-east1",
    cors: true,
    invoker: "public",
  },
  async (req, res) => {
    // Log "raw" para diagnóstico — toda a chamada que chegue a este endpoint, mesmo se falhar a
    // autenticação ou validação. Permite verificar se o OwnTracks no telemóvel está sequer a
    // alcançar o servidor.
    logger.info("postOwntracksLocation request", {
      method: req.method,
      query: req.query,
      hasAuth: typeof req.headers.authorization === "string",
      ua: typeof req.headers["user-agent"] === "string" ? String(req.headers["user-agent"]).slice(0, 120) : null,
      contentType: typeof req.headers["content-type"] === "string" ? req.headers["content-type"] : null,
      contentLength: req.headers["content-length"] ?? null,
    });

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "method_not_allowed" });
      return;
    }

    ensureAdminApp();
    const db = getFirestore();

    try {
      const expectedToken = await readOwntracksSharedToken(db);
      if (!expectedToken) {
        logger.warn("postOwntracksLocation owntracks_not_configured");
        res.status(503).json({ error: "owntracks_not_configured" });
        return;
      }
      const provided = decodeBasicAuthPassword(req.headers.authorization as string | undefined);
      if (!provided || provided !== expectedToken) {
        logger.warn("postOwntracksLocation invalid_token", {
          hasProvided: Boolean(provided),
          providedSlice: provided ? provided.slice(0, 6) : null,
          expectedSlice: expectedToken.slice(0, 6),
        });
        res.status(401).json({ error: "invalid_token" });
        return;
      }

      const motoristaSlug = String(req.query.motorista ?? "").trim().toLowerCase().slice(0, 64);
      if (!motoristaSlug) {
        logger.warn("postOwntracksLocation missing_motorista", { query: req.query });
        res.status(400).json({ error: "missing_motorista" });
        return;
      }

      const body = readJsonBody(req);
      const type = typeof body._type === "string" ? body._type : "";

      // Mensagens não-location (lwt/transition/waypoint/...): aceitar com 200 para o OwnTracks
      // não tentar reenviar; mas não escrevemos nada no Firestore.
      if (type !== "location") {
        logger.info("postOwntracksLocation non_location", { motoristaSlug, type });
        res.status(200).json({ ok: true, ignored: type || "unknown" });
        return;
      }

      const lat = Number(body.lat);
      const lng = Number(body.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        res.status(400).json({ error: "invalid_coordinates" });
        return;
      }
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        res.status(400).json({ error: "coordinates_out_of_range" });
        return;
      }

      // Descobrir placa actual do motorista: registada pelo SOT mobile no "Iniciar Saída".
      const assignment = await readActivePlacaForMotorista(db, motoristaSlug);
      if (!assignment) {
        /**
         * Diagnóstico verboso: lista o que existe na colecção `motorista_active_assignments`
         * para tornar visível um eventual desalinhamento de slugs (e.g. utilizador escreveu
         * "SG Thiago Lopes" no painel OwnTracks mas o motorista logado no SOT mobile chama-se
         * "Thiago Lopes").
         */
        try {
          const all = await db.collection(MOTORISTA_ACTIVE_ASSIGNMENTS_COLLECTION).get();
          const docs = all.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              active: data.active === true,
              placa: typeof data.placa === "string" ? data.placa : null,
              startedAt:
                data.startedAt && typeof data.startedAt.toMillis === "function" ? data.startedAt.toMillis() : null,
            };
          });
          logger.info("postOwntracksLocation no_active_assignment", { motoristaSlug, allDocs: docs });
        } catch (e) {
          logger.warn("postOwntracksLocation no_active_assignment (listing failed)", { motoristaSlug, error: String(e) });
        }
        res.status(200).json({ ok: true, ignored: "no_active_assignment" });
        return;
      }

      const tst = Number(body.tst);
      const capturedAt =
        Number.isFinite(tst) && tst > 0 ? new Date(tst * 1000).toISOString() : new Date().toISOString();

      await upsertDriverActiveLocation(db, `owntracks:${motoristaSlug}`, {
        placa: assignment.placa,
        latitude: lat,
        longitude: lng,
        departureId: assignment.departureId || `owntracks:${motoristaSlug}`,
        capturedAt,
      });

      logger.info("postOwntracksLocation ok", {
        collection: DRIVER_ACTIVE_LOCATIONS_COLLECTION,
        placaKeySlice: assignment.placa.slice(0, 12),
        motoristaSlug,
      });
      res.status(200).json({ ok: true });
    } catch (e) {
      logger.error("postOwntracksLocation", e);
      res.status(500).json({ error: "internal" });
    }
  },
);

// export { processMobileAlarmPush } from "./alarmPush.js";
