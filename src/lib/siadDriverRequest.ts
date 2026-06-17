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
    return parseSiadDriverRequestStore(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function parseSiadDriverRequestStore(parsed: unknown): SiadDriverRequestStore {
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
}

/** Mescla pedidos locais e remotos preservando confirmações e timestamps mais recentes. */
export function mergeSiadDriverRequestStores(
  base: SiadDriverRequestStore,
  incoming: SiadDriverRequestStore,
): SiadDriverRequestStore {
  const out: SiadDriverRequestStore = { ...base };
  for (const [key, incomingRec] of Object.entries(incoming)) {
    const prev = out[key];
    if (!prev) {
      out[key] = incomingRec;
      continue;
    }
    if (incomingRec.status === "confirmed" && prev.status === "requested") {
      out[key] = incomingRec;
      continue;
    }
    if (prev.status === "confirmed" && incomingRec.status === "requested") {
      continue;
    }
    if (incomingRec.requestedAt >= prev.requestedAt) {
      out[key] = incomingRec;
    }
  }
  return out;
}

export type SiadDriverRequestWriteOptions = {
  skipCloud?: boolean;
  /** Chaves removidas localmente (reset/exclusão) — devem sumir também na nuvem. */
  removedKeys?: string[];
};

let cloudPushListener:
  | ((store: SiadDriverRequestStore, options?: SiadDriverRequestWriteOptions) => void)
  | null = null;

export function setSiadDriverRequestCloudPushListener(
  listener: ((store: SiadDriverRequestStore, options?: SiadDriverRequestWriteOptions) => void) | null,
): void {
  cloudPushListener = listener;
}

function writeSiadDriverRequestStore(
  store: SiadDriverRequestStore,
  options?: SiadDriverRequestWriteOptions,
) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SIAD_DRIVER_REQUEST_STORAGE_KEY, JSON.stringify(store));
  notifyChanged();
  if (!options?.skipCloud && cloudPushListener) {
    cloudPushListener(store, options);
  }
}

/** Aplica snapshot remoto (Firestore) no armazenamento local sem reenviar à nuvem. */
export function applySiadDriverRequestStoreFromRemote(store: SiadDriverRequestStore) {
  writeSiadDriverRequestStore(store, { skipCloud: true });
}

export function getSiadDriverRequestForSlot(
  dateSaida: string,
  horaSaida: string,
): SiadDriverRequestRecord | null {
  const key = getSiadDriverRequestSlotKey(dateSaida, horaSaida);
  if (!key) return null;
  return readSiadDriverRequestStore()[key] ?? null;
}

/** Saídas SIAD ativas (não canceladas) para data + horário. */
export function collectSiadDeparturesForSlot(
  departures: DepartureRecord[],
  dateSaida: string,
  horaSaida: string,
): DepartureRecord[] {
  const date = dateSaida.trim();
  const targetHora = normalizeSiadDriverRequestHora(horaSaida);
  if (!date || !targetHora) return [];
  return departures.filter((row) => {
    if (!isSiadDeparture(row) || row.cancelada) return false;
    if (row.dataSaida.trim() !== date) return false;
    const rowHora = normalizeSiadDriverRequestHora(row.horaSaida) ?? row.horaSaida.trim();
    return rowHora === targetHora;
  });
}

/**
 * Pedido de motorista anterior a um novo cadastro no mesmo horário (ex.: após exclusão)
 * não deve reaparecer como confirmado/solicitado.
 *
 * Pedidos «requested» sem saídas visíveis no slot são mantidos (ex.: sync ainda em andamento
 * no SOT 2.0) para o modal não fechar antes da confirmação.
 */
export function isSiadDriverRequestStale(
  record: SiadDriverRequestRecord,
  slotDepartures: DepartureRecord[],
): boolean {
  if (slotDepartures.length === 0) {
    return record.status === "confirmed";
  }
  const oldestCreated = Math.min(...slotDepartures.map((row) => row.createdAt));
  return record.requestedAt < oldestCreated;
}

/** Pedido sem saída SIAD correspondente (ex.: saídas excluídas). */
export function isSiadDriverRequestOrphaned(
  slot: { dateSaida: string; horaSaida: string | null },
  departures: DepartureRecord[],
): boolean {
  const date = slot.dateSaida.trim();
  if (!date) return true;
  if (!slot.horaSaida) {
    return getSiadDepartureTimesForDate(departures, date).length === 0;
  }
  return collectSiadDeparturesForSlot(departures, date, slot.horaSaida).length === 0;
}

/** Remove pedidos cujo horário/data já não tem saída SIAD cadastrada. */
export function purgeOrphanedSiadDriverRequests(departures: DepartureRecord[]): number {
  const store = readSiadDriverRequestStore();
  const removedKeys: string[] = [];
  for (const key of Object.keys(store)) {
    const slot = parseSiadDriverRequestSlotKey(key);
    if (isSiadDriverRequestOrphaned(slot, departures)) {
      delete store[key];
      removedKeys.push(key);
    }
  }
  if (removedKeys.length > 0) writeSiadDriverRequestStore(store, { removedKeys });
  return removedKeys.length;
}

/** Após excluir saída SIAD, limpa o pedido do slot se não restou nenhuma saída no horário. */
export function syncSiadDriverRequestAfterDepartureRemoved(
  removed: DepartureRecord,
  departuresAfterRemove: DepartureRecord[],
): void {
  if (!isSiadDeparture(removed) || removed.cancelada) return;
  const date = removed.dataSaida.trim();
  const hora = normalizeSiadDriverRequestHora(removed.horaSaida);
  if (!date || !hora) return;
  if (collectSiadDeparturesForSlot(departuresAfterRemove, date, hora).length > 0) return;
  resetSiadDriverRequest(date, hora);
}

/** Lê o pedido do slot e remove automaticamente se for de uma saída já excluída/substituída. */
export function resolveSiadDriverRequestForSlot(
  dateSaida: string,
  horaSaida: string,
  departures: DepartureRecord[],
): SiadDriverRequestRecord | null {
  const key = getSiadDriverRequestSlotKey(dateSaida, horaSaida);
  if (!key) return null;
  const store = readSiadDriverRequestStore();
  const record = store[key];
  if (!record) return null;

  const slotDepartures = collectSiadDeparturesForSlot(departures, dateSaida, horaSaida);
  if (!isSiadDriverRequestStale(record, slotDepartures)) return record;

  delete store[key];
  writeSiadDriverRequestStore(store, { removedKeys: [key] });
  return null;
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

export function listSiadDriverRequestsForDate(
  dateSaida: string,
  departures?: DepartureRecord[],
): SiadDriverRequestSlot[] {
  const date = dateSaida.trim();
  if (!date) return [];
  if (departures) {
    purgeOrphanedSiadDriverRequests(departures);
  }
  const store = readSiadDriverRequestStore();
  const out: SiadDriverRequestSlot[] = [];
  for (const [key, record] of Object.entries(store)) {
    const slot = parseSiadDriverRequestSlotKey(key);
    if (slot.dateSaida !== date) continue;
    if (departures && isSiadDriverRequestOrphaned(slot, departures)) continue;
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
): string[] {
  const date = dateSaida.trim();
  const times = new Set<string>();
  for (const row of departures) {
    if (!isSiadDeparture(row) || row.cancelada) continue;
    if (row.dataSaida.trim() !== date) continue;
    const hora = normalizeSiadDriverRequestHora(row.horaSaida);
    if (hora) times.add(hora);
  }
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

export function requestSiadDriver(
  dateSaida: string,
  horaSaida: string,
  departures?: DepartureRecord[],
): boolean {
  if (departures) {
    resolveSiadDriverRequestForSlot(dateSaida, horaSaida, departures);
    if (collectSiadDeparturesForSlot(departures, dateSaida, horaSaida).length === 0) {
      return false;
    }
  }
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
  const removedKeys: string[] = [];
  for (const key of Object.keys(store)) {
    const slot = parseSiadDriverRequestSlotKey(key);
    if (slot.dateSaida !== date) continue;
    delete store[key];
    removedKeys.push(key);
  }
  if (removedKeys.length > 0) writeSiadDriverRequestStore(store, { removedKeys });
  return removedKeys.length;
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
  writeSiadDriverRequestStore(store, { removedKeys: [key] });
  return true;
}

export function describeSiadDriverRequestStatus(
  record: SiadDriverRequestRecord | null | undefined,
): string {
  if (!record) return "Nenhum pedido registrado";
  if (record.status === "requested") return "Aguardando confirmação no SOT 2.0";
  return "Saída confirmada";
}

export function describeSiadDriverRequestsForDate(
  dateSaida: string,
  departures?: DepartureRecord[],
): string {
  const items = listSiadDriverRequestsForDate(dateSaida, departures);
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
