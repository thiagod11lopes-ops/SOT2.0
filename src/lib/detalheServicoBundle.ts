import { idbGetJson, idbSetJson } from "./indexedDb";
import { isFirebaseOnlyOnlineActive } from "./firebaseOnlyOnlinePolicy";
import type {
  DetalheServicoRodapeAssinatura,
  DetalheServicoSheetSnapshot,
} from "./generateDetalheServicoMotoristaPdf";

/** Período de férias (datas inclusivas, ISO `YYYY-MM-DD`). */
export type DetalheServicoFeriasPeriodo = { inicio: string; fim: string };

/** Por mês (`YYYY-MM`), mapa motorista (chave normalizada) → até 3 períodos. */
export type DetalheServicoFeriasPorMes = Record<string, Record<string, DetalheServicoFeriasPeriodo[]>>;

export type DetalheServicoPortraitRow = {
  motorista1: string;
  motorista2: string;
  retem: string;
};

export type DetalheServicoBundle = {
  version: 1;
  sheets: Record<string, DetalheServicoSheetSnapshot>;
  rodapes: Record<string, DetalheServicoRodapeAssinatura>;
  columnGrayByMonth: Record<string, Record<string, boolean>>;
  /** Férias por mês (opcional em dados antigos). */
  feriasByMonth: DetalheServicoFeriasPorMes;
  /**
   * Snapshot da grelha do mês antes da primeira marcação com X em «S»/«RO» (ver `detalhe-servico-sheet`).
   * Usado para alternar entre o detalhe original e as alterações posteriores.
   */
  originalSheetBeforeFirstXByMonth?: Record<string, DetalheServicoSheetSnapshot>;
  /** Modo retrato por mês: chave da data (`YYYY-MM-DD`) -> Motorista 1, Motorista 2 e Retém. */
  portraitByMonth?: Record<string, Record<string, DetalheServicoPortraitRow>>;
};

const IDB_KEY = "sot-detalhe-servico-bundle-v2";
/** Chave antiga em `localStorage` (migração única). */
const LEGACY_BUNDLE_LS_KEY = "sot-detalhe-servico-bundle-v2";
const LEGACY_SHEET_PREFIX = "sot-detalhe-servico-sheet-v1:";
const LEGACY_RODAPE_PREFIX = "sot-detalhe-servico-rodape-v1:";

export function emptyRodapeAssinatura(): DetalheServicoRodapeAssinatura {
  return { nome: "", postoGraduacao: "", funcao: "" };
}

export function emptyDetalheServicoBundle(): DetalheServicoBundle {
  return {
    version: 1,
    sheets: {},
    rodapes: {},
    columnGrayByMonth: {},
    feriasByMonth: {},
    portraitByMonth: {},
  };
}

function normalizeSheet(raw: unknown): DetalheServicoSheetSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { rows?: unknown; cells?: unknown };
  if (!Array.isArray(o.rows)) return null;
  const cells =
    o.cells && typeof o.cells === "object" && o.cells !== null
      ? (o.cells as Record<string, Record<string, string>>)
      : {};
  return { rows: o.rows as string[], cells };
}

function normalizeRodape(raw: unknown): DetalheServicoRodapeAssinatura {
  if (!raw || typeof raw !== "object") return emptyRodapeAssinatura();
  const o = raw as Record<string, unknown>;
  return {
    nome: typeof o.nome === "string" ? o.nome : "",
    postoGraduacao: typeof o.postoGraduacao === "string" ? o.postoGraduacao : "",
    funcao: typeof o.funcao === "string" ? o.funcao : "",
  };
}

function normalizeFeriasPeriodo(p: unknown): DetalheServicoFeriasPeriodo | null {
  if (!p || typeof p !== "object") return null;
  const o = p as Record<string, unknown>;
  const inicio = typeof o.inicio === "string" ? o.inicio.trim() : "";
  const fim = typeof o.fim === "string" ? o.fim.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) return null;
  return { inicio, fim };
}

function normalizeFeriasByMonth(raw: unknown): DetalheServicoFeriasPorMes {
  if (!raw || typeof raw !== "object") return {};
  const out: DetalheServicoFeriasPorMes = {};
  for (const [monthKey, monthVal] of Object.entries(raw as Record<string, unknown>)) {
    if (!monthVal || typeof monthVal !== "object") continue;
    const inner: Record<string, DetalheServicoFeriasPeriodo[]> = {};
    for (const [motorKey, periods] of Object.entries(monthVal as Record<string, unknown>)) {
      if (!Array.isArray(periods)) continue;
      const list: DetalheServicoFeriasPeriodo[] = [];
      for (const p of periods) {
        const np = normalizeFeriasPeriodo(p);
        if (np) list.push(np);
        if (list.length >= 3) break;
      }
      if (list.length > 0) inner[motorKey] = list;
    }
    if (Object.keys(inner).length > 0) out[monthKey] = inner;
  }
  return out;
}

function normalizeColumnGrayMap(raw: unknown): Record<string, Record<string, boolean>> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, Record<string, boolean>> = {};
  for (const [monthKey, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const inner: Record<string, boolean> = {};
    for (const [k, b] of Object.entries(v as Record<string, unknown>)) {
      if (b === true) inner[k] = true;
    }
    if (Object.keys(inner).length > 0) out[monthKey] = inner;
  }
  return out;
}

function normalizePortraitByMonth(
  raw: unknown,
): Record<string, Record<string, DetalheServicoPortraitRow>> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, Record<string, DetalheServicoPortraitRow>> = {};
  for (const [monthKey, monthVal] of Object.entries(raw as Record<string, unknown>)) {
    if (!monthVal || typeof monthVal !== "object") continue;
    const monthRows: Record<string, DetalheServicoPortraitRow> = {};
    for (const [isoDate, rowVal] of Object.entries(monthVal as Record<string, unknown>)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) continue;
      if (!rowVal || typeof rowVal !== "object") continue;
      const rowObj = rowVal as Record<string, unknown>;
      monthRows[isoDate] = {
        motorista1: typeof rowObj.motorista1 === "string" ? rowObj.motorista1 : "",
        motorista2: typeof rowObj.motorista2 === "string" ? rowObj.motorista2 : "",
        retem: typeof rowObj.retem === "string" ? rowObj.retem : "",
      };
    }
    if (Object.keys(monthRows).length > 0) out[monthKey] = monthRows;
  }
  return out;
}

/** Normaliza payload vindo do Firestore ou de JSON local. */
export function normalizeDetalheServicoBundle(raw: unknown): DetalheServicoBundle {
  if (!raw || typeof raw !== "object") return emptyDetalheServicoBundle();
  const o = raw as Record<string, unknown>;
  const sheets: Record<string, DetalheServicoSheetSnapshot> = {};
  if (o.sheets && typeof o.sheets === "object") {
    for (const [k, v] of Object.entries(o.sheets as Record<string, unknown>)) {
      const s = normalizeSheet(v);
      if (s) sheets[k] = s;
    }
  }
  const rodapes: Record<string, DetalheServicoRodapeAssinatura> = {};
  if (o.rodapes && typeof o.rodapes === "object") {
    for (const [k, v] of Object.entries(o.rodapes as Record<string, unknown>)) {
      rodapes[k] = normalizeRodape(v);
    }
  }
  const columnGrayByMonth = normalizeColumnGrayMap(o.columnGrayByMonth);
  const feriasByMonth = normalizeFeriasByMonth(o.feriasByMonth);
  const portraitByMonth = normalizePortraitByMonth(o.portraitByMonth);
  const originalSheetBeforeFirstXByMonth: Record<string, DetalheServicoSheetSnapshot> = {};
  if (o.originalSheetBeforeFirstXByMonth && typeof o.originalSheetBeforeFirstXByMonth === "object") {
    for (const [k, v] of Object.entries(o.originalSheetBeforeFirstXByMonth as Record<string, unknown>)) {
      const s = normalizeSheet(v);
      if (s) originalSheetBeforeFirstXByMonth[k] = s;
    }
  }
  return {
    version: 1,
    sheets,
    rodapes,
    columnGrayByMonth,
    feriasByMonth,
    portraitByMonth,
    ...(Object.keys(originalSheetBeforeFirstXByMonth).length > 0
      ? { originalSheetBeforeFirstXByMonth }
      : {}),
  };
}

function rodapeHasContent(r: DetalheServicoRodapeAssinatura): boolean {
  return (
    r.nome.trim().length > 0 ||
    r.postoGraduacao.trim().length > 0 ||
    r.funcao.trim().length > 0
  );
}

export function isDetalheServicoBundleEmpty(b: DetalheServicoBundle): boolean {
  if (Object.keys(b.sheets).length > 0) return false;
  if (Object.values(b.rodapes).some(rodapeHasContent)) return false;
  if (Object.keys(b.columnGrayByMonth).some((k) => Object.keys(b.columnGrayByMonth[k] ?? {}).length > 0)) {
    return false;
  }
  if (Object.keys(b.feriasByMonth ?? {}).some((k) => Object.keys(b.feriasByMonth[k] ?? {}).length > 0)) {
    return false;
  }
  if (Object.keys(b.portraitByMonth ?? {}).some((k) => Object.keys(b.portraitByMonth?.[k] ?? {}).length > 0)) {
    return false;
  }
  return true;
}

function migrateLegacyLocalStorageToBundle(): DetalheServicoBundle | null {
  if (isFirebaseOnlyOnlineActive()) return null;
  if (typeof localStorage === "undefined") return null;
  const sheets: Record<string, DetalheServicoSheetSnapshot> = {};
  const rodapes: Record<string, DetalheServicoRodapeAssinatura> = {};
  let found = false;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith(LEGACY_SHEET_PREFIX)) {
      found = true;
      const monthKey = key.slice(LEGACY_SHEET_PREFIX.length);
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const p = JSON.parse(raw) as unknown;
        const s = normalizeSheet(p);
        if (s) sheets[monthKey] = s;
      } catch {
        /* ignore */
      }
    }
    if (key.startsWith(LEGACY_RODAPE_PREFIX)) {
      found = true;
      const monthKey = key.slice(LEGACY_RODAPE_PREFIX.length);
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const p = JSON.parse(raw) as unknown;
        rodapes[monthKey] = normalizeRodape(p);
      } catch {
        /* ignore */
      }
    }
  }
  if (!found) return null;
  return { version: 1, sheets, rodapes, columnGrayByMonth: {}, feriasByMonth: {}, portraitByMonth: {} };
}

function clearLegacyLocalStorageKeys(bundleKey: string): void {
  if (isFirebaseOnlyOnlineActive()) return;
  try {
    localStorage.removeItem(bundleKey);
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith(LEGACY_SHEET_PREFIX) || key.startsWith(LEGACY_RODAPE_PREFIX)) {
        toRemove.push(key);
      }
    }
    for (const k of toRemove) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

export async function loadDetalheServicoBundleFromIdb(): Promise<DetalheServicoBundle> {
  const fromIdb = await idbGetJson<unknown>(IDB_KEY, { allowWhenFirebaseOnlyOnline: true });
  if (fromIdb && typeof fromIdb === "object") {
    return normalizeDetalheServicoBundle(fromIdb);
  }
  if (isFirebaseOnlyOnlineActive()) {
    return emptyDetalheServicoBundle();
  }
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(LEGACY_BUNDLE_LS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as unknown;
        const b = normalizeDetalheServicoBundle(p);
        await idbSetJson(IDB_KEY, b, { allowWhenFirebaseOnlyOnline: true });
        localStorage.removeItem(LEGACY_BUNDLE_LS_KEY);
        return b;
      }
    }
  } catch {
    /* ignore */
  }
  const migrated = migrateLegacyLocalStorageToBundle();
  if (migrated && !isDetalheServicoBundleEmpty(migrated)) {
    await idbSetJson(IDB_KEY, migrated, { allowWhenFirebaseOnlyOnline: true });
    clearLegacyLocalStorageKeys(LEGACY_BUNDLE_LS_KEY);
    return migrated;
  }
  return emptyDetalheServicoBundle();
}

export async function saveDetalheServicoBundleToIdb(bundle: DetalheServicoBundle): Promise<void> {
  await idbSetJson(IDB_KEY, bundle, { allowWhenFirebaseOnlyOnline: true });
}
