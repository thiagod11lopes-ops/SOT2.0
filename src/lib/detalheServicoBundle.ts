import { idbGetJson, idbSetJson } from "./indexedDb";
import { isFirebaseOnlyOnlineActive } from "./firebaseOnlyOnlinePolicy";
import type {
  DetalheServicoRodapeAssinatura,
  DetalheServicoSheetSnapshot,
} from "./generateDetalheServicoMotoristaPdf";

export type DetalheServicoBundle = {
  version: 1;
  sheets: Record<string, DetalheServicoSheetSnapshot>;
  rodapes: Record<string, DetalheServicoRodapeAssinatura>;
  columnGrayByMonth: Record<string, Record<string, boolean>>;
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
  return { version: 1, sheets: {}, rodapes: {}, columnGrayByMonth: {} };
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
  return { version: 1, sheets, rodapes, columnGrayByMonth };
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
  return { version: 1, sheets, rodapes, columnGrayByMonth: {} };
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
  const fromIdb = await idbGetJson<unknown>(IDB_KEY);
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
        await idbSetJson(IDB_KEY, b);
        localStorage.removeItem(LEGACY_BUNDLE_LS_KEY);
        return b;
      }
    }
  } catch {
    /* ignore */
  }
  const migrated = migrateLegacyLocalStorageToBundle();
  if (migrated && !isDetalheServicoBundleEmpty(migrated)) {
    await idbSetJson(IDB_KEY, migrated);
    clearLegacyLocalStorageKeys(LEGACY_BUNDLE_LS_KEY);
    return migrated;
  }
  return emptyDetalheServicoBundle();
}

export async function saveDetalheServicoBundleToIdb(bundle: DetalheServicoBundle): Promise<void> {
  await idbSetJson(IDB_KEY, bundle);
}
