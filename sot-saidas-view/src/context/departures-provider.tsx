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

const DEPARTURES_STORAGE_KEY = "sot-departures-v1";

export type DepartureKmFieldsPatch = Partial<
  Pick<DepartureRecord, "kmSaida" | "kmChegada" | "chegada">
>;

type Value = {
  departures: DepartureRecord[];
  mergeDeparturesFromBackup: (rows: DepartureRecord[]) => void;
  updateDepartureKmFields: (id: string, patch: DepartureKmFieldsPatch) => void;
};

const Ctx = createContext<Value | null>(null);

export function DeparturesProvider({ children }: { children: ReactNode }) {
  const [departures, setDepartures] = useState<DepartureRecord[]>([]);
  const hydratedRef = useRef(false);

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

  const updateDepartureKmFields = useCallback((id: string, patch: DepartureKmFieldsPatch) => {
    setDepartures((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }, []);

  const value = useMemo(
    () => ({ departures, mergeDeparturesFromBackup, updateDepartureKmFields }),
    [departures, mergeDeparturesFromBackup, updateDepartureKmFields],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDepartures() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDepartures dentro de DeparturesProvider");
  return ctx;
}
