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

export const LIMPEZA_PENDENTE_STORAGE_KEY = "sot-limpeza-pendente-v1";

type LimpezaPendenteContextValue = {
  /** Placas marcadas para limpeza, ordenadas. */
  placas: string[];
  setPendente: (placa: string, pendente: boolean) => void;
  isPendente: (placa: string) => boolean;
};

const LimpezaPendenteContext = createContext<LimpezaPendenteContextValue | null>(null);

export function LimpezaPendenteProvider({ children }: { children: ReactNode }) {
  const [placasSet, setPlacasSet] = useState<Set<string>>(new Set());
  const hydratedRef = useRef(false);

  useEffect(() => {
    void idbGetJson<unknown>(LIMPEZA_PENDENTE_STORAGE_KEY)
      .then((raw) => {
        const loaded = new Set<string>();
        if (Array.isArray(raw)) {
          for (const p of raw) {
            const t = typeof p === "string" ? p.trim() : "";
            if (t) loaded.add(t);
          }
        }
        setPlacasSet((prev) => {
          const merged = new Set(loaded);
          for (const p of prev) merged.add(p);
          return merged;
        });
      })
      .finally(() => {
        hydratedRef.current = true;
      });
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    void idbSetJson(
      LIMPEZA_PENDENTE_STORAGE_KEY,
      Array.from(placasSet).sort((a, b) => a.localeCompare(b, "pt-BR")),
    );
  }, [placasSet]);

  const setPendente = useCallback((placa: string, pendente: boolean) => {
    const t = placa.trim();
    if (!t) return;
    setPlacasSet((prev) => {
      const next = new Set(prev);
      const existing = [...next].find((p) => p.toLowerCase() === t.toLowerCase());
      if (pendente) {
        next.add(existing ?? t);
      } else if (existing) {
        next.delete(existing);
      }
      return next;
    });
  }, []);

  const isPendente = useCallback(
    (placa: string) => {
      const t = placa.trim().toLowerCase();
      return [...placasSet].some((p) => p.toLowerCase() === t);
    },
    [placasSet],
  );

  const placas = useMemo(
    () => Array.from(placasSet).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [placasSet],
  );

  const value = useMemo(
    () => ({ placas, setPendente, isPendente }),
    [placas, setPendente, isPendente],
  );

  return (
    <LimpezaPendenteContext.Provider value={value}>{children}</LimpezaPendenteContext.Provider>
  );
}

export function useLimpezaPendente() {
  const ctx = useContext(LimpezaPendenteContext);
  if (!ctx) {
    throw new Error("useLimpezaPendente deve ser usado dentro de LimpezaPendenteProvider");
  }
  return ctx;
}
