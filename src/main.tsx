import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BackupDeparturesLoader } from "./components/backup-departures-loader";
import { CatalogItemsProvider } from "./context/catalog-items-context";
import { DeparturesProvider } from "./context/departures-context";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DeparturesProvider>
      <BackupDeparturesLoader />
      <CatalogItemsProvider>
        <App />
      </CatalogItemsProvider>
    </DeparturesProvider>
  </StrictMode>,
);
