/**
 * Quando o mapa pede a localização, envia um aviso push para o celular do motorista,
 * inclusive com a tela bloqueada.
 */
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
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

function driverKey(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

async function subscriptionsForDriver(motorista: string): Promise<MobilePushSub[]> {
  const db = getFirestore();
  const snap = await db.collection("sot_mobile_push_subscriptions").where("enabled", "==", true).get();
  const wanted = new Set(
    motorista
      .split(/[,;/]|\se\s/i)
      .map((nome) => driverKey(nome))
      .filter(Boolean),
  );
  if (wanted.size === 0) wanted.add(driverKey(motorista));
  const out: MobilePushSub[] = [];
  snap.forEach((doc) => {
    const row = doc.data() as PushSubscriptionDoc;
    const key = driverKey(String(row.motorista ?? ""));
    const endpoint = String(row.endpoint ?? "");
    const p256dh = String(row.keys?.p256dh ?? "");
    const auth = String(row.keys?.auth ?? "");
    if (!wanted.has(key) || !endpoint || !p256dh || !auth) return;
    out.push({ endpoint, keys: { p256dh, auth } });
  });
  return out;
}

export const notifyLocationRequest = onDocumentWritten(
  {
    document: "sot_state/solicitacaoLocalizacao",
    region: "southamerica-east1",
    secrets: [WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY, WEB_PUSH_SUBJECT],
  },
  async (event) => {
    const next = readSolicitacao(event.data?.after?.data());
    const prev = readSolicitacao(event.data?.before?.data());
    const id = String(next?.id ?? "").trim();
    const placa = String(next?.placa ?? "").trim();
    const motorista = String(next?.motorista ?? "").trim();
    const status = String(next?.status ?? "");
    if (!id || !placa || !motorista || status !== "pendente") return;
    if (prev && String(prev.id ?? "") === id && String(prev.status ?? "") === "pendente") return;

    ensureAdminApp();
    if (!(await loadWebPushConfig())) {
      logger.warn("notifyLocationRequest sem chaves WEB_PUSH_VAPID.");
      return;
    }
    const subs = await subscriptionsForDriver(motorista);
    if (subs.length === 0) {
      logger.warn("notifyLocationRequest sem celular registrado", { motorista });
      return;
    }
    const webpush = (await import("web-push")).default;
    const payload = JSON.stringify({
      kind: "location-call",
      title: "Enviar localização para HNMD",
      body: `Viatura ${placa}. Toque para enviar ou recusar.`,
      tag: `sot-location-call-${id}`,
      url: "mobile.html#/saidas/administrativas",
    });
    const results = await Promise.allSettled(
      subs.map((sub) => webpush.sendNotification(sub, payload, { TTL: 120, urgency: "high" })),
    );
    const failed = results.filter((row) => row.status === "rejected").length;
    logger.info("notifyLocationRequest", { placa, sent: results.length - failed, failed });
  },
);
