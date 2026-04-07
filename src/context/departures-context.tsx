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

export function DeparturesProvider({ children }: { children: ReactNode }) {
  const [departures, setDepartures] = useState<DepartureRecord[]>([]);
  const hydratedRef = useRef(false);
  const suppressRemoteUntilRef = useRef(0);
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
            setDepartures(rows);
            hydratedRef.current = true;
            void idbSetJson(DEPARTURES_STORAGE_KEY, rows);
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
  }, [useCloud, syncRefreshToken]);

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
      setDepartures((prev) => [row, ...prev]);
      void upsertDepartureRecord(row).catch((e) => {
        console.error(e);
        window.alert("Não foi possível gravar a saída na nuvem. Verifique a ligação e as regras do Firestore.");
      });
      return;
    }
    setDepartures((prev) => [row, ...prev]);
  }, [useCloud, bumpLocalMutation]);

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
      setDepartures([]);
      void deleteAllDepartureDocuments().catch((e) => {
        console.error(e);
        window.alert("Não foi possível limpar as saídas na nuvem.");
      });
      return;
    }
    setDepartures([]);
  }, [useCloud, bumpLocalMutation]);

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
    [useCloud, bumpLocalMutation],
  );

  const removeDeparture = useCallback(
    (id: string) => {
      if (useCloud) {
        bumpLocalMutation();
        setDepartures((prev) => prev.filter((d) => d.id !== id));
        void deleteDepartureDocument(id).catch((e) => {
          console.error(e);
          window.alert("Não foi possível remover a saída na nuvem.");
        });
        return;
      }
      setDepartures((prev) => prev.filter((d) => d.id !== id));
    },
    [useCloud, bumpLocalMutation],
  );

  const updateDepartureKmFields = useCallback(
    (id: string, patch: DepartureKmFieldsPatch) => {
      if (useCloud) {
        bumpLocalMutation();
        setDepartures((prev) => {
          const d = prev.find((x) => x.id === id);
          if (!d || d.cancelada) return prev;
          const next = { ...d, ...patch };
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
    [useCloud, bumpLocalMutation],
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
