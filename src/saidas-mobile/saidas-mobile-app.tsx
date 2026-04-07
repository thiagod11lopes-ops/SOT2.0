import { useLayoutEffect } from "react";
import { HashRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { SaidasLayout } from "./saidas-layout";
import { SaidasMobileFilterDateProvider } from "./saidas-mobile-filter-date-context";
import { SaidasPage } from "./saidas-page";

/**
 * Ao abrir/recarregar o mobile, força `#/saidas/administrativas` (aba Administrativas).
 * Corre só na montagem — não interfere ao mudar para Ambulância depois.
 */
function SaidasMobileOpenOnAdministrativas() {
  const navigate = useNavigate();
  useLayoutEffect(() => {
    const raw = (window.location.hash || "").replace(/^#/, "") || "/";
    if (raw.startsWith("/saidas") && raw !== "/saidas/administrativas") {
      navigate("/saidas/administrativas", { replace: true });
    }
  }, [navigate]);
  return null;
}

/** Vista mobile das saídas — mesmo IndexedDB que o resto do SOT (usa HashRouter: #/saidas/...). */
export function SaidasMobileApp() {
  return (
    <div className="saidas-mobile-scope flex h-full min-h-0 w-full flex-col text-[hsl(var(--foreground))]">
      <HashRouter>
        <SaidasMobileOpenOnAdministrativas />
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
