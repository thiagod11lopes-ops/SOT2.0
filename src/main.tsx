import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BackupDeparturesLoader } from "./components/backup-departures-loader";
import { AppTabProvider } from "./context/app-tab-context";
import { CatalogItemsProvider } from "./context/catalog-items-context";
import { DeparturesProvider } from "./context/departures-context";
import { AvisosProvider } from "./context/avisos-context";
import { LimpezaPendenteProvider } from "./context/limpeza-pendente-context";
import { EscalaPaoProvider } from "./context/escala-pao-context";
import { MotoristaPaoProvider } from "./context/motorista-pao-context";
import { OficinaVisitasProvider } from "./context/oficina-visits-context";
import { RootErrorBoundary } from "./root-error-boundary";
import "./index.css";
import App from "./App.tsx";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error('Elemento #root não encontrado no index.html.');
}

createRoot(rootEl).render(
  <StrictMode>
    <RootErrorBoundary>
      <DeparturesProvider>
        <AppTabProvider>
          <BackupDeparturesLoader />
          <CatalogItemsProvider>
            <LimpezaPendenteProvider>
              <OficinaVisitasProvider>
                <AvisosProvider>
                  <MotoristaPaoProvider>
                    <EscalaPaoProvider>
                      <App />
                    </EscalaPaoProvider>
                  </MotoristaPaoProvider>
                </AvisosProvider>
              </OficinaVisitasProvider>
            </LimpezaPendenteProvider>
          </CatalogItemsProvider>
        </AppTabProvider>
      </DeparturesProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
