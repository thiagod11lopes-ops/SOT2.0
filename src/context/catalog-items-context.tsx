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
  | "viaturas";

export type CatalogItemsState = Record<CatalogCategory, string[]>;

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
  viaturas: [],
};

function normalizeCatalogState(parsed: Partial<CatalogItemsState> | null | undefined): CatalogItemsState {
  return {
    setores: Array.isArray(parsed?.setores) ? parsed.setores : [],
    responsaveis: Array.isArray(parsed?.responsaveis) ? parsed.responsaveis : [],
    oms: Array.isArray(parsed?.oms) ? parsed.oms : [],
    hospitais: Array.isArray(parsed?.hospitais) ? parsed.hospitais : [],
    motoristas: Array.isArray(parsed?.motoristas) ? parsed.motoristas : [],
    viaturas: Array.isArray(parsed?.viaturas) ? parsed.viaturas : [],
  };
}

function sortPtBr(list: string[]) {
  return [...list].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function dedupeAdd(list: string[], item: string): string[] {
  const t = item.trim();
  if (!t) return list;
  const lower = t.toLowerCase();
  if (list.some((x) => x.toLowerCase() === lower)) return list;
  return sortPtBr([...list, t]);
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
    void idbGetJson<Partial<CatalogItemsState>>(STORAGE_KEY).then((stored) => {
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
