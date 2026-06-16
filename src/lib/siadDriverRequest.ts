export type SiadDriverRequestStatus = "requested" | "confirmed";

export type SiadDriverRequestRecord = {
  status: SiadDriverRequestStatus;
  requestedAt: number;
  confirmedAt?: number;
};

export type SiadDriverRequestStore = Record<string, SiadDriverRequestRecord>;

export const SIAD_DRIVER_REQUEST_STORAGE_KEY = "sot:siad-driver-request-v1";
export const SIAD_DRIVER_REQUEST_CHANGED_EVENT = "sot:siad-driver-request-changed";
const SIAD_DRIVER_REQUEST_BC_CHANNEL = "sot-siad-driver-request-v1";

let broadcastChannel: BroadcastChannel | null = null;

function getSiadDriverRequestBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!broadcastChannel) {
    broadcastChannel = new BroadcastChannel(SIAD_DRIVER_REQUEST_BC_CHANNEL);
  }
  return broadcastChannel;
}

function notifyChanged() {
  if (typeof window === "undefined") return;
  const payload = { ts: Date.now() };
  try {
    window.localStorage.setItem(`${SIAD_DRIVER_REQUEST_STORAGE_KEY}:ping`, String(payload.ts));
    window.localStorage.removeItem(`${SIAD_DRIVER_REQUEST_STORAGE_KEY}:ping`);
  } catch {
    /* ignore */
  }
  try {
    getSiadDriverRequestBroadcastChannel()?.postMessage(payload);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(SIAD_DRIVER_REQUEST_CHANGED_EVENT, { detail: payload }));
}

export function readSiadDriverRequestStore(): SiadDriverRequestStore {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(SIAD_DRIVER_REQUEST_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: SiadDriverRequestStore = {};
    for (const [date, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!date.trim() || !value || typeof value !== "object") continue;
      const row = value as Record<string, unknown>;
      const status = row.status;
      const requestedAt = row.requestedAt;
      if (status !== "requested" && status !== "confirmed") continue;
      if (typeof requestedAt !== "number" || !Number.isFinite(requestedAt)) continue;
      const confirmedAt = row.confirmedAt;
      out[date] = {
        status,
        requestedAt,
        confirmedAt:
          typeof confirmedAt === "number" && Number.isFinite(confirmedAt) ? confirmedAt : undefined,
      };
    }
    return out;
  } catch {
    return {};
  }
}

function writeSiadDriverRequestStore(store: SiadDriverRequestStore) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SIAD_DRIVER_REQUEST_STORAGE_KEY, JSON.stringify(store));
  notifyChanged();
}

export function getSiadDriverRequestForDate(dateSaida: string): SiadDriverRequestRecord | null {
  const key = dateSaida.trim();
  if (!key) return null;
  return readSiadDriverRequestStore()[key] ?? null;
}

export function getLatestPendingSiadDriverRequest(): { dateSaida: string; record: SiadDriverRequestRecord } | null {
  const store = readSiadDriverRequestStore();
  let best: { dateSaida: string; record: SiadDriverRequestRecord } | null = null;
  for (const [dateSaida, record] of Object.entries(store)) {
    if (record.status !== "requested") continue;
    if (!best || record.requestedAt > best.record.requestedAt) {
      best = { dateSaida, record };
    }
  }
  return best;
}

export function requestSiadDriver(dateSaida: string): boolean {
  const key = dateSaida.trim();
  if (!key) return false;
  const store = readSiadDriverRequestStore();
  const current = store[key];
  if (current?.status === "confirmed" || current?.status === "requested") return false;
  store[key] = { status: "requested", requestedAt: Date.now() };
  writeSiadDriverRequestStore(store);
  return true;
}

export function confirmSiadDriver(dateSaida: string): boolean {
  const key = dateSaida.trim();
  if (!key) return false;
  const store = readSiadDriverRequestStore();
  const current = store[key];
  if (!current || current.status !== "requested") return false;
  store[key] = {
    status: "confirmed",
    requestedAt: current.requestedAt,
    confirmedAt: Date.now(),
  };
  writeSiadDriverRequestStore(store);
  return true;
}

export function subscribeSiadDriverRequestChanges(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  const onCustom = () => onChange();
  const onStorage = (event: StorageEvent) => {
    if (event.key === SIAD_DRIVER_REQUEST_STORAGE_KEY || event.key === `${SIAD_DRIVER_REQUEST_STORAGE_KEY}:ping`) {
      onChange();
    }
  };
  const onBroadcast = () => onChange();
  const onFocus = () => onChange();
  const onVisibility = () => {
    if (document.visibilityState === "visible") onChange();
  };

  const channel = getSiadDriverRequestBroadcastChannel();
  channel?.addEventListener("message", onBroadcast);

  window.addEventListener(SIAD_DRIVER_REQUEST_CHANGED_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    channel?.removeEventListener("message", onBroadcast);
    window.removeEventListener(SIAD_DRIVER_REQUEST_CHANGED_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
