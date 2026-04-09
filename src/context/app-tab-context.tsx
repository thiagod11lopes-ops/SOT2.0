import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type AppTabContextValue = {
  activeTab: string | null;
  setActiveTab: (tab: string | null) => void;
  /** Ao abrir a lista após cadastro: data da saída (dd/mm/aaaa) para o filtro da tabela. */
  pendingDeparturesFilterDatePtBr: string | null;
  setPendingDeparturesFilterDatePtBr: (d: string | null) => void;
  /** Incrementado ao aplicar filtro pós-cadastro para remontar `DeparturesListPage`. */
  departuresListMountKey: number;
  bumpDeparturesListMountKey: () => void;
  /**
   * Incrementado quando a UI pede abrir Frota e Pessoal → Viaturas → Manutenções
   * (ex.: ícones na página inicial). `FleetPersonnelPage` reage ao valor.
   */
  fleetManutencoesFocusKey: number;
  requestFleetManutencoesTab: () => void;
};

const AppTabContext = createContext<AppTabContextValue | null>(null);

export function AppTabProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [pendingDeparturesFilterDatePtBr, setPendingDeparturesFilterDatePtBr] = useState<string | null>(
    null,
  );
  const [departuresListMountKey, setDeparturesListMountKey] = useState(0);
  const bumpDeparturesListMountKey = useCallback(() => {
    setDeparturesListMountKey((k) => k + 1);
  }, []);
  const [fleetManutencoesFocusKey, setFleetManutencoesFocusKey] = useState(0);
  const requestFleetManutencoesTab = useCallback(() => {
    setFleetManutencoesFocusKey((k) => k + 1);
  }, []);

  const value = useMemo(
    () => ({
      activeTab,
      setActiveTab,
      pendingDeparturesFilterDatePtBr,
      setPendingDeparturesFilterDatePtBr,
      departuresListMountKey,
      bumpDeparturesListMountKey,
      fleetManutencoesFocusKey,
      requestFleetManutencoesTab,
    }),
    [
      activeTab,
      pendingDeparturesFilterDatePtBr,
      departuresListMountKey,
      bumpDeparturesListMountKey,
      fleetManutencoesFocusKey,
      requestFleetManutencoesTab,
    ],
  );

  return <AppTabContext.Provider value={value}>{children}</AppTabContext.Provider>;
}

export function useAppTab() {
  const ctx = useContext(AppTabContext);
  if (!ctx) {
    throw new Error("useAppTab deve ser usado dentro de AppTabProvider");
  }
  return ctx;
}
