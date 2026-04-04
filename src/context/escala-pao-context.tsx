import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  type EscalaPaoStored,
  getEscalaPaoStored,
  getMotoristaEscalaParaData,
  setEscalaPaoStored,
} from "../lib/escalaPaoStorage";
import {
  dedupeIntegrantesOrder,
  getIntegrantesPaoStored,
  setIntegrantesPaoStored,
} from "../lib/integrantesPaoStorage";

type EscalaPaoContextValue = {
  escala: EscalaPaoStored;
  /** Nomes usados na distribuição e no select do calendário (não vêm da Frota). */
  integrantes: string[];
  setIntegrantes: (next: string[]) => void;
  /** Motorista escalado para a data (vazio em fins de semana ou se não definido). */
  motoristaParaData: (date: Date) => string;
  /** Atualiza um dia (modo editar no calendário). */
  setMotoristaNaData: (dateKey: string, nome: string) => void;
  /** Substitui o mapa completo (ex.: distribuição automática). */
  setEscalaCompleta: (next: EscalaPaoStored) => void;
};

const EscalaPaoContext = createContext<EscalaPaoContextValue | null>(null);

export function EscalaPaoProvider({ children }: { children: ReactNode }) {
  const [escala, setEscala] = useState<EscalaPaoStored>(() => getEscalaPaoStored());
  const [integrantes, setIntegrantesState] = useState<string[]>(() => getIntegrantesPaoStored());

  const setIntegrantes = useCallback((next: string[]) => {
    const cleaned = dedupeIntegrantesOrder(next);
    setIntegrantesState(cleaned);
    setIntegrantesPaoStored(cleaned);
  }, []);

  const motoristaParaData = useCallback(
    (date: Date) => getMotoristaEscalaParaData(escala, date),
    [escala],
  );

  const setMotoristaNaData = useCallback((dateKey: string, nome: string) => {
    setEscala((prev) => {
      const next = { ...prev, [dateKey]: nome };
      setEscalaPaoStored(next);
      return next;
    });
  }, []);

  const setEscalaCompleta = useCallback((next: EscalaPaoStored) => {
    setEscala(next);
    setEscalaPaoStored(next);
  }, []);

  const value = useMemo(
    () => ({
      escala,
      integrantes,
      setIntegrantes,
      motoristaParaData,
      setMotoristaNaData,
      setEscalaCompleta,
    }),
    [escala, integrantes, setIntegrantes, motoristaParaData, setMotoristaNaData, setEscalaCompleta],
  );

  return <EscalaPaoContext.Provider value={value}>{children}</EscalaPaoContext.Provider>;
}

export function useEscalaPao() {
  const ctx = useContext(EscalaPaoContext);
  if (!ctx) {
    throw new Error("useEscalaPao deve ser usado dentro de EscalaPaoProvider");
  }
  return ctx;
}
