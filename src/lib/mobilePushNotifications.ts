export type LocalAlarmNotificationOptions = {
  body: string;
  tag?: string;
  requireInteraction?: boolean;
};

const MOBILE_SW_URL = "/sw-mobile-push.js";

function base64UrlToArrayBuffer(base64Url: string): ArrayBuffer {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out.buffer;
}

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function isServiceWorkerSupported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

export async function ensureMobilePushServiceWorkerRegistered(): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration(MOBILE_SW_URL);
    if (existing) return existing;
    return await navigator.serviceWorker.register(MOBILE_SW_URL, { scope: "/" });
  } catch {
    return null;
  }
}

export async function requestNotificationPermissionIfNeeded(): Promise<NotificationPermission | "unsupported"> {
  if (!isNotificationSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

export async function ensurePushSubscription(): Promise<PushSubscription | null> {
  if (!("PushManager" in window)) return null;
  const registration = await ensureMobilePushServiceWorkerRegistered();
  if (!registration) return null;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;
  const vapidPublicKey = String(import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY ?? "").trim();
  if (!vapidPublicKey) return null;
  try {
    return await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToArrayBuffer(vapidPublicKey),
    });
  } catch {
    return null;
  }
}

export async function clearPushSubscription(): Promise<void> {
  if (!("PushManager" in window)) return;
  const registration = await ensureMobilePushServiceWorkerRegistered();
  if (!registration) return;
  const sub = await registration.pushManager.getSubscription();
  if (!sub) return;
  await sub.unsubscribe();
}

export async function showLocalAlarmNotification(
  title: string,
  options: LocalAlarmNotificationOptions,
): Promise<void> {
  if (!isNotificationSupported()) return;
  if (Notification.permission !== "granted") return;
  const registration = await ensureMobilePushServiceWorkerRegistered();
  if (registration) {
    await registration.showNotification(title, {
      body: options.body,
      tag: options.tag,
      requireInteraction: options.requireInteraction,
      icon: "/icons.svg",
      badge: "/icons.svg",
      data: { source: "sot-mobile-alarm" },
    });
    return;
  }
  void new Notification(title, {
    body: options.body,
    tag: options.tag,
  });
}
