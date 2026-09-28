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
import {
  MATERIAL_CONTROLE_AVULSO_STATE_DOC,
  SOT_STATE_DOC,
  readSotStateDocFromServer,
  setSotStateDocWithRetry,
  subscribeSotStateDoc,
  writeMergedSotStateDocWithRetry,
  type SotStateCloudDocId,
} from "../lib/firebase/sotStateFirestore";
import {
  emptyMaterialControleDoc,
  isMaterialControleDocEmpty,
  loadMaterialControleFromIdb,
  MATERIAL_CONTROLE_AVULSO_IDB_KEY,
  MATERIAL_CONTROLE_IDB_KEY,
  mergeMaterialControleDocs,
  newMaterialId,
  normalizeMaterialControleDoc,
  saveMaterialControleToIdb,
  materialMovimentoIsoFromDateAndTime,
  quantidadeEmprestada,
  type MaterialControleDoc,
  type MaterialEmprestimo,
  type MaterialEmprestimoInput,
  type MaterialItem,
  type MaterialMovimento,
  type MaterialMovimentoInput,
  type MaterialMovimentoTipo,
  type MaterialPlanilha,
} from "../lib/materialControleStorage";
import { applyMaterialControleSeeds } from "../lib/materialControleArmario1Seed";
import { useSyncPreference } from "./sync-preference-context";

export type MaterialControleStore = "principal" | "avulso";

const MATERIAL_STORE: Record<
  MaterialControleStore,
  { idbKey: string; cloudDoc: SotStateCloudDocId; applySeeds: boolean }
> = {
  principal: {
    idbKey: MATERIAL_CONTROLE_IDB_KEY,
    cloudDoc: SOT_STATE_DOC.materialControle,
    applySeeds: true,
  },
  avulso: {
    idbKey: MATERIAL_CONTROLE_AVULSO_IDB_KEY,
    cloudDoc: MATERIAL_CONTROLE_AVULSO_STATE_DOC,
    applySeeds: false,
  },
};

function materialStoreFromHash(): MaterialControleStore {
  if (typeof window === "undefined") return "principal";
  return /^#\/controle-material(\/|$)/.test(window.location.hash) ? "avulso" : "principal";
}

async function hydrateDoc(
  raw: MaterialControleDoc,
  idbKey: string,
  applySeeds: boolean,
): Promise<{
  doc: MaterialControleDoc;
  seedApplied: boolean;
}> {
  const { doc, changed } = applySeeds
    ? applyMaterialControleSeeds(raw)
    : { doc: raw, changed: false };
  if (changed) await saveMaterialControleToIdb(doc, idbKey);
  return { doc, seedApplied: changed };
}

type CloudSyncStatus = "idle" | "syncing" | "synced" | "error";

type AddItemInput = {
  nome: string;
  quantidade: number;
  unidade?: string;
  observacao?: string;
};

type MaterialControleContextValue = {
  doc: MaterialControleDoc;
  initialLoadComplete: boolean;
  cloudSyncStatus: CloudSyncStatus;
  setRemoteSyncPaused: (paused: boolean) => void;
  flushCloudWrite: () => Promise<void>;
  addPlanilha: (nome: string) => string;
  renamePlanilha: (planilhaId: string, nome: string) => void;
  deletePlanilha: (planilhaId: string) => void;
  addItem: (planilhaId: string, input: AddItemInput) => void;
  updateItem: (
    planilhaId: string,
    itemId: string,
    patch: Partial<Pick<MaterialItem, "nome" | "quantidade" | "unidade" | "observacao">>,
  ) => void;
  deleteItem: (planilhaId: string, itemId: string) => void;
  entradaItem: (planilhaId: string, itemId: string, input: MaterialMovimentoInput) => void;
  saidaItem: (planilhaId: string, itemId: string, input: MaterialMovimentoInput) => void;
  darBaixaItem: (planilhaId: string, itemId: string, motivo?: string) => void;
  reativarItem: (planilhaId: string, itemId: string) => void;
  emprestarItem: (planilhaId: string, itemId: string, input: MaterialEmprestimoInput) => boolean;
  devolverEmprestimo: (planilhaId: string, itemId: string, emprestimoId: string) => void;
  restoreDoc: (next: MaterialControleDoc) => void;
};

const MaterialControleContext = createContext<MaterialControleContextValue | null>(null);

function touchPlanilha(planilha: MaterialPlanilha, patch: Partial<MaterialPlanilha>): MaterialPlanilha {
  return { ...planilha, ...patch, updatedAt: new Date().toISOString() };
}

function appendMovimento(
  item: MaterialItem,
  tipo: MaterialMovimentoTipo,
  input: MaterialMovimentoInput,
): MaterialItem | null {
  const at = materialMovimentoIsoFromDateAndTime(input.dataIso, input.hora);
  if (!at) return null;
  const movimento: MaterialMovimento = {
    id: newMaterialId(),
    tipo,
    quantidade: input.quantidade,
    responsavel: input.responsavel.trim(),
    at,
    observacao: (input.observacao ?? "").trim(),
  };
  return {
    ...item,
    movimentos: [movimento, ...item.movimentos],
    updatedAt: new Date().toISOString(),
  };
}

function mapPlanilha(
  doc: MaterialControleDoc,
  planilhaId: string,
  fn: (p: MaterialPlanilha) => MaterialPlanilha,
): MaterialControleDoc {
  return {
    planilhas: doc.planilhas.map((p) => (p.id === planilhaId ? fn(p) : p)),
  };
}

export function MaterialControleProvider({
  children,
  store = "principal",
}: {
  children: ReactNode;
  store?: MaterialControleStore;
}) {
  const { idbKey, cloudDoc, applySeeds } = MATERIAL_STORE[store];
  const { firebaseOnlyEnabled } = useSyncPreference();
  const useCloud = isFirebaseConfigured() && (store === "avulso" || firebaseOnlyEnabled);

  const [doc, setDoc] = useState<MaterialControleDoc>(emptyMaterialControleDoc);
  const [initialLoadComplete, setInitialLoadComplete] = useState(!useCloud);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>(useCloud ? "idle" : "synced");

  const applyingRemoteRef = useRef(false);
  const remoteSyncPausedRef = useRef(false);
  const hydratedRef = useRef(!useCloud);
  const localPromotionAttemptedRef = useRef(false);
  const cloudWriteInFlightRef = useRef(false);
  const pendingDocRef = useRef<MaterialControleDoc | null>(null);
  const pendingRemoteRef = useRef<MaterialControleDoc | null>(null);
  const forceReplaceRef = useRef(false);
  const baseDocRef = useRef<MaterialControleDoc>(emptyMaterialControleDoc());
  const docRef = useRef(doc);
  docRef.current = doc;

  const rememberRemote = useCallback((next: MaterialControleDoc, options?: { pushLocal?: boolean }) => {
    baseDocRef.current = next;
    if (options?.pushLocal) {
      setDoc(next);
      return;
    }
    applyingRemoteRef.current = true;
    hydratedRef.current = true;
    setDoc(next);
    setInitialLoadComplete(true);
    setCloudSyncStatus("synced");
  }, []);

  const setRemoteSyncPaused = useCallback((paused: boolean) => {
    remoteSyncPausedRef.current = paused;
    if (paused || !pendingRemoteRef.current) return;
    const remote = pendingRemoteRef.current;
    pendingRemoteRef.current = null;
    const local = docRef.current;
    const base = baseDocRef.current;
    const dirty = JSON.stringify(local) !== JSON.stringify(base);
    if (!dirty) {
      rememberRemote(remote);
      return;
    }
    baseDocRef.current = remote;
    setDoc(mergeMaterialControleDocs(base, remote, local));
  }, [rememberRemote]);

  const pushDocToCloud = useCallback(
    async (nextDoc: MaterialControleDoc) => {
      if (!useCloud || !hydratedRef.current) return;
      pendingDocRef.current = nextDoc;
      if (cloudWriteInFlightRef.current) return;
      cloudWriteInFlightRef.current = true;
      try {
        while (pendingDocRef.current) {
          const toSend = pendingDocRef.current;
          pendingDocRef.current = null;
          setCloudSyncStatus("syncing");
          try {
            if (forceReplaceRef.current) {
              await setSotStateDocWithRetry(cloudDoc, toSend);
              forceReplaceRef.current = false;
              const replaced = normalizeMaterialControleDoc(toSend);
              baseDocRef.current = replaced;
              applyingRemoteRef.current = true;
              remoteSyncPausedRef.current = false;
              pendingRemoteRef.current = null;
              setDoc(replaced);
              await saveMaterialControleToIdb(replaced, idbKey);
              setCloudSyncStatus("synced");
              continue;
            }
            const merged = normalizeMaterialControleDoc(
              await writeMergedSotStateDocWithRetry(cloudDoc, baseDocRef.current, toSend, (base, server, local) =>
                mergeMaterialControleDocs(
                  normalizeMaterialControleDoc(base),
                  normalizeMaterialControleDoc(server),
                  normalizeMaterialControleDoc(local),
                ),
              ),
            );
            if (pendingDocRef.current) {
              baseDocRef.current = merged;
              continue;
            }
            baseDocRef.current = merged;
            applyingRemoteRef.current = true;
            setDoc(merged);
            await saveMaterialControleToIdb(merged, idbKey);
            setCloudSyncStatus("synced");
          } catch (e) {
            setCloudSyncStatus("error");
            console.error("[SOT] Gravar controle de material na nuvem:", e);
          }
        }
      } finally {
        cloudWriteInFlightRef.current = false;
      }
    },
    [useCloud, cloudDoc, idbKey],
  );

  const flushCloudWrite = useCallback(async () => {
    if (!useCloud) return;
    await pushDocToCloud(docRef.current);
  }, [pushDocToCloud, useCloud]);

  const mutateDoc = useCallback((fn: (prev: MaterialControleDoc) => MaterialControleDoc) => {
    setDoc((prev) => fn(prev));
  }, []);

  const restoreDoc = useCallback(
    (next: MaterialControleDoc) => {
      const normalized = normalizeMaterialControleDoc(next);
      pendingRemoteRef.current = null;
      baseDocRef.current = normalized;
      void saveMaterialControleToIdb(normalized, idbKey);
      if (useCloud && hydratedRef.current) {
        remoteSyncPausedRef.current = true;
        forceReplaceRef.current = true;
      }
      setDoc(normalized);
    },
    [useCloud, idbKey],
  );

  useEffect(() => {
    if (useCloud) return;
    let cancelled = false;
    void loadMaterialControleFromIdb(idbKey).then(async (local) => {
      if (cancelled) return;
      const { doc: seeded } = await hydrateDoc(local, idbKey, applySeeds);
      if (cancelled) return;
      setDoc(seeded);
      hydratedRef.current = true;
      setInitialLoadComplete(true);
      setCloudSyncStatus("synced");
    });
    return () => {
      cancelled = true;
    };
  }, [useCloud, idbKey, applySeeds]);

  useEffect(() => {
    if (!useCloud) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    setInitialLoadComplete(false);
    hydratedRef.current = false;
    setCloudSyncStatus("idle");

    void (async () => {
      try {
        await ensureFirebaseAuth();
        if (cancelled) return;
        unsub = subscribeSotStateDoc(
          cloudDoc,
          (payload) => {
            void (async () => {
              if (cancelled) return;

              const acceptServerDoc = (seeded: MaterialControleDoc) => {
                if (remoteSyncPausedRef.current) {
                  pendingRemoteRef.current = seeded;
                  return;
                }
                const local = docRef.current;
                const base = baseDocRef.current;
                if (JSON.stringify(seeded) === JSON.stringify(base)) {
                  if (!hydratedRef.current) {
                    hydratedRef.current = true;
                    setInitialLoadComplete(true);
                    setCloudSyncStatus("synced");
                  }
                  return;
                }
                const dirty = hydratedRef.current && JSON.stringify(local) !== JSON.stringify(base);
                if (dirty) {
                  baseDocRef.current = seeded;
                  hydratedRef.current = true;
                  setInitialLoadComplete(true);
                  setCloudSyncStatus("synced");
                  setDoc(mergeMaterialControleDocs(base, seeded, local));
                  return;
                }
                rememberRemote(seeded);
                void saveMaterialControleToIdb(seeded, idbKey);
              };

              if (payload === null) {
                if (!localPromotionAttemptedRef.current) {
                  localPromotionAttemptedRef.current = true;
                  const { doc: seeded } = await hydrateDoc(
                    await loadMaterialControleFromIdb(idbKey),
                    idbKey,
                    applySeeds,
                  );
                  if (!isMaterialControleDocEmpty(seeded)) {
                    try {
                      await setSotStateDocWithRetry(cloudDoc, seeded);
                      rememberRemote(seeded);
                      await saveMaterialControleToIdb(seeded, idbKey);
                    } catch (e) {
                      console.error("[SOT] Promover controle de material local para nuvem:", e);
                      setCloudSyncStatus("error");
                      hydratedRef.current = true;
                      setInitialLoadComplete(true);
                    }
                  } else {
                    rememberRemote(seeded);
                  }
                } else {
                  hydratedRef.current = true;
                  setInitialLoadComplete(true);
                }
                return;
              }

              const normalized = normalizeMaterialControleDoc(payload);
              const { doc: seeded, seedApplied } = await hydrateDoc(normalized, idbKey, applySeeds);
              if (seedApplied) {
                baseDocRef.current = normalized;
                hydratedRef.current = true;
                setInitialLoadComplete(true);
                setDoc(seeded);
                return;
              }
              acceptServerDoc(seeded);
            })();
          },
          (err) => {
            console.error("[SOT] Firestore controle de material:", err);
            if (!cancelled) {
              setCloudSyncStatus("error");
              hydratedRef.current = true;
              setInitialLoadComplete(true);
            }
          },
          { ignoreCachedSnapshotWhenOnline: true },
        );
      } catch (e) {
        console.error("[SOT] Firebase auth (controle de material):", e);
        if (!cancelled) {
          setCloudSyncStatus("error");
          hydratedRef.current = true;
          setInitialLoadComplete(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [useCloud, cloudDoc, idbKey, applySeeds, rememberRemote]);

  useEffect(() => {
    if (!useCloud) return;
    const pullServer = () => {
      if (document.visibilityState === "hidden" || !hydratedRef.current || remoteSyncPausedRef.current) return;
      void readSotStateDocFromServer(cloudDoc)
        .then((payload) => {
          if (!hydratedRef.current || remoteSyncPausedRef.current || payload == null) return;
          const seeded = normalizeMaterialControleDoc(payload);
          const local = docRef.current;
          const base = baseDocRef.current;
          const dirty = JSON.stringify(local) !== JSON.stringify(base);
          if (!dirty) {
            if (JSON.stringify(seeded) === JSON.stringify(local)) return;
            rememberRemote(seeded);
            void saveMaterialControleToIdb(seeded, idbKey);
            return;
          }
          baseDocRef.current = seeded;
          setDoc(mergeMaterialControleDocs(base, seeded, local));
        })
        .catch((err) => {
          console.error("[SOT] Atualizar controle de material ao voltar:", err);
        });
    };
    document.addEventListener("visibilitychange", pullServer);
    window.addEventListener("focus", pullServer);
    return () => {
      document.removeEventListener("visibilitychange", pullServer);
      window.removeEventListener("focus", pullServer);
    };
  }, [useCloud, cloudDoc, idbKey, rememberRemote]);

  useEffect(() => {
    if (!useCloud || !hydratedRef.current) return;
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      void pushDocToCloud(doc);
    }, 200);
    return () => window.clearTimeout(t);
  }, [doc, useCloud, pushDocToCloud]);

  useEffect(() => {
    if (useCloud || !hydratedRef.current) return;
    void saveMaterialControleToIdb(doc, idbKey);
  }, [doc, useCloud, idbKey]);

  const addPlanilha = useCallback(
    (nome: string) => {
      const trimmed = nome.trim();
      const id = newMaterialId();
      const now = new Date().toISOString();
      mutateDoc((prev) => ({
        planilhas: [
          ...prev.planilhas,
          { id, nome: trimmed || "Nova planilha", items: [], createdAt: now, updatedAt: now },
        ],
      }));
      return id;
    },
    [mutateDoc],
  );

  const renamePlanilha = useCallback(
    (planilhaId: string, nome: string) => {
      const trimmed = nome.trim();
      if (!trimmed) return;
      mutateDoc((prev) =>
        mapPlanilha(prev, planilhaId, (p) => touchPlanilha(p, { nome: trimmed })),
      );
    },
    [mutateDoc],
  );

  const deletePlanilha = useCallback(
    (planilhaId: string) => {
      mutateDoc((prev) => ({
        planilhas: prev.planilhas.filter((p) => p.id !== planilhaId),
      }));
    },
    [mutateDoc],
  );

  const addItem = useCallback(
    (planilhaId: string, input: AddItemInput) => {
      const nome = input.nome.trim();
      if (!nome) return;
      const now = new Date().toISOString();
      const item: MaterialItem = {
        id: newMaterialId(),
        nome,
        quantidade: Math.max(0, input.quantidade),
        unidade: (input.unidade ?? "").trim(),
        observacao: (input.observacao ?? "").trim(),
        status: "ativo",
        baixaAt: null,
        baixaMotivo: "",
        movimentos: [],
        emprestimos: [],
        createdAt: now,
        updatedAt: now,
      };
      mutateDoc((prev) =>
        mapPlanilha(prev, planilhaId, (p) =>
          touchPlanilha(p, { items: [...p.items, item] }),
        ),
      );
    },
    [mutateDoc],
  );

  const updateItem = useCallback(
    (
      planilhaId: string,
      itemId: string,
      patch: Partial<Pick<MaterialItem, "nome" | "quantidade" | "unidade" | "observacao">>,
    ) => {
      mutateDoc((prev) =>
        mapPlanilha(prev, planilhaId, (p) =>
          touchPlanilha(p, {
            items: p.items.map((it) => {
              if (it.id !== itemId) return it;
              const nome = patch.nome !== undefined ? patch.nome.trim() : it.nome;
              if (!nome) return it;
              return {
                ...it,
                nome,
                quantidade:
                  patch.quantidade !== undefined ? Math.max(0, patch.quantidade) : it.quantidade,
                unidade: patch.unidade !== undefined ? patch.unidade.trim() : it.unidade,
                observacao: patch.observacao !== undefined ? patch.observacao.trim() : it.observacao,
                updatedAt: new Date().toISOString(),
              };
            }),
          }),
        ),
      );
    },
    [mutateDoc],
  );

  const deleteItem = useCallback(
    (planilhaId: string, itemId: string) => {
      mutateDoc((prev) =>
        mapPlanilha(prev, planilhaId, (p) =>
          touchPlanilha(p, { items: p.items.filter((it) => it.id !== itemId) }),
        ),
      );
    },
    [mutateDoc],
  );

  const entradaItem = useCallback(
    (planilhaId: string, itemId: string, input: MaterialMovimentoInput) => {
      const delta = Math.max(0, input.quantidade);
      const resp = input.responsavel.trim();
      const hora = input.hora.trim();
      if (delta <= 0 || !resp || !input.dataIso.trim() || !hora) return;
      mutateDoc((prev) =>
        mapPlanilha(prev, planilhaId, (p) =>
          touchPlanilha(p, {
            items: p.items.map((it) => {
              if (it.id !== itemId || it.status !== "ativo") return it;
              const withMov = appendMovimento(it, "entrada", input);
              if (!withMov) return it;
              return { ...withMov, quantidade: it.quantidade + delta };
            }),
          }),
        ),
      );
    },
    [mutateDoc],
  );

  const saidaItem = useCallback(
    (planilhaId: string, itemId: string, input: MaterialMovimentoInput) => {
      const delta = Math.max(0, input.quantidade);
      const resp = input.responsavel.trim();
      const hora = input.hora.trim();
      if (delta <= 0 || !resp || !input.dataIso.trim() || !hora) return;
      mutateDoc((prev) =>
        mapPlanilha(prev, planilhaId, (p) =>
          touchPlanilha(p, {
            items: p.items.map((it) => {
              if (it.id !== itemId || it.status !== "ativo") return it;
              const withMov = appendMovimento(it, "saida", input);
              if (!withMov) return it;
              return { ...withMov, quantidade: Math.max(0, it.quantidade - delta) };
            }),
          }),
        ),
      );
    },
    [mutateDoc],
  );

  const darBaixaItem = useCallback(
    (planilhaId: string, itemId: string, motivo?: string) => {
      const now = new Date().toISOString();
      mutateDoc((prev) =>
        mapPlanilha(prev, planilhaId, (p) =>
          touchPlanilha(p, {
            items: p.items.map((it) =>
              it.id === itemId
                ? {
                    ...it,
                    status: "baixa" as const,
                    quantidade: 0,
                    baixaAt: now,
                    baixaMotivo: (motivo ?? "").trim(),
                    updatedAt: now,
                  }
                : it,
            ),
          }),
        ),
      );
    },
    [mutateDoc],
  );

  const emprestarItem = useCallback(
    (planilhaId: string, itemId: string, input: MaterialEmprestimoInput) => {
      const delta = Math.max(0, input.quantidade);
      const resp = input.responsavel.trim();
      const emprestadoEm = materialMovimentoIsoFromDateAndTime(input.dataIso, "12:00");
      if (delta <= 0 || !resp || !emprestadoEm) return false;
      const planilha = docRef.current.planilhas.find((p) => p.id === planilhaId);
      const item = planilha?.items.find((it) => it.id === itemId);
      if (!item || item.status !== "ativo") return false;
      if (delta > Math.max(0, item.quantidade - quantidadeEmprestada(item))) return false;
      const emprestimo: MaterialEmprestimo = {
        id: newMaterialId(),
        quantidade: delta,
        responsavel: resp,
        emprestadoEm,
        devolverEm: input.devolverEm,
        devolvidoEm: null,
      };
      mutateDoc((prev) =>
        mapPlanilha(prev, planilhaId, (p) =>
          touchPlanilha(p, {
            items: p.items.map((it) =>
              it.id === itemId
                ? { ...it, emprestimos: [emprestimo, ...it.emprestimos], updatedAt: new Date().toISOString() }
                : it,
            ),
          }),
        ),
      );
      return true;
    },
    [mutateDoc],
  );

  const devolverEmprestimo = useCallback(
    (planilhaId: string, itemId: string, emprestimoId: string) => {
      const now = new Date().toISOString();
      mutateDoc((prev) =>
        mapPlanilha(prev, planilhaId, (p) =>
          touchPlanilha(p, {
            items: p.items.map((it) => {
              if (it.id !== itemId) return it;
              return {
                ...it,
                emprestimos: it.emprestimos.map((e) =>
                  e.id === emprestimoId && !e.devolvidoEm ? { ...e, devolvidoEm: now } : e,
                ),
                updatedAt: now,
              };
            }),
          }),
        ),
      );
    },
    [mutateDoc],
  );

  const reativarItem = useCallback(
    (planilhaId: string, itemId: string) => {
      mutateDoc((prev) =>
        mapPlanilha(prev, planilhaId, (p) =>
          touchPlanilha(p, {
            items: p.items.map((it) =>
              it.id === itemId
                ? {
                    ...it,
                    status: "ativo" as const,
                    baixaAt: null,
                    baixaMotivo: "",
                    updatedAt: new Date().toISOString(),
                  }
                : it,
            ),
          }),
        ),
      );
    },
    [mutateDoc],
  );

  const value = useMemo(
    (): MaterialControleContextValue => ({
      doc,
      initialLoadComplete,
      cloudSyncStatus,
      setRemoteSyncPaused,
      flushCloudWrite,
      addPlanilha,
      renamePlanilha,
      deletePlanilha,
      addItem,
      updateItem,
      deleteItem,
      entradaItem,
      saidaItem,
      darBaixaItem,
      reativarItem,
      emprestarItem,
      devolverEmprestimo,
      restoreDoc,
    }),
    [
      doc,
      initialLoadComplete,
      cloudSyncStatus,
      setRemoteSyncPaused,
      flushCloudWrite,
      addPlanilha,
      renamePlanilha,
      deletePlanilha,
      addItem,
      updateItem,
      deleteItem,
      entradaItem,
      saidaItem,
      darBaixaItem,
      reativarItem,
      emprestarItem,
      devolverEmprestimo,
      restoreDoc,
    ],
  );

  return <MaterialControleContext.Provider value={value}>{children}</MaterialControleContext.Provider>;
}

export function MaterialControleRouteProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<MaterialControleStore>(materialStoreFromHash);
  useEffect(() => {
    const onHash = () => setStore(materialStoreFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return (
    <MaterialControleProvider key={store} store={store}>
      {children}
    </MaterialControleProvider>
  );
}

export function useMaterialControle() {
  const ctx = useContext(MaterialControleContext);
  if (!ctx) {
    throw new Error("useMaterialControle deve ser usado dentro de MaterialControleProvider");
  }
  return ctx;
}
