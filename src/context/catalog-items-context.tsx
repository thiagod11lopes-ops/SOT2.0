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
import {
  emptyMotoristaAliases,
  mergeMotoristaAliases,
  normalizeMotoristaAliases,
  registerMotoristaRename,
  type MotoristaAliasesMap,
} from "../lib/motoristaAliases";
import { useSyncPreference } from "./sync-preference-context";

export type CatalogCategory =
  | "setores"
  | "responsaveis"
  | "oms"
  | "hospitais"
  | "motoristas"
  | "viaturasAdministrativas"
  | "ambulancias";

export type CatalogItemsState = Record<CatalogCategory, string[]>;

type CatalogPersisted = CatalogItemsState & { motoristaAliases?: MotoristaAliasesMap };

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

type StoredCatalog = Partial<CatalogItemsState> & {
  viaturas?: string[];
  motoristaAliases?: MotoristaAliasesMap;
};

function toPersistedCatalog(items: CatalogItemsState, aliases: MotoristaAliasesMap): CatalogPersisted {
  return { ...items, motoristaAliases: aliases };
}

function parsePersistedCatalog(raw: unknown): { items: CatalogItemsState; aliases: MotoristaAliasesMap } {
  const stored = (raw && typeof raw === "object" ? raw : null) as StoredCatalog | null;
  return {
    items: normalizeCatalogState(stored),
    aliases: normalizeMotoristaAliases(stored?.motoristaAliases),
  };
}

function canonicalizeVehiclePlate(value: string): string {
  const t = value.trim();
  if (!t) return t;
  if (t.toUpperCase() === "LSB-8253") return "LSB-8C53";
  return t;
}

function canonicalizeMotoristaName(value: string): string {
  const t = value.trim();
  if (!t) return t;
  // Ajuste de nomenclatura preservando equivalência textual (mesmo nome ignorando caixa).
  const up = t.toUpperCase();
  if (t.toUpperCase() === "MN PRADO") return "MN Prado";
  if (up === "SG GODINHO" || up === "1°SG GODINHO") return "1°SG Godinho";
  if (up === "SG THIAGO" || up === "SG THIAGO LOPES" || up === "2°SG THIAGO LOPES") {
    return "2°SG Thiago Lopes";
  }
  if (up === "SG GERSON" || up === "SG GERSON ROCHA" || up === "2°SG GERSON ROCHA") {
    return "2°SG Gerson Rocha";
  }
  if (up === "SG SILVA MARTINS" || up === "3°SG SILVA MARTINS") return "3°SG Silva Martins";
  if (up === "SG PACHECO" || up === "3°SG PACHECO") return "3°SG Pacheco";
  if (up === "SG CATROLI" || up === "3°SG CATROLI") return "3°SG Catroli";
  if (up === "SG FERNANDO" || up === "3°SG FERNANDO") return "3°SG Fernando";
  if (up === "SG RM1 CORDEIRO" || up === "2°SG RM1 CORDEIRO") return "2°SG RM1 Cordeiro";
  if (up === "SG RM1 DANIEL GOMES" || up === "2°SG RM1 DANIEL GOMES") {
    return "2°SG RM1 Daniel Gomes";
  }
  return t;
}

function normalizeCatalogState(parsed: StoredCatalog | null | undefined): CatalogItemsState {
  let administrativas = Array.isArray(parsed?.viaturasAdministrativas)
    ? parsed.viaturasAdministrativas
    : [];
  const ambulancias = Array.isArray(parsed?.ambulancias)
    ? parsed.ambulancias.map(canonicalizeVehiclePlate)
    : [];
  const legacyViaturas = Array.isArray(parsed?.viaturas) ? parsed.viaturas : [];
  administrativas = administrativas.map(canonicalizeVehiclePlate);
  for (const row of legacyViaturas) {
    administrativas = dedupeAdd(administrativas, canonicalizeVehiclePlate(row));
  }
  return {
    setores: Array.isArray(parsed?.setores) ? parsed.setores : [],
    responsaveis: Array.isArray(parsed?.responsaveis) ? parsed.responsaveis : [],
    oms: Array.isArray(parsed?.oms) ? parsed.oms : [],
    hospitais: Array.isArray(parsed?.hospitais) ? parsed.hospitais : [],
    motoristas: Array.isArray(parsed?.motoristas)
      ? parsed.motoristas.map(canonicalizeMotoristaName)
      : [],
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
  /** Nomes antigos → nome atual (só para estatísticas / resolução de exibição). */
  motoristaAliases: MotoristaAliasesMap;
  /** Primeira carga local ou snapshot remoto concluída. */
  initialLoadComplete: boolean;
  /** Retorna `true` se o item foi incluído (novo); `false` se vazio ou duplicado. */
  addItem: (category: CatalogCategory, value: string) => boolean;
  /** Renomeia um item existente. `false` se vazio, inexistente ou duplicado. */
  renameItem: (category: CatalogCategory, oldValue: string, newValue: string) => boolean;
  removeItem: (category: CatalogCategory, value: string) => void;
};

const CatalogItemsContext = createContext<CatalogItemsContextValue | null>(null);

export function CatalogItemsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CatalogItemsState>({ ...emptyState });
  const [motoristaAliases, setMotoristaAliases] = useState<MotoristaAliasesMap>(() => emptyMotoristaAliases());
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const aliasesRef = useRef(motoristaAliases);
  aliasesRef.current = motoristaAliases;
  /** `true` após a 1.ª leitura do IndexedDB (evita gravar estado vazio antes do merge). */
  const initialIdbLoadDoneRef = useRef(false);
  const hydratedRef = useRef(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const markInitialLoadComplete = useCallback(() => {
    hydratedRef.current = true;
    setInitialLoadComplete(true);
  }, []);
  const applyingRemoteRef = useRef(false);
  const suppressRemoteUntilRef = useRef(0);
  const { firebaseOnlyEnabled } = useSyncPreference();
  const useCloud = isFirebaseConfigured() && firebaseOnlyEnabled;

  const bumpLocalMutation = useCallback(() => {
    suppressRemoteUntilRef.current = Date.now() + SUPPRESS_REMOTE_MS;
  }, []);

  useEffect(() => {
    if (useCloud) {
      // Modo estrito Firebase: ignora hidratação inicial por cache local.
      initialIdbLoadDoneRef.current = true;
      return;
    }
    let cancelled = false;
    void idbGetJson<StoredCatalog>(STORAGE_KEY).then((stored) => {
      if (cancelled) return;
      const parsed = parsePersistedCatalog(stored);
      setItems((prev) => mergeCatalogStates(parsed.items, prev));
      setMotoristaAliases((prev) => mergeMotoristaAliases(parsed.aliases, prev));
      initialIdbLoadDoneRef.current = true;
      markInitialLoadComplete();
    });
    return () => {
      cancelled = true;
    };
  }, [useCloud, markInitialLoadComplete]);

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
                // Doc ausente na nuvem: sem isto `hydratedRef` nunca passa a true e o efeito
                // que grava na nuvem não corre — instalação mobile nova fica com catálogo vazio
                // para sempre mesmo com "Nuvem ativa" (sincronização de saídas é outro fluxo).
                markInitialLoadComplete();
                return;
              }
              if (Date.now() < suppressRemoteUntilRef.current) {
                return;
              }
              applyingRemoteRef.current = true;
              const parsed = parsePersistedCatalog(payload);
              setItems((prev) => {
                if (isCatalogEmpty(parsed.items) && !isCatalogEmpty(prev)) {
                  return prev;
                }
                const merged = mergeCatalogStates(prev, parsed.items);
                if (!catalogStatesEquivalent(merged, parsed.items)) {
                  // Em modo Firebase-only, divergência é resolvida no servidor; cliente não força writeback aqui.
                }
                return merged;
              });
              setMotoristaAliases((prev) => mergeMotoristaAliases(prev, parsed.aliases));
              markInitialLoadComplete();
            })();
          },
          (err) => console.error("[SOT] Firestore catálogo:", err),
          { ignoreCachedSnapshotWhenOnline: true },
        );
      } catch (e) {
        console.error("[SOT] Firebase auth (catálogo):", e);
        markInitialLoadComplete();
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [useCloud, markInitialLoadComplete]);

  useEffect(() => {
    if (useCloud) {
      setInitialLoadComplete(false);
      return;
    }
    setInitialLoadComplete(false);
  }, [useCloud]);

  useEffect(() => {
    if (!initialIdbLoadDoneRef.current && isCatalogEmpty(items)) return;
    void idbSetJson(STORAGE_KEY, toPersistedCatalog(items, motoristaAliases), { maxAttempts: 6 });
  }, [items, motoristaAliases]);

  useEffect(() => {
    const flushToIdb = () => {
      const cur = itemsRef.current;
      if (!initialIdbLoadDoneRef.current && isCatalogEmpty(cur)) return;
      void idbSetJson(STORAGE_KEY, toPersistedCatalog(cur, aliasesRef.current), { maxAttempts: 6 });
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
      void setSotStateDocWithRetry(SOT_STATE_DOC.catalog, toPersistedCatalog(items, motoristaAliases)).catch((e) => {
        console.error("[SOT] Gravar catálogo na nuvem:", e);
      });
    }, 120);
    return () => window.clearTimeout(t);
  }, [items, motoristaAliases, useCloud]);

  const addItem = useCallback(
    (category: CatalogCategory, value: string): boolean => {
      const normalizedValue =
        category === "motoristas"
          ? canonicalizeMotoristaName(value)
          : category === "viaturasAdministrativas" || category === "ambulancias"
            ? canonicalizeVehiclePlate(value)
            : value;
      const t = normalizedValue.trim();
      if (!t) return false;
      let added = false;
      setItems((prev) => {
        const next = dedupeAdd(prev[category], normalizedValue);
        if (next === prev[category]) return prev;
        added = true;
        return { ...prev, [category]: next };
      });
      if (added) bumpLocalMutation();
      return added;
    },
    [bumpLocalMutation],
  );

  const renameItem = useCallback(
    (category: CatalogCategory, oldValue: string, newValue: string): boolean => {
      const normalizedNew =
        category === "motoristas"
          ? canonicalizeMotoristaName(newValue)
          : category === "viaturasAdministrativas" || category === "ambulancias"
            ? canonicalizeVehiclePlate(newValue)
            : newValue.trim();
      const nextName = normalizedNew.trim();
      if (!nextName) return false;
      let renamed = false;
      setItems((prev) => {
        const list = prev[category];
        const idx = list.findIndex((x) => x === oldValue);
        if (idx < 0) return prev;
        const lower = nextName.toLowerCase();
        if (list.some((x, i) => i !== idx && x.toLowerCase() === lower)) return prev;
        if (list[idx] === nextName) return prev;
        const nextList = [...list];
        nextList[idx] = nextName;
        renamed = true;
        return { ...prev, [category]: nextList };
      });
      if (renamed) {
        bumpLocalMutation();
        if (category === "motoristas") {
          setMotoristaAliases((prev) => registerMotoristaRename(prev, oldValue, nextName));
        }
      }
      return renamed;
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
    () => ({ items, motoristaAliases, initialLoadComplete, addItem, renameItem, removeItem }),
    [items, motoristaAliases, initialLoadComplete, addItem, renameItem, removeItem],
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
