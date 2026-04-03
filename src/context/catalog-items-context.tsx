import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { idbGetJson, idbSetJson } from "../lib/indexedDb";

export type CatalogCategory =
  | "setores"
  | "responsaveis"
  | "oms"
  | "hospitais"
  | "motoristas"
  | "viaturasAdministrativas"
  | "ambulancias";

export type CatalogItemsState = Record<CatalogCategory, string[]>;

/** Lista única para validação e selects (admin + ambulâncias), sem duplicar por maiúsculas. */
export function mergeViaturasCatalog(items: CatalogItemsState): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of [...items.viaturasAdministrativas, ...items.ambulancias]) {
    const t = x.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

/** Valor vazio é aceito; caso contrário o texto deve existir no catálogo (comparação sem diferenciar maiúsculas). */
export function isValueInCatalog(value: string, catalog: string[]): boolean {
  const t = value.trim();
  if (!t) return true;
  return catalog.some((x) => x.toLowerCase() === t.toLowerCase());
}

const STORAGE_KEY = "sot-catalog-items-v1";

const emptyState: CatalogItemsState = {
  setores: [],
  responsaveis: [],
  oms: [],
  hospitais: [],
  motoristas: [],
  viaturasAdministrativas: [],
  ambulancias: [],
};

type StoredCatalog = Partial<CatalogItemsState> & { viaturas?: string[] };

function normalizeCatalogState(parsed: StoredCatalog | null | undefined): CatalogItemsState {
  let administrativas = Array.isArray(parsed?.viaturasAdministrativas)
    ? parsed.viaturasAdministrativas
    : [];
  const ambulancias = Array.isArray(parsed?.ambulancias) ? parsed.ambulancias : [];
  const legacyViaturas = Array.isArray(parsed?.viaturas) ? parsed.viaturas : [];
  for (const row of legacyViaturas) {
    administrativas = dedupeAdd(administrativas, row);
  }
  return {
    setores: Array.isArray(parsed?.setores) ? parsed.setores : [],
    responsaveis: Array.isArray(parsed?.responsaveis) ? parsed.responsaveis : [],
    oms: Array.isArray(parsed?.oms) ? parsed.oms : [],
    hospitais: Array.isArray(parsed?.hospitais) ? parsed.hospitais : [],
    motoristas: Array.isArray(parsed?.motoristas) ? parsed.motoristas : [],
    viaturasAdministrativas: administrativas,
    ambulancias,
  };
}

/** Mantém a ordem de inclusão (cadastro); só evita duplicata ignorando maiúsculas. */
function dedupeAdd(list: string[], item: string): string[] {
  const t = item.trim();
  if (!t) return list;
  const lower = t.toLowerCase();
  if (list.some((x) => x.toLowerCase() === lower)) return list;
  return [...list, t];
}

type CatalogItemsContextValue = {
  items: CatalogItemsState;
  /** Retorna `true` se o item foi incluído (novo); `false` se vazio ou duplicado. */
  addItem: (category: CatalogCategory, value: string) => boolean;
  removeItem: (category: CatalogCategory, value: string) => void;
};

const CatalogItemsContext = createContext<CatalogItemsContextValue | null>(null);

export function CatalogItemsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CatalogItemsState>({ ...emptyState });
  const hydratedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void idbGetJson<StoredCatalog>(STORAGE_KEY).then((stored) => {
      if (cancelled) return;
      setItems(normalizeCatalogState(stored));
      hydratedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    void idbSetJson(STORAGE_KEY, items);
  }, [items]);

  const addItem = useCallback((category: CatalogCategory, value: string): boolean => {
    const t = value.trim();
    if (!t) return false;
    let added = false;
    setItems((prev) => {
      const next = dedupeAdd(prev[category], value);
      if (next === prev[category]) return prev;
      added = true;
      return { ...prev, [category]: next };
    });
    return added;
  }, []);

  const removeItem = useCallback((category: CatalogCategory, value: string) => {
    setItems((prev) => ({
      ...prev,
      [category]: prev[category].filter((x) => x !== value),
    }));
  }, []);

  const value = useMemo(
    () => ({ items, addItem, removeItem }),
    [items, addItem, removeItem],
  );

  return (
    <CatalogItemsContext.Provider value={value}>{children}</CatalogItemsContext.Provider>
  );
}

export function useCatalogItems() {
  const ctx = useContext(CatalogItemsContext);
  if (!ctx) {
    throw new Error("useCatalogItems deve ser usado dentro de CatalogItemsProvider");
  }
  return ctx;
}
