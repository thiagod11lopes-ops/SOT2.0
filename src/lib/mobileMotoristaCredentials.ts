import { normalizeDriverKey } from "./vistoriaInspectionShared";

export type MobileMotoristaCredential = {
  motorista: string;
  senha: string;
  updatedAt: number;
};

const STORAGE_KEY = "sot_mobile_motorista_credentials_v1";
const ACTIVE_MOTORISTA_KEY = "sot_mobile_logged_motorista_v1";

function normalizeNameKey(value: string): string {
  return normalizeDriverKey(value);
}

export function loadMobileMotoristaCredentials(): MobileMotoristaCredential[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => ({
        motorista: String(row.motorista ?? "").trim(),
        senha: String(row.senha ?? "").trim(),
        updatedAt: Number(row.updatedAt ?? 0) || 0,
      }))
      .filter((x) => x.motorista.length > 0 && x.senha.length > 0)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function saveMobileMotoristaCredentials(list: MobileMotoristaCredential[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function upsertMobileMotoristaCredential(args: {
  motorista: string;
  senha: string;
  now?: number;
}): MobileMotoristaCredential[] {
  const motorista = args.motorista.trim();
  const senha = args.senha.trim();
  if (!motorista || !senha) return loadMobileMotoristaCredentials();
  const now = args.now ?? Date.now();
  const key = normalizeNameKey(motorista);
  const current = loadMobileMotoristaCredentials();
  const next = current.filter((x) => normalizeNameKey(x.motorista) !== key);
  next.unshift({ motorista, senha, updatedAt: now });
  saveMobileMotoristaCredentials(next);
  return next;
}

export function removeMobileMotoristaCredential(motorista: string): MobileMotoristaCredential[] {
  const key = normalizeNameKey(motorista);
  const current = loadMobileMotoristaCredentials();
  const next = current.filter((x) => normalizeNameKey(x.motorista) !== key);
  saveMobileMotoristaCredentials(next);
  return next;
}

export function findMobileMotoristaCredentialByName(
  motorista: string,
): MobileMotoristaCredential | null {
  const key = normalizeNameKey(motorista);
  const list = loadMobileMotoristaCredentials();
  return list.find((x) => normalizeNameKey(x.motorista) === key) ?? null;
}

export function loadActiveMobileMotorista(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = String(localStorage.getItem(ACTIVE_MOTORISTA_KEY) ?? "").trim();
    return raw || null;
  } catch {
    return null;
  }
}

export function setActiveMobileMotorista(motorista: string | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (!motorista || !motorista.trim()) {
      localStorage.removeItem(ACTIVE_MOTORISTA_KEY);
      return;
    }
    localStorage.setItem(ACTIVE_MOTORISTA_KEY, motorista.trim());
  } catch {
    /* ignore */
  }
}
