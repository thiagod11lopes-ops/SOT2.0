import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BackupDeparturesLoader } from "./components/backup-departures-loader";
import { AppTabProvider } from "./context/app-tab-context";
import { CatalogItemsProvider } from "./context/catalog-items-context";
import { DeparturesProvider } from "./context/departures-context";
import { AvisosProvider } from "./context/avisos-context";
import { LimpezaPendenteProvider } from "./context/limpeza-pendente-context";
import { OficinaVisitasProvider } from "./context/oficina-visits-context";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DeparturesProvider>
      <AppTabProvider>
        <BackupDeparturesLoader />
        <CatalogItemsProvider>
          <LimpezaPendenteProvider>
            <OficinaVisitasProvider>
              <AvisosProvider>
                <App />
              </AvisosProvider>
            </OficinaVisitasProvider>
          </LimpezaPendenteProvider>
        </CatalogItemsProvider>
      </AppTabProvider>
    </DeparturesProvider>
  </StrictMode>,
);
