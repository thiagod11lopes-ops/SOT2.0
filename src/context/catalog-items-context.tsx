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
import { ensureFirebaseAuth } from "../lib/firebase/auth";
import { isFirebaseConfigured } from "../lib/firebase/config";
import { SOT_STATE_DOC, setSotStateDocWithRetry, subscribeSotStateDoc } from "../lib/firebase/sotStateFirestore";
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

function isCatalogEmpty(s: CatalogItemsState): boolean {
  return (
    s.setores.length === 0 &&
    s.responsaveis.length === 0 &&
    s.oms.length === 0 &&
    s.hospitais.length === 0 &&
    s.motoristas.length === 0 &&
    s.viaturasAdministrativas.length === 0 &&
    s.ambulancias.length === 0
  );
}

/** Ignorar snapshots do Firestore logo após add/remove local (evita repor itens com dados antigos do servidor). */
const SUPPRESS_REMOTE_MS = 5000;

/** Mesmo conjunto de entradas por categoria (ignora maiúsculas e ordem na lista). */
function catalogStatesEquivalent(a: CatalogItemsState, b: CatalogItemsState): boolean {
  const keys: CatalogCategory[] = [
    "setores",
    "responsaveis",
    "oms",
    "hospitais",
    "motoristas",
    "viaturasAdministrativas",
    "ambulancias",
  ];
  for (const cat of keys) {
    const sa = a[cat];
    const sb = b[cat];
    if (sa.length !== sb.length) return false;
    const setB = new Set(sb.map((x) => x.trim().toLowerCase()).filter(Boolean));
    for (const x of sa) {
      const k = x.trim().toLowerCase();
      if (!k) return false;
      if (!setB.has(k)) return false;
    }
  }
  return true;
}

/** União por categoria (ordem: `a` primeiro, depois `b`), sem duplicar ignorando maiúsculas. */
function mergeCatalogStates(a: CatalogItemsState, b: CatalogItemsState): CatalogItemsState {
  const keys: CatalogCategory[] = [
    "setores",
    "responsaveis",
    "oms",
    "hospitais",
    "motoristas",
    "viaturasAdministrativas",
    "ambulancias",
  ];
  const out: CatalogItemsState = { ...emptyState };
  for (const cat of keys) {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const x of [...a[cat], ...b[cat]]) {
      const t = x.trim();
      if (!t) continue;
      const k = t.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      list.push(x);
    }
    out[cat] = list;
  }
  return out;
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
  const itemsRef = useRef(items);
  itemsRef.current = items;
  /** `true` após a 1.ª leitura do IndexedDB (evita gravar estado vazio antes do merge). */
  const initialIdbLoadDoneRef = useRef(false);
  const hydratedRef = useRef(false);
  const applyingRemoteRef = useRef(false);
  const suppressRemoteUntilRef = useRef(0);
  const useCloud = isFirebaseConfigured();

  const bumpLocalMutation = useCallback(() => {
    suppressRemoteUntilRef.current = Date.now() + SUPPRESS_REMOTE_MS;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void idbGetJson<StoredCatalog>(STORAGE_KEY).then((stored) => {
      if (cancelled) return;
      const fromDb = normalizeCatalogState(stored);
      setItems((prev) => mergeCatalogStates(fromDb, prev));
      initialIdbLoadDoneRef.current = true;
      hydratedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!useCloud) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    void (async () => {
      try {
        await ensureFirebaseAuth();
        if (cancelled) return;
        unsub = subscribeSotStateDoc(
          SOT_STATE_DOC.catalog,
          (payload) => {
            if (cancelled) return;
            void (async () => {
              if (payload === null) {
                const local = await idbGetJson<StoredCatalog>(STORAGE_KEY);
                const normalized = normalizeCatalogState(local);
                if (!isCatalogEmpty(normalized)) {
                  await setSotStateDocWithRetry(SOT_STATE_DOC.catalog, normalized);
                }
                return;
              }
              if (Date.now() < suppressRemoteUntilRef.current) {
                return;
              }
              applyingRemoteRef.current = true;
              const incoming = normalizeCatalogState(payload as StoredCatalog);
              setItems((prev) => {
                if (isCatalogEmpty(incoming) && !isCatalogEmpty(prev)) {
                  queueMicrotask(() => {
                    void setSotStateDocWithRetry(SOT_STATE_DOC.catalog, prev).catch((e) => {
                      console.error("[SOT] Enviar catálogo local (nuvem vazia):", e);
                    });
                  });
                  return prev;
                }
                // União local + remoto: um snapshot pode chegar antes do write recente
                // (ou com latência) e substituir `prev` por dados antigos — isso apagava
                // viaturas/motoristas recém-cadastrados. O merge preserva entradas locais
                // até o servidor refletir o estado completo.
                const merged = mergeCatalogStates(prev, incoming);
                // Se o estado local tinha itens ainda não refletidos no snapshot (ex.: viatura
                // recém-cadastrada), o efeito que grava na nuvem era ignorado por
                // `applyingRemoteRef` — enviamos o merge explicitamente.
                if (!catalogStatesEquivalent(merged, incoming)) {
                  queueMicrotask(() => {
                    void setSotStateDocWithRetry(SOT_STATE_DOC.catalog, merged).catch((e) => {
                      console.error("[SOT] Reconciliar catálogo local com a nuvem:", e);
                    });
                  });
                }
                return merged;
              });
              hydratedRef.current = true;
            })();
          },
          (err) => console.error("[SOT] Firestore catálogo:", err),
        );
      } catch (e) {
        console.error("[SOT] Firebase auth (catálogo):", e);
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [useCloud]);

  useEffect(() => {
    if (!initialIdbLoadDoneRef.current && isCatalogEmpty(items)) return;
    void idbSetJson(STORAGE_KEY, items, { maxAttempts: 6 });
  }, [items]);

  useEffect(() => {
    const flushToIdb = () => {
      const cur = itemsRef.current;
      if (!initialIdbLoadDoneRef.current && isCatalogEmpty(cur)) return;
      void idbSetJson(STORAGE_KEY, cur, { maxAttempts: 6 });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushToIdb();
    };
    window.addEventListener("pagehide", flushToIdb);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flushToIdb);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!hydratedRef.current || !useCloud) return;
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      void setSotStateDocWithRetry(SOT_STATE_DOC.catalog, items).catch((e) => {
        console.error("[SOT] Gravar catálogo na nuvem:", e);
      });
    }, 120);
    return () => window.clearTimeout(t);
  }, [items, useCloud]);

  const addItem = useCallback(
    (category: CatalogCategory, value: string): boolean => {
      const t = value.trim();
      if (!t) return false;
      let added = false;
      setItems((prev) => {
        const next = dedupeAdd(prev[category], value);
        if (next === prev[category]) return prev;
        added = true;
        return { ...prev, [category]: next };
      });
      if (added) bumpLocalMutation();
      return added;
    },
    [bumpLocalMutation],
  );

  const removeItem = useCallback(
    (category: CatalogCategory, value: string) => {
      bumpLocalMutation();
      setItems((prev) => ({
        ...prev,
        [category]: prev[category].filter((x) => x !== value),
      }));
    },
    [bumpLocalMutation],
  );

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
