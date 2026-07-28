import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppFirebaseLoadingShell } from "./components/app-firebase-loading-shell";
import { BackupDeparturesLoader } from "./components/backup-departures-loader";
import { AlarmDismissProvider } from "./context/alarm-dismiss-context";
import { AppTabProvider } from "./context/app-tab-context";
import { AppearanceProvider } from "./context/appearance-context";
import { CatalogItemsProvider } from "./context/catalog-items-context";
import { DeparturesReportEmailProvider } from "./context/departures-report-email-context";
import { DeparturesProvider } from "./context/departures-context";
import { DetalheServicoProvider } from "./context/detalhe-servico-context";
import { UnlinkedOccurrencesProvider } from "./context/unlinked-occurrences-context";
import { AvisosProvider } from "./context/avisos-context";
import { LimpezaPendenteProvider } from "./context/limpeza-pendente-context";
import { EscalaPaoProvider } from "./context/escala-pao-context";
import { MaterialControleProvider } from "./context/material-controle-context";
import { MotoristaPaoProvider } from "./context/motorista-pao-context";
import { RdvFirebaseSyncProvider } from "./context/rdv-firebase-sync-provider";
import { OficinaVisitasProvider } from "./context/oficina-visits-context";
import { ViaturasInoperantesProvider } from "./context/viaturas-inoperantes-context";
import { VehicleMaintenanceProvider } from "./context/vehicle-maintenance-context";
import { VehicleMaintenanceModals } from "./components/vehicle-maintenance-modals";
import { SiadDriverRequestSyncProvider } from "./context/siad-driver-request-sync-provider";
import { SyncPreferenceProvider } from "./context/sync-preference-context";
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
      <SyncPreferenceProvider>
        <SiadDriverRequestSyncProvider>
        <RdvFirebaseSyncProvider>
        <AppearanceProvider>
          <DeparturesReportEmailProvider>
            <AlarmDismissProvider>
              <DeparturesProvider>
                <UnlinkedOccurrencesProvider>
                <DetalheServicoProvider>
                <AppTabProvider>
                  <BackupDeparturesLoader />
                  <CatalogItemsProvider>
                    <AppFirebaseLoadingShell>
                    <LimpezaPendenteProvider>
                      <ViaturasInoperantesProvider>
                        <OficinaVisitasProvider>
                          <VehicleMaintenanceProvider>
                            <VehicleMaintenanceModals />
                            <AvisosProvider>
                              <MaterialControleProvider>
                              <MotoristaPaoProvider>
                                <EscalaPaoProvider>
                                  <App />
                                </EscalaPaoProvider>
                              </MotoristaPaoProvider>
                              </MaterialControleProvider>
                            </AvisosProvider>
                          </VehicleMaintenanceProvider>
                        </OficinaVisitasProvider>
                      </ViaturasInoperantesProvider>
                    </LimpezaPendenteProvider>
                    </AppFirebaseLoadingShell>
                  </CatalogItemsProvider>
                </AppTabProvider>
                </DetalheServicoProvider>
                </UnlinkedOccurrencesProvider>
              </DeparturesProvider>
            </AlarmDismissProvider>
          </DeparturesReportEmailProvider>
        </AppearanceProvider>
        </RdvFirebaseSyncProvider>
        </SiadDriverRequestSyncProvider>
      </SyncPreferenceProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
