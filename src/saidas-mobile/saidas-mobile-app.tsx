import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { SaidasLayout } from "./saidas-layout";
import { SaidasMobileFilterDateProvider } from "./saidas-mobile-filter-date-context";
import { SaidasPage } from "./saidas-page";

/** Vista mobile das saídas — mesmo IndexedDB que o resto do SOT (usa HashRouter: #/saidas/...). */
export function SaidasMobileApp() {
  return (
    <div className="saidas-mobile-scope min-h-dvh text-[hsl(var(--foreground))]">
      <HashRouter>
        <SaidasMobileFilterDateProvider>
        <Routes>
          <Route path="/saidas" element={<SaidasLayout />}>
            <Route index element={<Navigate to="administrativas" replace />} />
            <Route path="administrativas" element={<SaidasPage tipo="Administrativa" />} />
            <Route path="ambulancia" element={<SaidasPage tipo="Ambulância" />} />
          </Route>
          <Route path="*" element={<Navigate to="/saidas/administrativas" replace />} />
        </Routes>
        </SaidasMobileFilterDateProvider>
      </HashRouter>
    </div>
  );
}
