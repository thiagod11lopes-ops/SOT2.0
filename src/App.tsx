import { useEffect, useMemo, useRef, useState } from "react";
import { Dashboard } from "./components/dashboard";
import { Layout } from "./components/layout";
import { DeparturesListPage } from "./components/departures-list-page";
import { PlaceholderPage } from "./components/placeholder-page";
import { SettingsPage } from "./components/settings-page";
import { RegisterDeparturePage } from "./components/register-departure-page";
import { useDepartures } from "./context/departures-context";
import { isSettingsTab } from "./lib/tabMatch";

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
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const { editIntentVersion } = useDepartures();
  const lastEditIntentVersion = useRef(editIntentVersion);

  useEffect(() => {
    if (editIntentVersion > 0 && editIntentVersion !== lastEditIntentVersion.current) {
      lastEditIntentVersion.current = editIntentVersion;
      setActiveTab("Cadastrar Saída");
    }
  }, [editIntentVersion]);

  const content = useMemo(() => {
    if (!activeTab) return <Dashboard />;
    if (activeTab === "Cadastrar Saída") return <RegisterDeparturePage />;
    if (activeTab === "Saídas Administrativas")
      return (
        <DeparturesListPage title="Saídas Administrativas" filterTipo="Administrativa" />
      );
    if (activeTab === "Saídas de Ambulância")
      return <DeparturesListPage title="Saídas de Ambulância" filterTipo="Ambulância" />;
    if (isSettingsTab(activeTab)) return <SettingsPage />;
    return <PlaceholderPage title={activeTab} />;
  }, [activeTab]);

  return (
    <Layout tabs={tabs} activeTab={activeTab ?? ""} onTabChange={setActiveTab}>
      {content}
    </Layout>
  );
}

export default App;
