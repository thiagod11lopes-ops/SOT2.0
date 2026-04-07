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
import { ensureFirebaseAuth } from "../lib/firebase/auth";
import {
  batchUpsertDepartures,
  deleteAllDepartureDocuments,
  deleteDepartureDocument,
  subscribeDepartures,
  upsertDepartureRecord,
} from "../lib/firebase/departuresFirestore";
import { isFirebaseConfigured } from "../lib/firebase/config";
import { normalizeDepartureRows } from "../lib/normalizeDepartures";
import type { DepartureRecord } from "../types/departure";

export type DepartureKmFieldsPatch = Partial<
  Pick<DepartureRecord, "kmSaida" | "kmChegada" | "chegada">
>;

export type CloudDeparturesSyncState = {
  enabled: boolean;
  status: "idle" | "connecting" | "live" | "error";
  message?: string;
  lastSyncAt?: number;
  lastErrorAt?: number;
};

type DeparturesContextValue = {
  departures: DepartureRecord[];
  addDeparture: (data: Omit<DepartureRecord, "id" | "createdAt">) => void;
  mergeDeparturesFromBackup: (rows: DepartureRecord[]) => void;
  clearAllDepartures: () => void;
  updateDeparture: (id: string, data: Omit<DepartureRecord, "id" | "createdAt">) => void;
  removeDeparture: (id: string) => void;
  updateDepartureKmFields: (id: string, patch: DepartureKmFieldsPatch) => void;
  pendingEditDepartureId: string | null;
  editIntentVersion: number;
  beginEditDeparture: (id: string) => void;
  clearPendingEditDeparture: () => void;
  cloudDeparturesSync: CloudDeparturesSyncState;
  forceCloudResync: () => void;
};

const DeparturesContext = createContext<DeparturesContextValue | null>(null);
const DEPARTURES_STORAGE_KEY = "sot-departures-v1";
const SUPPRESS_REMOTE_MS = 5000;
const LOCAL_MUTATION_GUARD_MS = 60_000;

function departureRowsEqual(a: DepartureRecord, b: DepartureRecord): boolean {
  return (
    a.id === b.id &&
    a.createdAt === b.createdAt &&
    a.tipo === b.tipo &&
    a.dataPedido === b.dataPedido &&
    a.horaPedido === b.horaPedido &&
    a.dataSaida === b.dataSaida &&
    a.horaSaida === b.horaSaida &&
    a.setor === b.setor &&
    a.ramal === b.ramal &&
    a.objetivoSaida === b.objetivoSaida &&
    a.numeroPassageiros === b.numeroPassageiros &&
    a.responsavelPedido === b.responsavelPedido &&
    a.om === b.om &&
    a.viaturas === b.viaturas &&
    a.motoristas === b.motoristas &&
    a.hospitalDestino === b.hospitalDestino &&
    a.tipoSaidaInterHospitalar === b.tipoSaidaInterHospitalar &&
    a.tipoSaidaAlta === b.tipoSaidaAlta &&
    a.tipoSaidaOutros === b.tipoSaidaOutros &&
    a.kmSaida === b.kmSaida &&
    a.kmChegada === b.kmChegada &&
    a.chegada === b.chegada &&
    a.cidade === b.cidade &&
    a.bairro === b.bairro &&
    a.rubrica === b.rubrica &&
    a.cancelada === b.cancelada &&
    a.ocorrencias === b.ocorrencias
  );
}

export function DeparturesProvider({ children }: { children: ReactNode }) {
  const [departures, setDepartures] = useState<DepartureRecord[]>([]);
  const hydratedRef = useRef(false);
  const suppressRemoteUntilRef = useRef(0);
  const recentTouchedIdsRef = useRef<Map<string, number>>(new Map());
  const recentDeletedIdsRef = useRef<Map<string, number>>(new Map());
  const [pendingEditDepartureId, setPendingEditDepartureId] = useState<string | null>(null);
  const [editIntentVersion, setEditIntentVersion] = useState(0);
  const [syncRefreshToken, setSyncRefreshToken] = useState(0);
  const [cloudDeparturesSync, setCloudDeparturesSync] = useState<CloudDeparturesSyncState>(() => ({
    enabled: isFirebaseConfigured(),
    status: isFirebaseConfigured() ? "connecting" : "idle",
  }));

  const useCloud = isFirebaseConfigured();
  const bumpLocalMutation = useCallback(() => {
    suppressRemoteUntilRef.current = Date.now() + SUPPRESS_REMOTE_MS;
  }, []);
  const markTouched = useCallback((id: string) => {
    const until = Date.now() + LOCAL_MUTATION_GUARD_MS;
    recentTouchedIdsRef.current.set(id, until);
    recentDeletedIdsRef.current.delete(id);
  }, []);
  const markDeleted = useCallback((id: string) => {
    const until = Date.now() + LOCAL_MUTATION_GUARD_MS;
    recentDeletedIdsRef.current.set(id, until);
    recentTouchedIdsRef.current.delete(id);
  }, []);
  const sweepRecentMutationGuards = useCallback(() => {
    const now = Date.now();
    for (const [id, until] of recentTouchedIdsRef.current) {
      if (until <= now) recentTouchedIdsRef.current.delete(id);
    }
    for (const [id, until] of recentDeletedIdsRef.current) {
      if (until <= now) recentDeletedIdsRef.current.delete(id);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void idbGetJson<unknown>(DEPARTURES_STORAGE_KEY).then((stored) => {
      if (cancelled) return;
      setDepartures(normalizeDepartureRows(stored));
      hydratedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!useCloud) {
      setCloudDeparturesSync({ enabled: false, status: "idle" });
      return;
    }

    let unsub: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      try {
        setCloudDeparturesSync({ enabled: true, status: "connecting" });
        await ensureFirebaseAuth();
        if (cancelled) return;
        unsub = subscribeDepartures(
          (rows) => {
            if (cancelled) return;
            if (Date.now() < suppressRemoteUntilRef.current) return;
            sweepRecentMutationGuards();
            let resolvedRows = rows;
            setDepartures((prev) => {
              const remoteById = new Map(rows.map((r) => [r.id, r]));
              const out = [...rows];

              for (const local of prev) {
                const touchedUntil = recentTouchedIdsRef.current.get(local.id) ?? 0;
                if (touchedUntil > Date.now()) {
                  const remote = remoteById.get(local.id);
                  if (!remote) {
                    out.push(local);
                  } else if (!departureRowsEqual(remote, local)) {
                    const idx = out.findIndex((x) => x.id === local.id);
                    if (idx >= 0) out[idx] = local;
                  }
                }
              }
              const deletedIds = recentDeletedIdsRef.current;
              if (deletedIds.size > 0) {
                resolvedRows = out.filter((r) => (deletedIds.get(r.id) ?? 0) <= Date.now());
                return resolvedRows;
              }
              resolvedRows = out;
              return resolvedRows;
            });
            hydratedRef.current = true;
            void idbSetJson(DEPARTURES_STORAGE_KEY, resolvedRows);
            setCloudDeparturesSync((prev) => ({
              enabled: true,
              status: "live",
              message: undefined,
              lastSyncAt: Date.now(),
              lastErrorAt: prev.lastErrorAt,
            }));
          },
          (err) => {
            console.error("[SOT] Firestore saídas:", err);
            setCloudDeparturesSync({
              enabled: true,
              status: "error",
              message: err.message || "Erro ao sincronizar com a nuvem.",
              lastErrorAt: Date.now(),
            });
          },
        );
      } catch (e) {
        console.error("[SOT] Firebase auth:", e);
        const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: string }).code) : "";
        const base = e instanceof Error ? e.message : "Falha na autenticação Firebase.";
        const hint =
          code === "auth/unauthorized-domain"
            ? " No Firebase: Authentication → Configurações → Domínios autorizados → Adicionar domínio → coloque o host do site (ex.: thiagod11lopes-ops.github.io, sem https)."
            : "";
        setCloudDeparturesSync({
          enabled: true,
          status: "error",
          message: base + hint,
          lastErrorAt: Date.now(),
        });
      }
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [useCloud, syncRefreshToken, sweepRecentMutationGuards]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    void idbSetJson(DEPARTURES_STORAGE_KEY, departures);
  }, [departures]);

  const addDeparture = useCallback((data: Omit<DepartureRecord, "id" | "createdAt">) => {
    const row: DepartureRecord = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    if (useCloud) {
      bumpLocalMutation();
      markTouched(row.id);
      setDepartures((prev) => [row, ...prev]);
      void upsertDepartureRecord(row).catch((e) => {
        console.error(e);
        window.alert("Não foi possível gravar a saída na nuvem. Verifique a ligação e as regras do Firestore.");
      });
      return;
    }
    setDepartures((prev) => [row, ...prev]);
  }, [useCloud, bumpLocalMutation, markTouched]);

  const mergeDeparturesFromBackup = useCallback(
    (rows: DepartureRecord[]) => {
      if (rows.length === 0) return;
      setDepartures((prev) => {
        const existing = new Set(prev.map((d) => d.id));
        const incoming = rows.filter((r) => r.id && !existing.has(r.id));
        if (incoming.length === 0) return prev;
        if (useCloud) {
          bumpLocalMutation();
          void batchUpsertDepartures(incoming).catch((e) => {
            console.error(e);
            window.alert("Não foi possível importar as saídas para a nuvem.");
          });
          const sorted = [...incoming].sort((a, b) => b.createdAt - a.createdAt);
          return [...sorted, ...prev];
        }
        const sorted = [...incoming].sort((a, b) => b.createdAt - a.createdAt);
        return [...sorted, ...prev];
      });
    },
    [useCloud, bumpLocalMutation],
  );

  const clearAllDepartures = useCallback(() => {
    if (useCloud) {
      bumpLocalMutation();
      setDepartures((prev) => {
        for (const d of prev) {
          markDeleted(d.id);
        }
        return [];
      });
      void deleteAllDepartureDocuments().catch((e) => {
        console.error(e);
        window.alert("Não foi possível limpar as saídas na nuvem.");
      });
      return;
    }
    setDepartures([]);
  }, [useCloud, bumpLocalMutation, markDeleted]);

  const updateDeparture = useCallback(
    (id: string, data: Omit<DepartureRecord, "id" | "createdAt">) => {
      if (useCloud) {
        bumpLocalMutation();
        setDepartures((prev) => {
          const d = prev.find((x) => x.id === id);
          if (!d) return prev;
          const next: DepartureRecord = {
            ...d,
            ...data,
            id: d.id,
            createdAt: d.createdAt,
          };
          markTouched(next.id);
          void upsertDepartureRecord(next).catch((e) => {
            console.error(e);
            window.alert("Não foi possível atualizar a saída na nuvem.");
          });
          return prev.map((x) => (x.id === id ? next : x));
        });
        return;
      }
      setDepartures((prev) =>
        prev.map((d) =>
          d.id === id
            ? {
                ...d,
                ...data,
                id: d.id,
                createdAt: d.createdAt,
              }
            : d,
        ),
      );
    },
    [useCloud, bumpLocalMutation, markTouched],
  );

  const removeDeparture = useCallback(
    (id: string) => {
      if (useCloud) {
        bumpLocalMutation();
        setDepartures((prev) => prev.filter((d) => d.id !== id));
        markDeleted(id);
        void deleteDepartureDocument(id).catch((e) => {
          console.error(e);
          window.alert("Não foi possível remover a saída na nuvem.");
        });
        return;
      }
      setDepartures((prev) => prev.filter((d) => d.id !== id));
    },
    [useCloud, bumpLocalMutation, markDeleted],
  );

  const updateDepartureKmFields = useCallback(
    (id: string, patch: DepartureKmFieldsPatch) => {
      if (useCloud) {
        bumpLocalMutation();
        setDepartures((prev) => {
          const d = prev.find((x) => x.id === id);
          if (!d || d.cancelada) return prev;
          const next = { ...d, ...patch };
          markTouched(next.id);
          void upsertDepartureRecord(next).catch((e) => {
            console.error(e);
            window.alert("Não foi possível gravar os KM na nuvem.");
          });
          return prev.map((x) => (x.id === id && !x.cancelada ? next : x));
        });
        return;
      }
      setDepartures((prev) =>
        prev.map((d) => (d.id === id && !d.cancelada ? { ...d, ...patch } : d)),
      );
    },
    [useCloud, bumpLocalMutation, markTouched],
  );

  const beginEditDeparture = useCallback((id: string) => {
    setPendingEditDepartureId(id);
    setEditIntentVersion((v) => v + 1);
  }, []);

  const clearPendingEditDeparture = useCallback(() => {
    setPendingEditDepartureId(null);
  }, []);

  const forceCloudResync = useCallback(() => {
    suppressRemoteUntilRef.current = 0;
    setCloudDeparturesSync((prev) => ({
      enabled: prev.enabled,
      status: prev.enabled ? "connecting" : "idle",
      message: prev.message,
      lastSyncAt: prev.lastSyncAt,
      lastErrorAt: prev.lastErrorAt,
    }));
    setSyncRefreshToken((v) => v + 1);
  }, []);

  const value = useMemo(
    () => ({
      departures,
      addDeparture,
      mergeDeparturesFromBackup,
      clearAllDepartures,
      updateDeparture,
      removeDeparture,
      updateDepartureKmFields,
      pendingEditDepartureId,
      editIntentVersion,
      beginEditDeparture,
      clearPendingEditDeparture,
      cloudDeparturesSync,
      forceCloudResync,
    }),
    [
      departures,
      addDeparture,
      mergeDeparturesFromBackup,
      clearAllDepartures,
      updateDeparture,
      removeDeparture,
      updateDepartureKmFields,
      pendingEditDepartureId,
      editIntentVersion,
      beginEditDeparture,
      clearPendingEditDeparture,
      cloudDeparturesSync,
      forceCloudResync,
    ],
  );

  return <DeparturesContext.Provider value={value}>{children}</DeparturesContext.Provider>;
}

export function useDepartures() {
  const ctx = useContext(DeparturesContext);
  if (!ctx) {
    throw new Error("useDepartures deve ser usado dentro de DeparturesProvider");
  }
  return ctx;
}
