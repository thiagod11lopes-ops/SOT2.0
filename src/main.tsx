import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BackupDeparturesLoader } from "./components/backup-departures-loader";
import { AlarmDismissProvider } from "./context/alarm-dismiss-context";
import { AppTabProvider } from "./context/app-tab-context";
import { AppearanceProvider } from "./context/appearance-context";
import { CatalogItemsProvider } from "./context/catalog-items-context";
import { DeparturesReportEmailProvider } from "./context/departures-report-email-context";
import { DeparturesProvider } from "./context/departures-context";
import { AvisosProvider } from "./context/avisos-context";
import { LimpezaPendenteProvider } from "./context/limpeza-pendente-context";
import { EscalaPaoProvider } from "./context/escala-pao-context";
import { MotoristaPaoProvider } from "./context/motorista-pao-context";
import { OficinaVisitasProvider } from "./context/oficina-visits-context";
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
      <AppearanceProvider>
        <SyncPreferenceProvider>
          <DeparturesReportEmailProvider>
            <AlarmDismissProvider>
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
            </AlarmDismissProvider>
          </DeparturesReportEmailProvider>
        </SyncPreferenceProvider>
      </AppearanceProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
