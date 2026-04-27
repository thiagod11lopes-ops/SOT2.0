import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BackupDeparturesLoader } from "./components/backup-departures-loader";
import { DeparturesProvider } from "./context/departures-context";
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
      <DeparturesProvider>
        <BackupDeparturesLoader />
        <SaidasMobileApp />
      </DeparturesProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
