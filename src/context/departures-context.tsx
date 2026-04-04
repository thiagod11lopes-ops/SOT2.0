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
import { normalizeDepartureRows } from "../lib/normalizeDepartures";
import type { DepartureRecord } from "../types/departure";

export type DepartureKmFieldsPatch = Partial<
  Pick<DepartureRecord, "kmSaida" | "kmChegada" | "chegada">
>;

type DeparturesContextValue = {
  departures: DepartureRecord[];
  addDeparture: (data: Omit<DepartureRecord, "id" | "createdAt">) => void;
  /** Mescla registros importados do backup SOT (ignora ids já presentes). */
  mergeDeparturesFromBackup: (rows: DepartureRecord[]) => void;
  /** Remove todas as saídas (administrativas e ambulância). */
  clearAllDepartures: () => void;
  updateDeparture: (id: string, data: Omit<DepartureRecord, "id" | "createdAt">) => void;
  removeDeparture: (id: string) => void;
  updateDepartureKmFields: (id: string, patch: DepartureKmFieldsPatch) => void;
  /** Id da saída a abrir no formulário (Cadastrar Nova Saída). */
  pendingEditDepartureId: string | null;
  /** Incrementado a cada pedido de edição — para hidratar o formulário uma vez (Strict Mode). */
  editIntentVersion: number;
  beginEditDeparture: (id: string) => void;
  clearPendingEditDeparture: () => void;
};

const DeparturesContext = createContext<DeparturesContextValue | null>(null);
const DEPARTURES_STORAGE_KEY = "sot-departures-v1";

export function DeparturesProvider({ children }: { children: ReactNode }) {
  const [departures, setDepartures] = useState<DepartureRecord[]>([]);
  const hydratedRef = useRef(false);
  const [pendingEditDepartureId, setPendingEditDepartureId] = useState<string | null>(null);
  const [editIntentVersion, setEditIntentVersion] = useState(0);

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
    if (!hydratedRef.current) return;
    void idbSetJson(DEPARTURES_STORAGE_KEY, departures);
  }, [departures]);

  const addDeparture = useCallback((data: Omit<DepartureRecord, "id" | "createdAt">) => {
    const row: DepartureRecord = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    setDepartures((prev) => [row, ...prev]);
  }, []);

  const mergeDeparturesFromBackup = useCallback((rows: DepartureRecord[]) => {
    if (rows.length === 0) return;
    setDepartures((prev) => {
      const existing = new Set(prev.map((d) => d.id));
      const incoming = rows.filter((r) => r.id && !existing.has(r.id));
      if (incoming.length === 0) return prev;
      const sorted = [...incoming].sort((a, b) => b.createdAt - a.createdAt);
      return [...sorted, ...prev];
    });
  }, []);

  const clearAllDepartures = useCallback(() => {
    setDepartures([]);
  }, []);

  const updateDeparture = useCallback((id: string, data: Omit<DepartureRecord, "id" | "createdAt">) => {
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
  }, []);

  const removeDeparture = useCallback((id: string) => {
    setDepartures((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const updateDepartureKmFields = useCallback((id: string, patch: DepartureKmFieldsPatch) => {
    setDepartures((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    );
  }, []);

  const beginEditDeparture = useCallback((id: string) => {
    setPendingEditDepartureId(id);
    setEditIntentVersion((v) => v + 1);
  }, []);

  const clearPendingEditDeparture = useCallback(() => {
    setPendingEditDepartureId(null);
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
