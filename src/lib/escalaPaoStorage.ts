import { addDays, addMonths, eachDayOfInterval, endOfMonth, startOfMonth } from "date-fns";
import { idbGetJson, idbSetJson } from "./indexedDb";
import { isFirebaseOnlyOnlineActive } from "./firebaseOnlyOnlinePolicy";

/** Meses de calendário cobertos pela distribuição (mês inicial + seguintes). */
export const MESES_DISTRIBUICAO_INTEGRANTES = 12;

/** Marcadores de dia útil sem levar pão; deslocam a escala para a frente. */
export const OPCOES_DIA_ESPECIAL = ["Feriado", "RD", "Lic Pag", "Recesso"] as const;
export type DiaEspecialTipo = (typeof OPCOES_DIA_ESPECIAL)[number];

export function isDiaEspecialValor(v: string | undefined | null): v is DiaEspecialTipo {
  const t = typeof v === "string" ? v.trim() : "";
  return (OPCOES_DIA_ESPECIAL as readonly string[]).includes(t);
}

/** Célula sem nome de integrante (vazio, tipo especial ou “Licença” manual). */
export function celulaSemIntegranteEscala(val: string | undefined | null): boolean {
  const t = typeof val === "string" ? val.trim() : "";
  if (!t) return true;
  if (isDiaEspecialValor(t)) return true;
  const n = t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return n === "licenca";
}

export function parseDateKeyLocal(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
  return dt;
}

const IDB_KEY = "sot-escala-pao-v2";
const LEGACY_LS_KEY = "sot-escala-pao-v2";

/** Mapa data local `YYYY-MM-DD` → nome do motorista. */
export type EscalaPaoStored = Record<string, string>;

export function formatDateKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isWeekend(date: Date): boolean {
  const dow = date.getDay();
  return dow === 0 || dow === 6;
}

function weekdayKeysFromInclusive(start: Date, end: Date): string[] {
  const keys: string[] = [];
  for (const day of eachDayOfInterval({ start, end })) {
    if (!isWeekend(day)) keys.push(formatDateKeyLocal(day));
  }
  return keys;
}

/**
 * Define um dia especial no `dateKey` e desloca todos os valores (motoristas e outros)
 * um dia útil para a frente até ao fim do horizonte de distribuição.
 * Se o dia já tinha outro tipo especial, apenas substitui o rótulo (sem novo deslocamento).
 */
export function aplicarDiaEspecialComDeslocamento(
  escala: EscalaPaoStored,
  dateKey: string,
  tipo: DiaEspecialTipo,
): EscalaPaoStored {
  const start = parseDateKeyLocal(dateKey);
  if (!start || isWeekend(start)) return escala;

  const cur = (escala[dateKey] ?? "").trim();
  if (cur === tipo) return escala;

  if (isDiaEspecialValor(cur)) {
    return { ...escala, [dateKey]: tipo };
  }

  const monthStart = startOfMonth(start);
  const endHorizon = endOfMonth(addMonths(monthStart, MESES_DISTRIBUICAO_INTEGRANTES - 1));
  const keys = weekdayKeysFromInclusive(start, endHorizon);
  const idx0 = keys.indexOf(dateKey);
  if (idx0 < 0) return escala;

  const next = { ...escala };
  const olds = keys.map((k) => next[k] ?? "");

  next[dateKey] = tipo;
  for (let i = idx0 + 1; i < keys.length; i++) {
    next[keys[i]] = olds[i - 1];
  }
  return next;
}

/** Índice 0 = segunda … 6 = domingo (semana começa na segunda). */
export function indiceDiaSemanaSegundaPrimeiro(date: Date): number {
  const dow = date.getDay();
  return dow === 0 ? 6 : dow - 1;
}

export function getMotoristaEscalaParaData(escala: EscalaPaoStored, date: Date): string {
  if (isWeekend(date)) return "";
  const k = formatDateKeyLocal(date);
  const v = escala[k];
  if (typeof v !== "string") return "";
  const t = v.trim();
  if (!t) return "";
  if (isDiaEspecialValor(t)) return "";
  return t;
}

/** Texto guardado para o dia (motorista ou tipo especial); vazio em fins de semana ou sem entrada. Para o cabeçalho "Pão". */
export function getValorExibicaoEscalaParaData(escala: EscalaPaoStored, date: Date): string {
  if (isWeekend(date)) return "";
  const k = formatDateKeyLocal(date);
  const v = escala[k];
  if (typeof v !== "string") return "";
  return v.trim();
}

export type ProximoIntegranteEscala = { nome: string; data: Date };

/**
 * A partir de amanhã (relativamente a `hoje`), devolve o próximo dia com nome de integrante real.
 * Ignora sábados, domingos, células vazias e marcadores (Feriado, RD, Lic Pag, Recesso, Licença).
 */
export function getProximoIntegranteEscalaAposHoje(
  escala: EscalaPaoStored,
  hoje: Date,
): ProximoIntegranteEscala | null {
  let d = addDays(hoje, 1);
  const maxSteps = 800;
  for (let step = 0; step < maxSteps; step++) {
    if (isWeekend(d)) {
      d = addDays(d, 1);
      continue;
    }
    const k = formatDateKeyLocal(d);
    const raw = escala[k];
    if (celulaSemIntegranteEscala(raw)) {
      d = addDays(d, 1);
      continue;
    }
    const nome = typeof raw === "string" ? raw.trim() : "";
    if (!nome) {
      d = addDays(d, 1);
      continue;
    }
    return { nome, data: d };
  }
  return null;
}

function isValidDateKey(key: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(key);
}

function normalizeEscala(raw: unknown): EscalaPaoStored {
  if (!raw || typeof raw !== "object") return {};
  const out: EscalaPaoStored = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isValidDateKey(k)) continue;
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function readLegacyEscalaFromLocalStorage(): EscalaPaoStored {
  if (isFirebaseOnlyOnlineActive()) return {};
  try {
    if (typeof localStorage === "undefined") return {};
    const v2 = localStorage.getItem(LEGACY_LS_KEY);
    if (v2) return normalizeEscala(JSON.parse(v2));
  } catch {
    /* ignore */
  }
  return {};
}

function clearLegacyEscalaLocalStorage(): void {
  if (isFirebaseOnlyOnlineActive()) return;
  try {
    localStorage.removeItem(LEGACY_LS_KEY);
  } catch {
    /* ignore */
  }
}

export async function loadEscalaPaoFromIdb(): Promise<EscalaPaoStored> {
  const raw = await idbGetJson<unknown>(IDB_KEY);
  if (raw && typeof raw === "object") {
    return normalizeEscala(raw);
  }
  const leg = readLegacyEscalaFromLocalStorage();
  if (Object.keys(leg).length > 0) {
    await idbSetJson(IDB_KEY, leg);
    clearLegacyEscalaLocalStorage();
    return leg;
  }
  return {};
}

export async function saveEscalaPaoToIdb(escala: EscalaPaoStored): Promise<void> {
  await idbSetJson(IDB_KEY, escala, { maxAttempts: 6 });
}

/**
 * Reparte motoristas nos dias úteis a partir de `diaInicioMes` (1–31) no mês base e continua a mesma sequência
 * (round-robin) nos meses seguintes, até perfazer {@link MESES_DISTRIBUICAO_INTEGRANTES} meses de calendário.
 * Sábados e domingos ignorados. No primeiro mês, dias anteriores a `diaInicioMes` ficam em branco.
 * Substitui todas as entradas nesse intervalo de meses; mantém datas fora dele em `existing`.
 */
export function distribuirMotoristasNoMes(
  year: number,
  monthIndex: number,
  motoristas: string[],
  existing: EscalaPaoStored,
  diaInicioMes: number = 1,
): EscalaPaoStored {
  const list = motoristas.map((m) => m.trim()).filter(Boolean);
  const next: EscalaPaoStored = { ...existing };

  for (let mi = 0; mi < MESES_DISTRIBUICAO_INTEGRANTES; mi++) {
    const monthDate = addMonths(new Date(year, monthIndex, 1), mi);
    const ym = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}-`;
    for (const k of Object.keys(next)) {
      if (k.startsWith(ym)) delete next[k];
    }
  }

  if (list.length === 0) return next;

  const lastDayFirst = endOfMonth(new Date(year, monthIndex, 1)).getDate();
  const inicio = Math.min(Math.max(1, Math.floor(diaInicioMes)), lastDayFirst);

  const rangeStart = new Date(year, monthIndex, inicio);
  const rangeEnd = endOfMonth(
    addMonths(new Date(year, monthIndex, 1), MESES_DISTRIBUICAO_INTEGRANTES - 1),
  );

  let i = 0;
  for (const day of eachDayOfInterval({ start: rangeStart, end: rangeEnd })) {
    if (isWeekend(day)) continue;
    next[formatDateKeyLocal(day)] = list[i % list.length];
    i++;
  }
  return next;
}
