/**
 * Quando o mapa pede a localização, envia um aviso push para o celular do motorista,
 * inclusive com a tela bloqueada.
 */
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getAuth } from "firebase-admin/auth";
import { ensureAdminApp } from "./adminInit.js";

type MobilePushSub = { endpoint: string; keys: { p256dh: string; auth: string } };

type PushSubscriptionDoc = {
  motorista?: string;
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  enabled?: boolean;
};

type SolicitacaoPayload = {
  id?: unknown;
  placa?: unknown;
  motorista?: unknown;
  status?: unknown;
};

const WEB_PUSH_VAPID_PUBLIC_KEY = defineSecret("WEB_PUSH_VAPID_PUBLIC_KEY");
const WEB_PUSH_VAPID_PRIVATE_KEY = defineSecret("WEB_PUSH_VAPID_PRIVATE_KEY");
const WEB_PUSH_SUBJECT = defineSecret("WEB_PUSH_SUBJECT");
const MOTORISTA_ACTIVE_ASSIGNMENTS_COLLECTION = "motorista_active_assignments";

function driverKey(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function namesMatch(a: string, b: string): boolean {
  const na = driverKey(a);
  const nb = driverKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const A = na.split(" ").filter(Boolean);
  const B = nb.split(" ").filter(Boolean);
  const [shorter, longer] = A.length <= B.length ? [A, B] : [B, A];
  if (!shorter.length || longer.length < shorter.length) return false;
  if (shorter.every((tok, i) => longer[i] === tok)) return true;
  if (shorter.every((tok, i) => longer[longer.length - shorter.length + i] === tok)) return true;
  if (shorter.length === 1) return longer.includes(shorter[0]!);
  return shorter.every((tok) => longer.includes(tok));
}

function readSolicitacao(data: { payload?: unknown } | undefined): SolicitacaoPayload | null {
  if (!data) return null;
  const payload = data.payload;
  if (!payload || typeof payload !== "object") return null;
  return payload as SolicitacaoPayload;
}

async function loadWebPushConfig(): Promise<boolean> {
  const publicKey = String(WEB_PUSH_VAPID_PUBLIC_KEY.value() || "").trim();
  const privateKey = String(WEB_PUSH_VAPID_PRIVATE_KEY.value() || "").trim();
  const subject = String(WEB_PUSH_SUBJECT.value() || "mailto:thiagod11lopes@gmail.com").trim();
  if (!publicKey || !privateKey) return false;
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

function normalizePlaca(placa: string): string {
  return placa.trim().toUpperCase();
}

async function motoristasAtivosDaPlaca(placa: string): Promise<string[]> {
  ensureAdminApp();
  const db = getFirestore();
  const snap = await db.collection(MOTORISTA_ACTIVE_ASSIGNMENTS_COLLECTION).where("active", "==", true).get();
  const wanted = normalizePlaca(placa);
  const out: string[] = [];
  snap.forEach((doc) => {
    const data = doc.data() as { motorista?: unknown; placa?: unknown; active?: unknown };
    if (data.active !== true) return;
    if (normalizePlaca(String(data.placa ?? "")) !== wanted) return;
    const nome = String(data.motorista ?? "").trim();
    if (nome) out.push(nome);
  });
  return out;
}

async function subscriptionsForTargets(motoristaField: string, placa: string): Promise<MobilePushSub[]> {
  ensureAdminApp();
  const db = getFirestore();
  const snap = await db.collection("sot_mobile_push_subscriptions").where("enabled", "==", true).get();
  const wantedNames = motoristaField
    .split(/[,;/]|\se\s/i)
    .map((nome) => nome.trim())
    .filter(Boolean);
  if (wantedNames.length === 0 && motoristaField.trim()) wantedNames.push(motoristaField.trim());
  try {
    const ativos = await motoristasAtivosDaPlaca(placa);
    for (const nome of ativos) {
      if (!wantedNames.some((w) => namesMatch(w, nome))) wantedNames.push(nome);
    }
  } catch (e) {
    logger.warn("motoristasAtivosDaPlaca falhou", e);
  }

  const out: MobilePushSub[] = [];
  const seen = new Set<string>();
  snap.forEach((doc) => {
    const row = doc.data() as PushSubscriptionDoc;
    const nome = String(row.motorista ?? "").trim();
    const endpoint = String(row.endpoint ?? "");
    const p256dh = String(row.keys?.p256dh ?? "");
    const auth = String(row.keys?.auth ?? "");
    if (!nome || !endpoint || !p256dh || !auth) return;
    if (!wantedNames.some((w) => namesMatch(w, nome))) return;
    if (seen.has(endpoint)) return;
    seen.add(endpoint);
    out.push({ endpoint, keys: { p256dh, auth } });
  });
  return out;
}

async function sendLocationCallPush(args: {
  id: string;
  placa: string;
  motorista: string;
}): Promise<{ sent: number; failed: number; targets: number }> {
  ensureAdminApp();
  if (!(await loadWebPushConfig())) {
    logger.warn("notifyLocationRequest sem chaves WEB_PUSH_VAPID.");
    return { sent: 0, failed: 0, targets: 0 };
  }
  const subs = await subscriptionsForTargets(args.motorista, args.placa);
  if (subs.length === 0) {
    logger.warn("notifyLocationRequest sem celular registrado", {
      motorista: args.motorista,
      placa: args.placa,
    });
    return { sent: 0, failed: 0, targets: 0 };
  }
  const webpush = (await import("web-push")).default;
  const payload = JSON.stringify({
    kind: "location-call",
    title: "Enviar localização para HNMD",
    body: `Viatura ${args.placa}. Toque para enviar ou recusar.`,
    tag: `sot-location-call-${args.id}`,
    url: "mobile.html#/saidas/administrativas",
  });
  const results = await Promise.allSettled(
    subs.map((sub) => webpush.sendNotification(sub, payload, { TTL: 300, urgency: "high" })),
  );
  const failed = results.filter((row) => row.status === "rejected").length;
  for (const row of results) {
    if (row.status === "rejected") logger.warn("notifyLocationRequest push falhou", row.reason);
  }
  logger.info("notifyLocationRequest", {
    placa: args.placa,
    targets: subs.length,
    sent: results.length - failed,
    failed,
  });
  return { sent: results.length - failed, failed, targets: subs.length };
}

export const notifyLocationRequest = onDocumentWritten(
  {
    document: "sot_state/solicitacaoLocalizacao",
    region: "southamerica-east1",
    secrets: [WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY, WEB_PUSH_SUBJECT],
  },
  async (event) => {
    ensureAdminApp();
    const next = readSolicitacao(event.data?.after?.data());
    const prev = readSolicitacao(event.data?.before?.data());
    const id = String(next?.id ?? "").trim();
    const placa = String(next?.placa ?? "").trim();
    const motorista = String(next?.motorista ?? "").trim();
    const status = String(next?.status ?? "");
    if (!id || !placa || !motorista || status !== "pendente") return;
    if (prev && String(prev.id ?? "") === id && String(prev.status ?? "") === "pendente") return;
    await sendLocationCallPush({ id, placa, motorista });
  },
);

/** Reforço HTTP: o mapa chama isto depois de gravar o pedido, para o aviso não depender só do Eventarc. */
export const pushLocationRequest = onRequest(
  {
    region: "southamerica-east1",
    cors: true,
    invoker: "public",
    secrets: [WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY, WEB_PUSH_SUBJECT],
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
      await getAuth().verifyIdToken(m[1]);
      const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
      const id = String(body.id ?? "").trim();
      const placa = String(body.placa ?? "").trim();
      const motorista = String(body.motorista ?? "").trim();
      if (!id || !placa || !motorista) {
        res.status(400).json({ error: "invalid_payload" });
        return;
      }
      const result = await sendLocationCallPush({ id, placa, motorista });
      res.status(200).json({ ok: true, ...result });
    } catch (e) {
      logger.error("pushLocationRequest", e);
      const code = e && typeof e === "object" && "code" in e ? String((e as { code?: string }).code) : "";
      if (code.startsWith("auth/")) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
      res.status(500).json({ error: "internal" });
    }
  },
);
