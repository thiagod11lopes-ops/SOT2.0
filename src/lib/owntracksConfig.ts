/**
 * Configuração OwnTracks (iPhone/Android) — alternativa grátis ao app SOT nativo iOS.
 *
 * Fluxo:
 *  1. Admin gera 1 token partilhado em Configurações → "Mobile — rastreamento (GPS)".
 *  2. Admin adiciona o nome de cada motorista com iPhone (apenas o nome — a placa é dinâmica).
 *  3. Para cada motorista, gera um QR e envia-lhe (WhatsApp/email/imagem no ecrã).
 *  4. Motorista instala OwnTracks (App Store), lê o QR uma única vez. Fica configurado.
 *  5. **Diariamente:** o motorista usa o SOT mobile (Safari/Android) para escolher placa
 *     e tocar "Iniciar Saída" como sempre — isto grava em Firestore qual a placa actual.
 *  6. Em paralelo o motorista coloca o OwnTracks em modo "Move" no início da viagem
 *     e "Quiet" no fim.
 *  7. OwnTracks envia POST → Cloud Function descobre placa actual do motorista (via
 *     `motorista_active_assignments`) → escreve em `driver_active_locations`.
 */

import { normalizeDriverKey } from "./vistoriaInspectionShared";

export type OwntracksBinding = {
  motorista: string;
  updatedAt: number;
};

export type OwntracksConfigState = {
  /** Token partilhado usado por todos os iPhones para autenticar com a Cloud Function. */
  token: string;
  /** Vínculos motorista→placa para geração de QRs. */
  bindings: OwntracksBinding[];
};

export const OWNTRACKS_TOKEN_MIN_LENGTH = 24;
export const OWNTRACKS_LS_KEY = "sot_owntracks_config_v1";

/** Gera um token cripto-aleatório, base64url, com 32 bytes (≈ 43 chars seguros). */
export function generateOwntracksSharedToken(): string {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function normalizeOwntracksBinding(raw: unknown): OwntracksBinding | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const motorista = String(o.motorista ?? "").trim();
  if (!motorista) return null;
  const ts = Number(o.updatedAt);
  return {
    motorista,
    updatedAt: Number.isFinite(ts) && ts > 0 ? ts : Date.now(),
  };
}

export function normalizeOwntracksConfigState(raw: unknown): OwntracksConfigState {
  if (!raw || typeof raw !== "object") {
    return { token: "", bindings: [] };
  }
  const o = raw as Record<string, unknown>;
  const token = typeof o.token === "string" ? o.token.trim() : "";
  const list = Array.isArray(o.bindings) ? o.bindings : [];
  const bindings = list
    .map(normalizeOwntracksBinding)
    .filter((x): x is OwntracksBinding => !!x);
  // Dedupe por nome do motorista (manter o mais recente)
  const seen = new Map<string, OwntracksBinding>();
  for (const b of bindings.sort((a, b) => b.updatedAt - a.updatedAt)) {
    const key = normalizeDriverKey(b.motorista);
    if (!seen.has(key)) seen.set(key, b);
  }
  return { token, bindings: Array.from(seen.values()) };
}

export function loadOwntracksConfigFromLocalStorage(): OwntracksConfigState {
  if (typeof localStorage === "undefined") return { token: "", bindings: [] };
  try {
    const raw = localStorage.getItem(OWNTRACKS_LS_KEY);
    return raw ? normalizeOwntracksConfigState(JSON.parse(raw)) : { token: "", bindings: [] };
  } catch {
    return { token: "", bindings: [] };
  }
}

export function persistOwntracksConfigToLocalStorage(state: OwntracksConfigState): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(OWNTRACKS_LS_KEY, JSON.stringify(normalizeOwntracksConfigState(state)));
  } catch {
    /* ignore */
  }
}

/** Slug compatível com OwnTracks (a–z, 0–9, hífens), max 64 chars. */
export function slugifyMotoristaName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/**
 * Constrói o JSON de configuração que o OwnTracks consome ao ler um QR code.
 *
 * Campos OwnTracks relevantes:
 *  - `mode: 3` → HTTP (não MQTT)
 *  - `url` → endpoint da Cloud Function, com `?motorista=joao-silva` (sem placa: dinâmica)
 *  - `auth: true` + `username` + `password` → Basic Auth (password = token partilhado)
 *  - `pubInterval` → segundos entre publicações (o app respeita aproximadamente)
 *  - `monitoring: 1` → "Significant" como modo inicial (poupa bateria; o motorista
 *    muda para "Move" no início da viagem)
 *  - `tid` → 2 chars usados como abreviação visual no app (iniciais do motorista)
 */
export function buildOwntracksConfigJson(args: {
  endpointUrl: string;
  motorista: string;
  token: string;
  intervalSeconds: number;
}): Record<string, unknown> {
  const motoristaSlug = slugifyMotoristaName(args.motorista) || "anon";
  const urlObj = new URL(args.endpointUrl);
  urlObj.searchParams.set("motorista", motoristaSlug);
  const tid = args.motorista
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "??";
  return {
    _type: "configuration",
    mode: 3,
    url: urlObj.toString(),
    auth: true,
    username: motoristaSlug,
    password: args.token,
    deviceId: motoristaSlug,
    tid,
    pubInterval: Math.max(60, Math.floor(args.intervalSeconds)),
    locatorInterval: Math.max(60, Math.floor(args.intervalSeconds)),
    monitoring: 1,
    cmd: false,
    autostartOnBoot: true,
    extendedData: true,
    pubExtendedData: true,
    notificationLocation: false,
    notificationEvents: true,
    pubQos: 1,
    pubRetain: false,
    cleanSession: true,
  };
}

/** Conteúdo recomendado para o QR code: o JSON completo (OwnTracks aceita directamente). */
export function buildOwntracksQrPayload(config: Record<string, unknown>): string {
  return JSON.stringify(config);
}
