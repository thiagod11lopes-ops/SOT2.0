import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { DeparturesProvider } from "./context/departures-provider";
import { App } from "./App";
import "./index.css";

const rawBase = import.meta.env.BASE_URL;
const basename = rawBase === "/" ? "" : rawBase.replace(/\/$/, "");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <DeparturesProvider>
        <App />
      </DeparturesProvider>
    </BrowserRouter>
  </StrictMode>,
);
