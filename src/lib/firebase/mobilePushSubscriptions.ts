import { doc, getFirestore, setDoc, serverTimestamp } from "firebase/firestore";
import { ensureFirebaseAuth } from "./auth";
import { getFirebaseApp, isFirebaseConfigured } from "./config";
import { getSyncClientId } from "./clientIdentity";

type MobilePushSubscriptionDoc = {
  motorista: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent: string;
  enabled: boolean;
  updatedAt: unknown;
};

function sanitizeMotorista(value: string): string {
  return value.trim();
}

function encodeDocId(motorista: string): string {
  return `${getSyncClientId()}__${sanitizeMotorista(motorista).toLowerCase()}`;
}

function parseSubscriptionKeys(subscription: PushSubscription): { p256dh: string; auth: string } | null {
  const json = subscription.toJSON() as {
    keys?: { p256dh?: string; auth?: string };
  };
  const p256dh = String(json.keys?.p256dh ?? "");
  const auth = String(json.keys?.auth ?? "");
  if (!p256dh || !auth) return null;
  return { p256dh, auth };
}

export async function saveMobilePushSubscriptionForMotorista(
  motorista: string,
  subscription: PushSubscription,
): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const motoristaNorm = sanitizeMotorista(motorista);
  if (!motoristaNorm) return;
  const keys = parseSubscriptionKeys(subscription);
  if (!keys) return;
  await ensureFirebaseAuth();
  const db = getFirestore(getFirebaseApp());
  const payload: MobilePushSubscriptionDoc = {
    motorista: motoristaNorm,
    endpoint: subscription.endpoint,
    keys,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    enabled: true,
    updatedAt: serverTimestamp(),
  };
  await setDoc(doc(db, "sot_mobile_push_subscriptions", encodeDocId(motoristaNorm)), payload, { merge: true });
}

export async function disableMobilePushSubscriptionForMotorista(motorista: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const motoristaNorm = sanitizeMotorista(motorista);
  if (!motoristaNorm) return;
  await ensureFirebaseAuth();
  const db = getFirestore(getFirebaseApp());
  await setDoc(
    doc(db, "sot_mobile_push_subscriptions", encodeDocId(motoristaNorm)),
    { enabled: false, updatedAt: serverTimestamp() },
    { merge: true },
  );
}
