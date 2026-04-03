import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { idbGetJson, idbSetJson } from "../lib/indexedDb";

export const AVISOS_STORAGE_KEY = "sot-avisos-v1";

export type AvisosPersistedState = {
  /** Texto do aviso fixo inferior (opcional). */
  avisoPrincipal: string;
  /** Uma faina por linha — exibidas no ticker e no card Fainas Gerais. */
  fainasTexto: string;
};

const defaultState: AvisosPersistedState = {
  avisoPrincipal: "",
  fainasTexto: "",
};

type AvisosContextValue = AvisosPersistedState & {
  setAvisoPrincipal: (v: string) => void;
  setFainasTexto: (v: string) => void;
  fainasLinhas: string[];
};

const AvisosContext = createContext<AvisosContextValue | null>(null);

function normalizeStored(raw: unknown): AvisosPersistedState {
  if (!raw || typeof raw !== "object") return { ...defaultState };
  const o = raw as Record<string, unknown>;
  return {
    avisoPrincipal: typeof o.avisoPrincipal === "string" ? o.avisoPrincipal : "",
    fainasTexto: typeof o.fainasTexto === "string" ? o.fainasTexto : "",
  };
}

export function AvisosProvider({ children }: { children: ReactNode }) {
  const [avisoPrincipal, setAvisoPrincipalState] = useState("");
  const [fainasTexto, setFainasTextoState] = useState("");
  const [persistReady, setPersistReady] = useState(false);

  useEffect(() => {
    void idbGetJson<unknown>(AVISOS_STORAGE_KEY)
      .then((raw) => {
        const n = normalizeStored(raw);
        setAvisoPrincipalState(n.avisoPrincipal);
        setFainasTextoState(n.fainasTexto);
      })
      .finally(() => setPersistReady(true));
  }, []);

  useEffect(() => {
    if (!persistReady) return;
    const payload: AvisosPersistedState = { avisoPrincipal, fainasTexto };
    void idbSetJson(AVISOS_STORAGE_KEY, payload);
  }, [persistReady, avisoPrincipal, fainasTexto]);

  const setAvisoPrincipal = useCallback((v: string) => {
    setAvisoPrincipalState(v);
  }, []);

  const setFainasTexto = useCallback((v: string) => {
    setFainasTextoState(v);
  }, []);

  const fainasLinhas = useMemo(
    () =>
      fainasTexto
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    [fainasTexto],
  );

  const value = useMemo(
    () => ({
      avisoPrincipal,
      fainasTexto,
      setAvisoPrincipal,
      setFainasTexto,
      fainasLinhas,
    }),
    [avisoPrincipal, fainasTexto, setAvisoPrincipal, setFainasTexto, fainasLinhas],
  );

  return <AvisosContext.Provider value={value}>{children}</AvisosContext.Provider>;
}

export function useAvisos() {
  const ctx = useContext(AvisosContext);
  if (!ctx) {
    throw new Error("useAvisos deve ser usado dentro de AvisosProvider");
  }
  return ctx;
}
