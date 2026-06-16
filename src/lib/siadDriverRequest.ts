import { parseHhMm } from "./timeInput";
import type { DepartureRecord } from "../types/departure";

export type SiadDriverRequestStatus = "requested" | "confirmed";

export type SiadDriverRequestRecord = {
  status: SiadDriverRequestStatus;
  requestedAt: number;
  confirmedAt?: number;
};

export type SiadDriverRequestStore = Record<string, SiadDriverRequestRecord>;

export type SiadDriverRequestSlot = {
  dateSaida: string;
  horaSaida: string | null;
  record: SiadDriverRequestRecord;
};

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

function normalizeSectorKey(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/~/g, "")
    .toLowerCase();
}

export function isSiadDeparture(row: DepartureRecord): boolean {
  return normalizeSectorKey(row.setor) === "siad" && row.tipo === "Administrativa";
}

export function normalizeSiadDriverRequestHora(hora: string): string | null {
  const parsed = parseHhMm(hora.trim());
  if (!parsed) return null;
  return `${String(parsed.h).padStart(2, "0")}:${String(parsed.m).padStart(2, "0")}`;
}

export function getSiadDriverRequestSlotKey(dateSaida: string, horaSaida: string): string {
  const date = dateSaida.trim();
  const hora = normalizeSiadDriverRequestHora(horaSaida);
  if (!date) return "";
  if (!hora) return date;
  return `${date}|${hora}`;
}

export function parseSiadDriverRequestSlotKey(key: string): { dateSaida: string; horaSaida: string | null } {
  const idx = key.indexOf("|");
  if (idx === -1) return { dateSaida: key.trim(), horaSaida: null };
  return {
    dateSaida: key.slice(0, idx).trim(),
    horaSaida: key.slice(idx + 1).trim() || null,
  };
}

export function readSiadDriverRequestStore(): SiadDriverRequestStore {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(SIAD_DRIVER_REQUEST_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: SiadDriverRequestStore = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!key.trim() || !value || typeof value !== "object") continue;
      const row = value as Record<string, unknown>;
      const status = row.status;
      const requestedAt = row.requestedAt;
      if (status !== "requested" && status !== "confirmed") continue;
      if (typeof requestedAt !== "number" || !Number.isFinite(requestedAt)) continue;
      const confirmedAt = row.confirmedAt;
      out[key] = {
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

export function getSiadDriverRequestForSlot(
  dateSaida: string,
  horaSaida: string,
): SiadDriverRequestRecord | null {
  const key = getSiadDriverRequestSlotKey(dateSaida, horaSaida);
  if (!key) return null;
  return readSiadDriverRequestStore()[key] ?? null;
}

/** Compatível com pedidos antigos gravados só por data. */
export function getSiadDriverRequestForDate(dateSaida: string): SiadDriverRequestRecord | null {
  const date = dateSaida.trim();
  if (!date) return null;
  const store = readSiadDriverRequestStore();
  if (store[date]) return store[date];
  const prefix = `${date}|`;
  const matches = Object.entries(store).filter(([key]) => key.startsWith(prefix));
  if (matches.length === 1) return matches[0]![1];
  return null;
}

export function listSiadDriverRequestsForDate(dateSaida: string): SiadDriverRequestSlot[] {
  const date = dateSaida.trim();
  if (!date) return [];
  const store = readSiadDriverRequestStore();
  const out: SiadDriverRequestSlot[] = [];
  for (const [key, record] of Object.entries(store)) {
    const slot = parseSiadDriverRequestSlotKey(key);
    if (slot.dateSaida !== date) continue;
    out.push({ dateSaida: slot.dateSaida, horaSaida: slot.horaSaida, record });
  }
  return out.sort((a, b) => {
    const ha = a.horaSaida ?? "";
    const hb = b.horaSaida ?? "";
    return ha.localeCompare(hb, "pt-BR");
  });
}

export function getSiadDepartureTimesForDate(
  departures: DepartureRecord[],
  dateSaida: string,
  includeHora?: string,
): string[] {
  const date = dateSaida.trim();
  const times = new Set<string>();
  for (const row of departures) {
    if (!isSiadDeparture(row)) continue;
    if (row.dataSaida.trim() !== date) continue;
    const hora = normalizeSiadDriverRequestHora(row.horaSaida);
    if (hora) times.add(hora);
  }
  const extra = includeHora ? normalizeSiadDriverRequestHora(includeHora) : null;
  if (extra) times.add(extra);
  return [...times].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function getLatestPendingSiadDriverRequest(): SiadDriverRequestSlot | null {
  const store = readSiadDriverRequestStore();
  let best: SiadDriverRequestSlot | null = null;
  for (const [key, record] of Object.entries(store)) {
    if (record.status !== "requested") continue;
    const slot = parseSiadDriverRequestSlotKey(key);
    const candidate: SiadDriverRequestSlot = {
      dateSaida: slot.dateSaida,
      horaSaida: slot.horaSaida,
      record,
    };
    if (!best || record.requestedAt > best.record.requestedAt) {
      best = candidate;
    }
  }
  return best;
}

export function requestSiadDriver(dateSaida: string, horaSaida: string): boolean {
  const key = getSiadDriverRequestSlotKey(dateSaida, horaSaida);
  if (!key) return false;
  const store = readSiadDriverRequestStore();
  const current = store[key];
  if (current?.status === "confirmed" || current?.status === "requested") return false;
  store[key] = { status: "requested", requestedAt: Date.now() };
  writeSiadDriverRequestStore(store);
  return true;
}

export function confirmSiadDriver(dateSaida: string, horaSaida: string): boolean {
  const key = horaSaida.trim()
    ? getSiadDriverRequestSlotKey(dateSaida, horaSaida)
    : dateSaida.trim();
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

export function confirmSiadDriverSlot(slot: Pick<SiadDriverRequestSlot, "dateSaida" | "horaSaida">): boolean {
  if (slot.horaSaida) return confirmSiadDriver(slot.dateSaida, slot.horaSaida);
  const key = slot.dateSaida.trim();
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

/** Remove todos os pedidos de motorista SIAD da data. */
export function resetSiadDriverRequestForDate(dateSaida: string): number {
  const date = dateSaida.trim();
  if (!date) return 0;
  const store = readSiadDriverRequestStore();
  let removed = 0;
  for (const key of Object.keys(store)) {
    const slot = parseSiadDriverRequestSlotKey(key);
    if (slot.dateSaida !== date) continue;
    delete store[key];
    removed += 1;
  }
  if (removed > 0) writeSiadDriverRequestStore(store);
  return removed;
}

export function resetSiadDriverRequest(dateSaida: string, horaSaida?: string): boolean {
  const date = dateSaida.trim();
  if (!date) return false;
  if (!horaSaida?.trim()) {
    return resetSiadDriverRequestForDate(date) > 0;
  }
  const key = getSiadDriverRequestSlotKey(date, horaSaida);
  if (!key) return false;
  const store = readSiadDriverRequestStore();
  if (!(key in store)) return false;
  delete store[key];
  writeSiadDriverRequestStore(store);
  return true;
}

export function describeSiadDriverRequestStatus(
  record: SiadDriverRequestRecord | null | undefined,
): string {
  if (!record) return "Nenhum pedido registrado";
  if (record.status === "requested") return "Aguardando confirmação no SOT 2.0";
  return "Saída confirmada";
}

export function describeSiadDriverRequestsForDate(dateSaida: string): string {
  const items = listSiadDriverRequestsForDate(dateSaida);
  if (items.length === 0) return "Nenhum pedido registrado";
  if (items.length === 1) {
    const item = items[0]!;
    const hora = item.horaSaida ? ` (${item.horaSaida})` : "";
    return `${describeSiadDriverRequestStatus(item.record)}${hora}`;
  }
  return `${items.length} horários com pedido nesta data`;
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
