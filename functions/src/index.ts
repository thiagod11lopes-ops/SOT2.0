import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import webpush from "web-push";

initializeApp();

type AlarmesConfig = {
  beforeDepartureEnabled?: boolean;
  beforeDepartureMinutes?: number;
  vistoriaPendenteEnabled?: boolean;
  vistoriaPendenteTime?: string;
};

type PushSubscriptionDoc = {
  motorista?: string;
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  enabled?: boolean;
};

const DEFAULT_CONFIG: Required<AlarmesConfig> = {
  beforeDepartureEnabled: false,
  beforeDepartureMinutes: 15,
  vistoriaPendenteEnabled: false,
  vistoriaPendenteTime: "14:00",
};
const WEB_PUSH_VAPID_PUBLIC_KEY = defineSecret("WEB_PUSH_VAPID_PUBLIC_KEY");
const WEB_PUSH_VAPID_PRIVATE_KEY = defineSecret("WEB_PUSH_VAPID_PRIVATE_KEY");
const WEB_PUSH_SUBJECT = defineSecret("WEB_PUSH_SUBJECT");
const ALARM_TZ = "America/Sao_Paulo";

function driverKey(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parsePtBrDateTime(datePtBr: string, timeHhMm: string): Date | null {
  const dm = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(datePtBr || "").trim());
  const tm = /^(\d{2}):(\d{2})$/.exec(String(timeHhMm || "").trim());
  if (!dm || !tm) return null;
  const day = Number(dm[1]);
  const month = Number(dm[2]) - 1;
  const year = Number(dm[3]);
  const hour = Number(tm[1]);
  const minute = Number(tm[2]);
  if (![day, month, year, hour, minute].every(Number.isFinite)) return null;
  return new Date(year, month, day, hour, minute, 0, 0);
}

function loadWebPushConfig(): boolean {
  const publicKey = String(WEB_PUSH_VAPID_PUBLIC_KEY.value() || "").trim();
  const privateKey = String(WEB_PUSH_VAPID_PRIVATE_KEY.value() || "").trim();
  const subject = String(WEB_PUSH_SUBJECT.value() || "mailto:admin@sot.local").trim();
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

async function readAlarmesConfig(): Promise<Required<AlarmesConfig>> {
  const db = getFirestore();
  const snap = await db.collection("sot_state").doc("alarmesConfig").get();
  const payload = (snap.data()?.payload ?? {}) as AlarmesConfig;
  const minutes = Number(payload.beforeDepartureMinutes);
  const time = String(payload.vistoriaPendenteTime ?? DEFAULT_CONFIG.vistoriaPendenteTime);
  return {
    beforeDepartureEnabled: Boolean(payload.beforeDepartureEnabled),
    beforeDepartureMinutes: Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : DEFAULT_CONFIG.beforeDepartureMinutes,
    vistoriaPendenteEnabled: Boolean(payload.vistoriaPendenteEnabled),
    vistoriaPendenteTime: /^\d{2}:\d{2}$/.test(time) ? time : DEFAULT_CONFIG.vistoriaPendenteTime,
  };
}

async function readPushSubscriptions(): Promise<Map<string, webpush.PushSubscription[]>> {
  const db = getFirestore();
  const snap = await db.collection("sot_mobile_push_subscriptions").where("enabled", "==", true).get();
  const out = new Map<string, webpush.PushSubscription[]>();
  snap.forEach((d) => {
    const row = d.data() as PushSubscriptionDoc;
    const motorista = driverKey(String(row.motorista ?? ""));
    const endpoint = String(row.endpoint ?? "");
    const p256dh = String(row.keys?.p256dh ?? "");
    const auth = String(row.keys?.auth ?? "");
    if (!motorista || !endpoint || !p256dh || !auth) return;
    if (!out.has(motorista)) out.set(motorista, []);
    out.get(motorista)!.push({ endpoint, keys: { p256dh, auth } });
  });
  return out;
}

function buildDepartureCandidates(rows: Array<Record<string, unknown>>): Array<{ motorista: string; text: string; fireAt: Date }> {
  const out: Array<{ motorista: string; text: string; fireAt: Date }> = [];
  for (const row of rows) {
    const motoristasField = String(row.motoristas ?? "");
    const date = String(row.dataSaida || row.dataPedido || "").trim();
    const time = String(row.horaSaida || row.horaPedido || "").trim();
    const dt = parsePtBrDateTime(date, time);
    if (!dt) continue;
    const tokens = motoristasField
      .split(/[;,/]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    for (const motorista of tokens) {
      out.push({ motorista: driverKey(motorista), text: `Saída às ${time}`, fireAt: dt });
    }
  }
  return out;
}

async function sendPushToDriver(
  motorista: string,
  title: string,
  body: string,
  subscriptionsByDriver: Map<string, webpush.PushSubscription[]>,
): Promise<void> {
  const subs = subscriptionsByDriver.get(driverKey(motorista)) ?? [];
  if (subs.length === 0) return;
  const payload = JSON.stringify({
    title,
    body,
    tag: `sot-${driverKey(motorista)}`,
    url: "/mobile.html#/saidas/administrativas",
  });
  await Promise.allSettled(subs.map((s) => webpush.sendNotification(s, payload)));
}

function dateKeyFromLocal(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getSaoPauloNowParts(now: Date): { dayKey: string; hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: ALARM_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const values = new Map(parts.map((p) => [p.type, p.value]));
  const year = values.get("year") ?? "0000";
  const month = values.get("month") ?? "01";
  const day = values.get("day") ?? "01";
  const hour = Number(values.get("hour") ?? "0");
  const minute = Number(values.get("minute") ?? "0");
  return {
    dayKey: `${year}-${month}-${day}`,
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

export const processMobileAlarmPush = onSchedule(
  {
    schedule: "every 1 minutes",
    region: "southamerica-east1",
    timeZone: "America/Sao_Paulo",
    secrets: [WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY, WEB_PUSH_SUBJECT],
  },
  async () => {
    if (!loadWebPushConfig()) {
      logger.warn("WEB_PUSH_VAPID_PUBLIC_KEY/PRIVATE_KEY não configuradas.");
      return;
    }
    const db = getFirestore();
    const config = await readAlarmesConfig();
    const subscriptionsByDriver = await readPushSubscriptions();
    if (subscriptionsByDriver.size === 0) return;

    const now = new Date();
    const nowMs = now.getTime();
    const saoPauloNow = getSaoPauloNowParts(now);
    const dayKey = saoPauloNow.dayKey;

    if (config.beforeDepartureEnabled) {
      const depSnap = await db.collection("departures").get();
      const rows = depSnap.docs.map((d) => d.data() as Record<string, unknown>);
      const candidates = buildDepartureCandidates(rows);
      const leadMs = Math.max(0, config.beforeDepartureMinutes) * 60_000;
      for (const c of candidates) {
        const fireAtMs = c.fireAt.getTime() - leadMs;
        const diff = nowMs - fireAtMs;
        if (diff < 0 || diff > 60_000) continue;
        await sendPushToDriver(
          c.motorista,
          "Alarme de saída",
          `${c.motorista}: ${c.text} (${config.beforeDepartureMinutes} min antes).`,
          subscriptionsByDriver,
        );
      }
    }

    if (config.vistoriaPendenteEnabled) {
      const [hh, mm] = config.vistoriaPendenteTime.split(":").map((x) => Number(x));
      const shouldRunNow = saoPauloNow.hour === hh && saoPauloNow.minute === mm;
      if (shouldRunNow) {
        const vistoriaState = (await db.collection("sot_state").doc("vistoria").get()).data()?.payload as
          | { inspections?: Array<{ inspectionDate?: string; motorista?: string; viatura?: string }>; assignments?: Array<{ motorista?: string; viatura?: string }> }
          | undefined;
        const detalhe = (await db.collection("sot_state").doc("detalheServico").get()).data()?.payload as
          | { sheets?: Record<string, Record<string, Record<string, string>>> }
          | undefined;
        const monthKey = dayKey.slice(0, 7);
        const day = String(Number(dayKey.slice(8, 10)));
        const monthSheet = detalhe?.sheets?.[monthKey] ?? {};
        const assignments = vistoriaState?.assignments ?? [];
        const inspections = vistoriaState?.inspections ?? [];
        const assignmentsByDriver = new Map<string, string[]>();
        for (const a of assignments) {
          const dKey = driverKey(String(a.motorista ?? ""));
          const v = String(a.viatura ?? "").trim();
          if (!dKey || !v) continue;
          if (!assignmentsByDriver.has(dKey)) assignmentsByDriver.set(dKey, []);
          assignmentsByDriver.get(dKey)!.push(v);
        }
        for (const [driver, subs] of subscriptionsByDriver.entries()) {
          if (subs.length === 0) continue;
          const row = Object.entries(monthSheet).find(([name]) => driverKey(name) === driver);
          if (!row) continue;
          const cell = String(row[1]?.[day] ?? "").toUpperCase();
          if (!/(^|[\s/])S([\s/]|$)/.test(cell)) continue;
          const expectedViaturas = assignmentsByDriver.get(driver) ?? [];
          if (expectedViaturas.length === 0) continue;
          const pending = expectedViaturas.filter(
            (v) =>
              !inspections.some(
                (i) =>
                  String(i.inspectionDate ?? "") === dayKey &&
                  driverKey(String(i.motorista ?? "")) === driver &&
                  String(i.viatura ?? "").trim().toLowerCase() === v.trim().toLowerCase(),
              ),
          );
          if (pending.length === 0) continue;
          await sendPushToDriver(
            driver,
            "Alarme de vistoria pendente",
            `Há viatura(s) pendente(s): ${pending.join(", ")}.`,
            subscriptionsByDriver,
          );
        }
      }
    }

    await db.collection("sot_state").doc("alarmesPushHeartbeat").set({
      payload: { ranAt: Timestamp.now(), dayKey },
    });
    logger.info("processMobileAlarmPush tick", {
      dayKey,
      hour: saoPauloNow.hour,
      minute: saoPauloNow.minute,
      subscriptions: subscriptionsByDriver.size,
      beforeDepartureEnabled: config.beforeDepartureEnabled,
      vistoriaPendenteEnabled: config.vistoriaPendenteEnabled,
      vistoriaPendenteTime: config.vistoriaPendenteTime,
    });
  },
);
