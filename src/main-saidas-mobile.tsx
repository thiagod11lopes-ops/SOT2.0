import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AlarmDismissProvider } from "./context/alarm-dismiss-context";
import { BackupDeparturesLoader } from "./components/backup-departures-loader";
import { DeparturesProvider } from "./context/departures-context";
import { SyncPreferenceProvider } from "./context/sync-preference-context";
import { CatalogItemsProvider } from "./context/catalog-items-context";
import { UnlinkedOccurrencesProvider } from "./context/unlinked-occurrences-context";
import { AvisosProvider } from "./context/avisos-context";
import { EscalaPaoProvider } from "./context/escala-pao-context";
import { MotoristaPaoProvider } from "./context/motorista-pao-context";
import { RootErrorBoundary } from "./root-error-boundary";
import { SaidasMobileApp } from "./saidas-mobile/saidas-mobile-app";
import { ensureMobilePushServiceWorkerRegistered } from "./lib/mobilePushNotifications";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error('Elemento #root não encontrado no index.html.');
}

void ensureMobilePushServiceWorkerRegistered();

createRoot(rootEl).render(
  <StrictMode>
    <RootErrorBoundary>
      <SyncPreferenceProvider>
        <DeparturesProvider>
          <AlarmDismissProvider>
          <CatalogItemsProvider>
            <AvisosProvider>
              <MotoristaPaoProvider>
                <EscalaPaoProvider>
            <UnlinkedOccurrencesProvider>
              <BackupDeparturesLoader />
              <SaidasMobileApp />
            </UnlinkedOccurrencesProvider>
                </EscalaPaoProvider>
              </MotoristaPaoProvider>
            </AvisosProvider>
          </CatalogItemsProvider>
          </AlarmDismissProvider>
        </DeparturesProvider>
      </SyncPreferenceProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
