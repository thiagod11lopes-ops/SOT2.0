import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getMotoristaPaoStored, setMotoristaPaoStored } from "../lib/motoristaPaoStorage";

type MotoristaPaoContextValue = {
  /** Nome exibido no cabeçalho (motorista que leva o pão). */
  nome: string;
  setNome: (value: string) => void;
};

const MotoristaPaoContext = createContext<MotoristaPaoContextValue | null>(null);

export function MotoristaPaoProvider({ children }: { children: ReactNode }) {
  const [nome, setNomeState] = useState(() => getMotoristaPaoStored());

  const setNome = useCallback((value: string) => {
    setNomeState(value);
    setMotoristaPaoStored(value);
  }, []);

  const value = useMemo(() => ({ nome, setNome }), [nome, setNome]);

  return (
    <MotoristaPaoContext.Provider value={value}>{children}</MotoristaPaoContext.Provider>
  );
}

export function useMotoristaPao() {
  const ctx = useContext(MotoristaPaoContext);
  if (!ctx) {
    throw new Error("useMotoristaPao deve ser usado dentro de MotoristaPaoProvider");
  }
  return ctx;
}
