import { useEffect, useMemo, useRef, useState } from "react";
import { SaidasMobileApp } from "./saidas-mobile/saidas-mobile-app";
import { AvisosPage } from "./components/avisos-page";
import { Dashboard } from "./components/dashboard";
import { HomeNewsTicker } from "./components/home-news-ticker";
import { Layout } from "./components/layout";
import { DeparturesListPage } from "./components/departures-list-page";
import { PlaceholderPage } from "./components/placeholder-page";
import { SettingsPage } from "./components/settings-page";
import { FleetPersonnelPage } from "./components/fleet-personnel-page";
import { RegisterDeparturePage } from "./components/register-departure-page";
import { useAppTab } from "./context/app-tab-context";
import { useDepartures } from "./context/departures-context";
import { useIdleReturnToPrincipal } from "./hooks/useIdleReturnToPrincipal";
import { useOilMaintenanceMap } from "./hooks/useOilMaintenanceMap";
import { isSettingsTab } from "./lib/tabMatch";

function useLocationHash() {
  const [hash, setHash] = useState(() => (typeof window !== "undefined" ? window.location.hash : ""));
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

const tabs = [
  "Cadastrar Saída",
  "Saídas Administrativas",
  "Saídas de Ambulância",
  "Vistoria",
  "Frota e Pessoal",
  "Estatística",
  "Avisos",
  "Equipamentos e Suprimentos",
  "Configurações",
];

function App() {
  const hash = useLocationHash();
  const { activeTab, setActiveTab } = useAppTab();
  /** Um único listener Firestore `oilMaintenance` para Dashboard + faixa inferior (evita leituras duplicadas). */
  const mapaOleo = useOilMaintenanceMap();
  useIdleReturnToPrincipal();
  const { editIntentVersion } = useDepartures();
  const lastEditIntentVersion = useRef(editIntentVersion);

  useEffect(() => {
    if (hash.startsWith("#/saidas")) return;
    if (editIntentVersion > 0 && editIntentVersion !== lastEditIntentVersion.current) {
      lastEditIntentVersion.current = editIntentVersion;
      setActiveTab("Cadastrar Saída");
    }
  }, [editIntentVersion, setActiveTab, hash]);

  const content = useMemo(() => {
    if (!activeTab) return <Dashboard mapaOleo={mapaOleo} />;
    if (activeTab === "Cadastrar Saída") return <RegisterDeparturePage />;
    if (activeTab === "Saídas Administrativas")
      return (
        <DeparturesListPage title="Saídas Administrativas" filterTipo="Administrativa" />
      );
    if (activeTab === "Saídas de Ambulância")
      return <DeparturesListPage title="Saídas de Ambulância" filterTipo="Ambulância" />;
    if (isSettingsTab(activeTab)) return <SettingsPage />;
    if (activeTab === "Frota e Pessoal") return <FleetPersonnelPage />;
    if (activeTab === "Avisos") return <AvisosPage />;
    return <PlaceholderPage title={activeTab} />;
  }, [activeTab, mapaOleo]);

  if (hash.startsWith("#/saidas")) {
    return <SaidasMobileApp />;
  }

  const isHome = !activeTab;

  return (
    <>
      <Layout
        tabs={tabs}
        activeTab={activeTab ?? ""}
        onTabChange={setActiveTab}
        homeTickerActive={isHome}
      >
        {content}
      </Layout>
      {isHome ? <HomeNewsTicker mapaOleo={mapaOleo} /> : null}
    </>
  );
}

export default App;
