import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MaterialEbenezerBoot } from "./components/material-ebenezer-boot";
import { MaterialControlePage } from "./components/material-controle-app";
import { MaterialControleProvider } from "./context/material-controle-context";
import { SyncPreferenceProvider } from "./context/sync-preference-context";
import { RootErrorBoundary } from "./root-error-boundary";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Elemento #root não encontrado no material.html.");
}

createRoot(rootEl).render(
  <StrictMode>
    <RootErrorBoundary>
      <SyncPreferenceProvider>
        <MaterialControleProvider store="avulso">
          <MaterialEbenezerBoot />
          <MaterialControlePage />
        </MaterialControleProvider>
      </SyncPreferenceProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
