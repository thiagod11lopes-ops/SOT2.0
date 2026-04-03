import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type AppTabContextValue = {
  activeTab: string | null;
  setActiveTab: (tab: string | null) => void;
};

const AppTabContext = createContext<AppTabContextValue | null>(null);

export function AppTabProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const value = useMemo(() => ({ activeTab, setActiveTab }), [activeTab]);
  return <AppTabContext.Provider value={value}>{children}</AppTabContext.Provider>;
}

export function useAppTab() {
  const ctx = useContext(AppTabContext);
  if (!ctx) {
    throw new Error("useAppTab deve ser usado dentro de AppTabProvider");
  }
  return ctx;
}
