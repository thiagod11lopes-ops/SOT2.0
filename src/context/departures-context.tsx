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
  isDepartureVersionConflictError,
  subscribeDepartures,
  upsertDepartureRecord,
} from "../lib/firebase/departuresFirestore";
import { getSyncClientId } from "../lib/firebase/clientIdentity";
import { isFirebaseConfigured } from "../lib/firebase/config";
import { normalizeDepartureRows } from "../lib/normalizeDepartures";
import type { DepartureRecord } from "../types/departure";
import { useSyncPreference } from "./sync-preference-context";

export type DepartureKmFieldsPatch = Partial<
  Pick<DepartureRecord, "kmSaida" | "kmChegada" | "chegada">
>;

export type CloudDeparturesSyncState = {
  enabled: boolean;
  status: "idle" | "connecting" | "live" | "error";
  message?: string;
  lastSyncAt?: number;
  lastErrorAt?: number;
  conflictCountToday?: number;
};

type DeparturesContextValue = {
  departures: DepartureRecord[];
  addDeparture: (data: Omit<DepartureRecord, "id" | "createdAt">) => void;
  mergeDeparturesFromBackup: (rows: DepartureRecord[]) => void;
  clearAllDepartures: () => void;
  updateDeparture: (
    id: string,
    data: Omit<DepartureRecord, "id" | "createdAt">,
    options?: { expectedBaseVersion?: number; onVersionConflict?: () => void },
  ) => void;
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
const WRITE_RETRY_MAX = 6;
const MIGRATION_UPDATED_BY = "migration-v1";
const CONFLICT_METRICS_KEY = "sot_departures_conflicts_daily_v1";

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

/**
 * Ordenação de "quem é mais novo":
 * 1) version
 * 2) updatedAt
 * 3) updatedBy (desempate estável)
 */
function compareDepartureFreshness(a: DepartureRecord, b: DepartureRecord): number {
  const av = a.version ?? 0;
  const bv = b.version ?? 0;
  if (av !== bv) return av - bv;
  const at = a.updatedAt ?? a.createdAt ?? 0;
  const bt = b.updatedAt ?? b.createdAt ?? 0;
  if (at !== bt) return at - bt;
  return (a.updatedBy ?? "").localeCompare(b.updatedBy ?? "");
}

function needsDepartureMetadataMigration(r: DepartureRecord): boolean {
  const version = r.version ?? 0;
  const updatedAt = r.updatedAt ?? 0;
  const updatedBy = (r.updatedBy ?? "").trim();
  return version <= 0 || updatedAt <= 0 || updatedBy.length === 0;
}

function isRetryableWriteError(err: unknown): boolean {
  const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "";
  return (
    code.includes("unavailable") ||
    code.includes("deadline-exceeded") ||
    code.includes("resource-exhausted") ||
    code.includes("aborted") ||
    code.includes("network") ||
    code === "auth/network-request-failed"
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function localDayKeyNow(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function readConflictCountToday(): number {
  try {
    const raw = localStorage.getItem(CONFLICT_METRICS_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { dayKey?: string; count?: number };
    if (parsed.dayKey !== localDayKeyNow()) return 0;
    return typeof parsed.count === "number" && Number.isFinite(parsed.count)
      ? Math.max(0, Math.trunc(parsed.count))
      : 0;
  } catch {
    return 0;
  }
}

function incrementConflictCountToday(): number {
  const next = readConflictCountToday() + 1;
  try {
    localStorage.setItem(
      CONFLICT_METRICS_KEY,
      JSON.stringify({ dayKey: localDayKeyNow(), count: next }),
    );
  } catch {
    /* ignore */
  }
  return next;
}

export function DeparturesProvider({ children }: { children: ReactNode }) {
  const [departures, setDepartures] = useState<DepartureRecord[]>([]);
  const hydratedRef = useRef(false);
  const suppressRemoteUntilRef = useRef(0);
  const initialRemoteSyncDoneRef = useRef(false);
  const recentTouchedIdsRef = useRef<Map<string, number>>(new Map());
  const recentDeletedIdsRef = useRef<Map<string, number>>(new Map());
  const [pendingEditDepartureId, setPendingEditDepartureId] = useState<string | null>(null);
  const [editIntentVersion, setEditIntentVersion] = useState(0);
  const [syncRefreshToken, setSyncRefreshToken] = useState(0);
  const [cloudDeparturesSync, setCloudDeparturesSync] = useState<CloudDeparturesSyncState>(() => ({
    enabled: isFirebaseConfigured(),
    status: isFirebaseConfigured() ? "connecting" : "idle",
    conflictCountToday: readConflictCountToday(),
  }));

  const { firebaseOnlyEnabled } = useSyncPreference();
  const useCloud = isFirebaseConfigured() && firebaseOnlyEnabled;
  const clientIdRef = useRef<string>(getSyncClientId());
  const writeQueueRef = useRef<Array<() => Promise<void>>>([]);
  const writeQueueProcessingRef = useRef(false);
  const migrationAttemptedRef = useRef(false);
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

  const processWriteQueue = useCallback(async () => {
    if (writeQueueProcessingRef.current) return;
    writeQueueProcessingRef.current = true;
    try {
      while (writeQueueRef.current.length > 0) {
        const task = writeQueueRef.current.shift()!;
        await task();
      }
    } finally {
      writeQueueProcessingRef.current = false;
    }
  }, []);

  const enqueueWrite = useCallback(
    (
      write: () => Promise<void>,
      messages?: { conflict?: string; generic?: string },
      hooks?: { onVersionConflict?: () => void },
    ) => {
      writeQueueRef.current.push(async () => {
        for (let attempt = 1; attempt <= WRITE_RETRY_MAX; attempt++) {
          try {
            await write();
            return;
          } catch (e) {
            if (isDepartureVersionConflictError(e)) {
              const nextConflicts = incrementConflictCountToday();
              setCloudDeparturesSync((prev) => ({ ...prev, conflictCountToday: nextConflicts }));
              hooks?.onVersionConflict?.();
              if (messages?.conflict) window.alert(messages.conflict);
              suppressRemoteUntilRef.current = 0;
              setCloudDeparturesSync((prev) => ({
                enabled: prev.enabled,
                status: prev.enabled ? "connecting" : "idle",
                message: prev.message,
                lastSyncAt: prev.lastSyncAt,
                lastErrorAt: prev.lastErrorAt,
                conflictCountToday: nextConflicts,
              }));
              setSyncRefreshToken((v) => v + 1);
              return;
            }
            const retry = attempt < WRITE_RETRY_MAX && isRetryableWriteError(e);
            if (!retry) {
              console.error(e);
              if (messages?.generic) window.alert(messages.generic);
              return;
            }
            await sleep(250 * 2 ** (attempt - 1));
          }
        }
      });
      void processWriteQueue();
    },
    [processWriteQueue],
  );

  useEffect(() => {
    if (useCloud) {
      // Modo estrito Firebase: não hidratar estado inicial com cache local.
      return;
    }
    let cancelled = false;
    void idbGetJson<unknown>(DEPARTURES_STORAGE_KEY).then((stored) => {
      if (cancelled) return;
      setDepartures(normalizeDepartureRows(stored));
      hydratedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [useCloud]);

  useEffect(() => {
    if (!useCloud) {
      setCloudDeparturesSync({
        enabled: false,
        status: "idle",
        conflictCountToday: readConflictCountToday(),
      });
      return;
    }

    let unsub: (() => void) | undefined;
    let cancelled = false;
    initialRemoteSyncDoneRef.current = false;
    migrationAttemptedRef.current = false;

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
            const firstRemoteSync = !initialRemoteSyncDoneRef.current;
            setDepartures((prev) => {
              const remoteById = new Map(rows.map((r) => [r.id, r]));
              const mergedById = new Map(rows.map((r) => [r.id, r]));

              for (const local of prev) {
                const remote = remoteById.get(local.id);
                if (!remote) {
                  const touchedUntil = recentTouchedIdsRef.current.get(local.id) ?? 0;
                  if (touchedUntil > Date.now()) {
                    mergedById.set(local.id, local);
                  }
                  continue;
                }
                if (!departureRowsEqual(remote, local)) {
                  // Passo 8: aplicar sempre o mais novo por version/updatedAt/updatedBy.
                  const keepLocal = compareDepartureFreshness(local, remote) > 0;
                  if (keepLocal) {
                    mergedById.set(local.id, local);
                  }
                }
              }
              const out = Array.from(mergedById.values());
              const deletedIds = recentDeletedIdsRef.current;
              if (deletedIds.size > 0) {
                resolvedRows = out.filter((r) => (deletedIds.get(r.id) ?? 0) <= Date.now());
                return resolvedRows;
              }
              resolvedRows = out;
              return resolvedRows;
            });
            if (firstRemoteSync) {
              initialRemoteSyncDoneRef.current = true;
              if (!migrationAttemptedRef.current) {
                migrationAttemptedRef.current = true;
                const docsToMigrate = rows.filter(needsDepartureMetadataMigration);
                if (docsToMigrate.length > 0) {
                  const now = Date.now();
                  const migrated = docsToMigrate.map((r) => ({
                    ...r,
                    version: (r.version ?? 0) > 0 ? (r.version ?? 0) : 1,
                    updatedAt: (r.updatedAt ?? 0) > 0 ? (r.updatedAt ?? 0) : now,
                    updatedBy: (r.updatedBy ?? "").trim() || MIGRATION_UPDATED_BY,
                  }));
                  enqueueWrite(
                    () => batchUpsertDepartures(migrated),
                    { generic: "Falha ao migrar metadados de versão das saídas legadas." },
                  );
                }
              }
            }
            hydratedRef.current = true;
            void idbSetJson(DEPARTURES_STORAGE_KEY, resolvedRows);
            setCloudDeparturesSync((prev) => ({
              enabled: true,
              status: "live",
              message: undefined,
              lastSyncAt: Date.now(),
              lastErrorAt: prev.lastErrorAt,
              conflictCountToday: readConflictCountToday(),
            }));
          },
          (err) => {
            console.error("[SOT] Firestore saídas:", err);
            setCloudDeparturesSync({
              enabled: true,
              status: "error",
              message: err.message || "Erro ao sincronizar com a nuvem.",
              lastErrorAt: Date.now(),
              conflictCountToday: readConflictCountToday(),
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
          conflictCountToday: readConflictCountToday(),
        });
      }
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [useCloud, syncRefreshToken, sweepRecentMutationGuards, enqueueWrite]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    void idbSetJson(DEPARTURES_STORAGE_KEY, departures);
  }, [departures]);

  const addDeparture = useCallback((data: Omit<DepartureRecord, "id" | "createdAt">) => {
    const now = Date.now();
    const row: DepartureRecord = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      updatedBy: clientIdRef.current,
    };
    if (useCloud) {
      bumpLocalMutation();
      markTouched(row.id);
      setDepartures((prev) => [row, ...prev]);
      enqueueWrite(
        () => upsertDepartureRecord(row),
        { generic: "Não foi possível gravar a saída na nuvem. Verifique a ligação e as regras do Firestore." },
      );
      return;
    }
    setDepartures((prev) => [row, ...prev]);
  }, [useCloud, bumpLocalMutation, markTouched, enqueueWrite]);

  const mergeDeparturesFromBackup = useCallback(
    (rows: DepartureRecord[]) => {
      if (rows.length === 0) return;
      const now = Date.now();
      setDepartures((prev) => {
        const existing = new Set(prev.map((d) => d.id));
        const incoming = rows
          .filter((r) => r.id && !existing.has(r.id))
          .map((r) => ({
            ...r,
            updatedAt:
              typeof r.updatedAt === "number" && Number.isFinite(r.updatedAt) ? r.updatedAt : now,
            updatedBy:
              typeof r.updatedBy === "string" && r.updatedBy.trim()
                ? r.updatedBy.trim()
                : clientIdRef.current,
          }));
        if (incoming.length === 0) return prev;
        if (useCloud) {
          bumpLocalMutation();
          enqueueWrite(
            () => batchUpsertDepartures(incoming),
            { generic: "Não foi possível importar as saídas para a nuvem." },
          );
          const sorted = [...incoming].sort((a, b) => b.createdAt - a.createdAt);
          return [...sorted, ...prev];
        }
        const sorted = [...incoming].sort((a, b) => b.createdAt - a.createdAt);
        return [...sorted, ...prev];
      });
    },
    [useCloud, bumpLocalMutation, enqueueWrite],
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
      enqueueWrite(
        () => deleteAllDepartureDocuments(),
        { generic: "Não foi possível limpar as saídas na nuvem." },
      );
      return;
    }
    setDepartures([]);
  }, [useCloud, bumpLocalMutation, markDeleted, enqueueWrite]);

  const updateDeparture = useCallback(
    (
      id: string,
      data: Omit<DepartureRecord, "id" | "createdAt">,
      options?: { expectedBaseVersion?: number; onVersionConflict?: () => void },
    ) => {
      if (useCloud) {
        bumpLocalMutation();
        setDepartures((prev) => {
          const d = prev.find((x) => x.id === id);
          if (!d) return prev;
          const now = Date.now();
          const next: DepartureRecord = {
            ...d,
            ...data,
            id: d.id,
            createdAt: d.createdAt,
            updatedAt: now,
            updatedBy: clientIdRef.current,
          };
          markTouched(next.id);
          const expectedBaseVersion = options?.expectedBaseVersion ?? d.version ?? 0;
          enqueueWrite(
            () => upsertDepartureRecord(next, { expectedBaseVersion }),
            {
              conflict: "A saída foi alterada em outro dispositivo.",
              generic: "Não foi possível atualizar a saída na nuvem.",
            },
            {
              onVersionConflict: options?.onVersionConflict,
            },
          );
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
    [useCloud, bumpLocalMutation, markTouched, enqueueWrite],
  );

  const removeDeparture = useCallback(
    (id: string) => {
      if (useCloud) {
        bumpLocalMutation();
        setDepartures((prev) => prev.filter((d) => d.id !== id));
        markDeleted(id);
        enqueueWrite(
          () => deleteDepartureDocument(id),
          { generic: "Não foi possível remover a saída na nuvem." },
        );
        return;
      }
      setDepartures((prev) => prev.filter((d) => d.id !== id));
    },
    [useCloud, bumpLocalMutation, markDeleted, enqueueWrite],
  );

  const updateDepartureKmFields = useCallback(
    (id: string, patch: DepartureKmFieldsPatch) => {
      if (useCloud) {
        bumpLocalMutation();
        setDepartures((prev) => {
          const d = prev.find((x) => x.id === id);
          if (!d || d.cancelada) return prev;
          const next = {
            ...d,
            ...patch,
            updatedAt: Date.now(),
            updatedBy: clientIdRef.current,
          };
          markTouched(next.id);
          enqueueWrite(
            () => upsertDepartureRecord(next, { expectedBaseVersion: d.version ?? 0 }),
            {
              conflict: "Conflito de versão: os KM foram alterados em outro dispositivo.",
              generic: "Não foi possível gravar os KM na nuvem.",
            },
          );
          return prev.map((x) => (x.id === id && !x.cancelada ? next : x));
        });
        return;
      }
      setDepartures((prev) =>
        prev.map((d) => (d.id === id && !d.cancelada ? { ...d, ...patch } : d)),
      );
    },
    [useCloud, bumpLocalMutation, markTouched, enqueueWrite],
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
      conflictCountToday: readConflictCountToday(),
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
