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
import {
  emptyMaterialControleDoc,
  isMaterialControleDocEmpty,
  loadMaterialControleFromIdb,
  newMaterialId,
  normalizeMaterialControleDoc,
  saveMaterialControleToIdb,
  type MaterialControleDoc,
  type MaterialItem,
  type MaterialPlanilha,
} from "../lib/materialControleStorage";
import { applyMaterialControleSeeds } from "../lib/materialControleArmario1Seed";
import { useSyncPreference } from "./sync-preference-context";

async function hydrateDocWithSeeds(raw: MaterialControleDoc): Promise<{
  doc: MaterialControleDoc;
  seedApplied: boolean;
}> {
  const { doc, changed } = applyMaterialControleSeeds(raw);
  if (changed) await saveMaterialControleToIdb(doc);
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
  entradaItem: (planilhaId: string, itemId: string, quantidade: number) => void;
  saidaItem: (planilhaId: string, itemId: string, quantidade: number) => void;
  darBaixaItem: (planilhaId: string, itemId: string, motivo?: string) => void;
  reativarItem: (planilhaId: string, itemId: string) => void;
};

const MaterialControleContext = createContext<MaterialControleContextValue | null>(null);

function touchPlanilha(planilha: MaterialPlanilha, patch: Partial<MaterialPlanilha>): MaterialPlanilha {
  return { ...planilha, ...patch, updatedAt: new Date().toISOString() };
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

export function MaterialControleProvider({ children }: { children: ReactNode }) {
  const { firebaseOnlyEnabled } = useSyncPreference();
  const useCloud = isFirebaseConfigured() && firebaseOnlyEnabled;

  const [doc, setDoc] = useState<MaterialControleDoc>(emptyMaterialControleDoc);
  const [initialLoadComplete, setInitialLoadComplete] = useState(!useCloud);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>(useCloud ? "idle" : "synced");

  const applyingRemoteRef = useRef(false);
  const remoteSyncPausedRef = useRef(false);
  const hydratedRef = useRef(!useCloud);
  const localPromotionAttemptedRef = useRef(false);
  const cloudWriteInFlightRef = useRef(false);
  const pendingDocRef = useRef<MaterialControleDoc | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;

  const setRemoteSyncPaused = useCallback((paused: boolean) => {
    remoteSyncPausedRef.current = paused;
  }, []);

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
            await setSotStateDocWithRetry(SOT_STATE_DOC.materialControle, toSend);
            await saveMaterialControleToIdb(toSend);
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
    [useCloud],
  );

  const flushCloudWrite = useCallback(async () => {
    if (!useCloud) return;
    await pushDocToCloud(docRef.current);
  }, [pushDocToCloud, useCloud]);

  const mutateDoc = useCallback((fn: (prev: MaterialControleDoc) => MaterialControleDoc) => {
    setDoc((prev) => fn(prev));
  }, []);

  useEffect(() => {
    if (useCloud) return;
    let cancelled = false;
    void loadMaterialControleFromIdb().then(async (local) => {
      if (cancelled) return;
      const { doc: seeded } = await hydrateDocWithSeeds(local);
      if (cancelled) return;
      setDoc(seeded);
      hydratedRef.current = true;
      setInitialLoadComplete(true);
      setCloudSyncStatus("synced");
    });
    return () => {
      cancelled = true;
    };
  }, [useCloud]);

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
          SOT_STATE_DOC.materialControle,
          (payload) => {
            void (async () => {
              if (cancelled) return;
              if (remoteSyncPausedRef.current) return;

              if (payload === null) {
                if (!localPromotionAttemptedRef.current) {
                  localPromotionAttemptedRef.current = true;
                  const { doc: seeded } = await hydrateDocWithSeeds(await loadMaterialControleFromIdb());
                  if (!isMaterialControleDocEmpty(seeded)) {
                    try {
                      await setSotStateDocWithRetry(SOT_STATE_DOC.materialControle, seeded);
                      applyingRemoteRef.current = true;
                      setDoc(seeded);
                      await saveMaterialControleToIdb(seeded);
                      setCloudSyncStatus("synced");
                    } catch (e) {
                      console.error("[SOT] Promover controle de material local para nuvem:", e);
                      setCloudSyncStatus("error");
                    }
                  } else {
                    applyingRemoteRef.current = true;
                    setDoc(seeded);
                  }
                }
                hydratedRef.current = true;
                setInitialLoadComplete(true);
                return;
              }

              applyingRemoteRef.current = true;
              const normalized = normalizeMaterialControleDoc(payload);
              const { doc: seeded, seedApplied } = await hydrateDocWithSeeds(normalized);
              if (seedApplied) applyingRemoteRef.current = false;
              setDoc(seeded);
              setCloudSyncStatus("synced");
              await saveMaterialControleToIdb(seeded);
              hydratedRef.current = true;
              setInitialLoadComplete(true);
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
  }, [useCloud]);

  useEffect(() => {
    if (!useCloud || !hydratedRef.current) return;
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      void pushDocToCloud(doc);
    }, 450);
    return () => window.clearTimeout(t);
  }, [doc, useCloud, pushDocToCloud]);

  useEffect(() => {
    if (useCloud || !hydratedRef.current) return;
    void saveMaterialControleToIdb(doc);
  }, [doc, useCloud]);

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
    (planilhaId: string, itemId: string, quantidade: number) => {
      const delta = Math.max(0, quantidade);
      if (delta <= 0) return;
      mutateDoc((prev) =>
        mapPlanilha(prev, planilhaId, (p) =>
          touchPlanilha(p, {
            items: p.items.map((it) =>
              it.id === itemId && it.status === "ativo"
                ? {
                    ...it,
                    quantidade: it.quantidade + delta,
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

  const saidaItem = useCallback(
    (planilhaId: string, itemId: string, quantidade: number) => {
      const delta = Math.max(0, quantidade);
      if (delta <= 0) return;
      mutateDoc((prev) =>
        mapPlanilha(prev, planilhaId, (p) =>
          touchPlanilha(p, {
            items: p.items.map((it) =>
              it.id === itemId && it.status === "ativo"
                ? {
                    ...it,
                    quantidade: Math.max(0, it.quantidade - delta),
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
    ],
  );

  return <MaterialControleContext.Provider value={value}>{children}</MaterialControleContext.Provider>;
}

export function useMaterialControle() {
  const ctx = useContext(MaterialControleContext);
  if (!ctx) {
    throw new Error("useMaterialControle deve ser usado dentro de MaterialControleProvider");
  }
  return ctx;
}
